import { Request, Response, NextFunction, RequestHandler } from 'express';
import { Knowledge } from '../models/Knowledge.model';
import { baseKnowledge as initialKnowledge } from '../knowledge';
import { learnFromGoogle, findKnowledge } from './knowledge.controller';

// Interface para definições base
interface Definition {
  term: string;
  description: string;
  category: string;
}

interface BaseKnowledge {
  math: {
    operations: Map<string, string>;
  };
  geography: {
    capitals: Map<string, string>;
  };
  politics: {
    leaders: Map<string, string>;
  };
  definitions: Definition[];
}

const baseKnowledge: BaseKnowledge = {
  math: {
    operations: new Map()
  },
  geography: {
    capitals: new Map()
  },
  politics: {
    leaders: new Map()
  },
  definitions: []
};

interface TokenizedContent {
  term: string;
  tokens: string[];
  embedding?: number[];
}

const tokenize = (text: string): TokenizedContent => {
  const tokens = text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(token => token.length > 0);

  return {
    term: text,
    tokens
  };
};

// Função para analisar e categorizar conteúdo
const analyzeContent = async (message: string) => {
  const tokens = message.toLowerCase().split(/\s+/);
  
  // Detecta padrões de conteúdo
  const patterns = {
    programming: ['tag', 'html', 'css', 'javascript', 'código', 'função', 'variável'],
    math: ['número', 'soma', 'multiplicação', 'divisão', 'equação'],
    technology: ['software', 'hardware', 'computador', 'internet', 'rede'],
    // Outros padrões serão aprendidos do conteúdo
  };

  // Analisa tokens para identificar categoria
  const categoryScores = new Map<string, number>();
  
  // 1. Analisa baseado em padrões existentes
  for (const [category, keywords] of Object.entries(patterns)) {
    const score = tokens.filter(token => keywords.includes(token)).length;
    if (score > 0) categoryScores.set(category, score);
  }

  // 2. Busca relações existentes no banco
  const relatedContent = await Knowledge.find({
    tokens: { $in: tokens },
    category: { $exists: true }
  });

  // 3. Aprende com conteúdo relacionado
  relatedContent.forEach(content => {
    if (content.category) {
      const currentScore = categoryScores.get(content.category) || 0;
      categoryScores.set(content.category, currentScore + 1);
    }
  });

  // 4. Identifica a categoria mais provável
  let bestCategory = 'general';
  let bestScore = 0;

  categoryScores.forEach((score, category) => {
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  });

  // 5. Aprende novos padrões
  await Knowledge.create({
    content: message,
    tokens,
    category: bestCategory,
    patterns: tokens,
    confidence: bestScore / tokens.length,
    timestamp: new Date(),
    source: 'auto_learning'
  });

  return {
    category: bestCategory,
    confidence: bestScore / tokens.length,
    tokens
  };
};

const learnFromMessage = async (message: string) => {
  try {
    // Analisa o conteúdo
    const analysis = await analyzeContent(message);
    
    // Salva o conhecimento categorizado
    await Knowledge.create({
      content: message,
      category: analysis.category,
      tokens: analysis.tokens,
      confidence: analysis.confidence,
      timestamp: new Date(),
      source: 'user_input'
    });

    console.log(`📚 Aprendido: ${message} (${analysis.category})`);
    return true;

  } catch (error) {
    console.error('❌ Erro ao aprender:', error);
    return false;
  }
};

const processContent = (content: string) => {
  // Remove conteúdo irrelevante
  content = content
    .replace(/Tutorials.*?Newsletter/g, '')
    .replace(/×.*?×/g, '')
    .replace(/❮.*?❯/g, '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/https?:\/\/[^\s]+/g, '')
    .trim();

  // Extrai definição e exemplo
  const definitionMatch = content.match(/Definition and Usage[\s\S]*?(?=Browser Support|Example)/i);
  const exampleMatch = content.match(/Example[\s\S]*?(?=Definition and Usage|Browser Support)/i);

  if (definitionMatch || exampleMatch) {
    let response = '';
    
    if (definitionMatch) {
      response += definitionMatch[1].trim() + '\n\n';
    }
    
    if (exampleMatch) {
      response += 'Exemplo:\n' + exampleMatch[1].trim();
    }
    
    return response.trim();
  }

  return content;
};

// Tipos e interfaces
interface TopicMatch {
  relevance: number;
  content: string;
  source: string;
  path: string;
}

enum QuestionCategory {
  HTML = 'html',
  CSS = 'css',
  JAVASCRIPT = 'javascript',
  GENERAL = 'general'
}

// Funções auxiliares
const extractTopics = (message: string): string[] => {
  // Remove pontuação e palavras comuns
  const cleanMessage = message
    .toLowerCase()
    .replace(/[?.,!]/g, '')
    .replace(/o que é|como|usar|me explique|sobre/g, '')
    .trim();

  // Identifica tags HTML
  const tagMatch = cleanMessage.match(/<(\w+)>|(?:tag|elemento)\s+(\w+)/i);
  if (tagMatch) {
    return [tagMatch[1] || tagMatch[2]];
  }

  // Procura termos HTML conhecidos
  const htmlTerms = ['html', 'head', 'body', 'div', 'span', 'p', 'a', 'img'];
  const words = cleanMessage.split(' ');
  const topics = words.filter(word => 
    htmlTerms.includes(word) || 
    word.length > 2
  );

  return topics;
};

const detectQuestionType = (message: string): string => {
  if (message.match(/o que|qual|defina|explique/i)) return 'definition';
  if (message.match(/como|usar|exemplo/i)) return 'usage';
  if (message.match(/diferença|comparar|versus|vs/i)) return 'comparison';
  return 'general';
};

const detectCategory = (message: string): QuestionCategory => {
  // Prioriza detecção de HTML
  if (message.match(/<\w+>|tag|elemento|html|doctype/i)) {
    return QuestionCategory.HTML;
  }
  if (message.match(/css|estilo|layout|design/i)) return QuestionCategory.CSS;
  if (message.match(/javascript|js|função|variável/i)) return QuestionCategory.JAVASCRIPT;
  return QuestionCategory.GENERAL;
};

const findRelatedContext = async (message: string): Promise<string[]> => {
  const recentQuestions = await Knowledge.find({
    type: 'user_conversation',
    timestamp: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
  })
  .sort({ timestamp: -1 })
  .limit(5)
  .select('content');

  return recentQuestions.map(q => q.content);
};

const calculateRelevance = (match: any, analysis: any): number => {
  let score = 0;
  
  // Relevância por tópicos
  analysis.mainTopics.forEach((topic: string) => {
    if (match.content.toLowerCase().includes(topic)) score += 2;
  });
  
  // Relevância por categoria
  if (match.category === analysis.category) score += 3;
  
  // Relevância por fonte
  if (match.source === 'w3schools') score += 2;
  
  return score;
};

const searchInDocumentation = async (analysis: any): Promise<TopicMatch[]> => {
  // Implementação futura para busca em documentação
  return [];
};

const combineInformation = async (matches: TopicMatch[], analysis: any): Promise<string> => {
  const bestMatch = matches[0];
  return bestMatch.content
    .replace(/Tutorials.*?Newsletter/g, '')
    .replace(/[^\w\s<>\/="'.,()-]/g, '')
    .trim();
};

const searchExternalSources = async (analysis: any): Promise<any> => {
  // Implementação futura para busca externa
  return null;
};

const saveNewKnowledge = async (knowledge: any, analysis: any): Promise<void> => {
  await Knowledge.create({
    content: knowledge.content,
    type: 'external_source',
    source: knowledge.source,
    timestamp: new Date()
  });
};

interface Source {
  name: string;     // ex: 'w3schools'
  category: string; // ex: 'documentation'
  path: string;     // ex: 'html/tags'
}

interface SearchResult {
  content: string;
  source: string;
  path: string;
  relevance: number;
}

interface QueryContext {
  type: string;      // 'math', 'definition', 'concept', etc
  subject?: string;  // 'algebra', 'geometry', 'history', etc
  operation?: string;// 'addition', 'multiplication', 'theorem', etc
}

const analyzeQuery = (message: string): QueryContext => {
  const cleanMessage = message.toLowerCase().trim();
  
  // Detecta contexto matemático
  if (/^[\d\s+\-*/()]+$/.test(cleanMessage)) {
    return { 
      type: 'math',
      subject: 'arithmetic',
      operation: 'calculation'
    };
  }

  // Detecta perguntas sobre teoremas/fórmulas
  if (cleanMessage.includes('teorema') || cleanMessage.includes('fórmula')) {
    return {
      type: 'math',
      subject: 'theory',
      operation: 'definition'
    };
  }

  // Detecta perguntas sobre conceitos
  if (cleanMessage.startsWith('o que é') || cleanMessage.startsWith('como')) {
    return {
      type: 'definition',
      subject: 'concept'
    };
  }

  return { type: 'general' };
};

interface EmbeddingVector {
  content: string;
  vector: number[];
  tokens: string[];
}

interface LLMResponse {
  content: string;
  confidence: number;
  source?: string;
}

const generateResponse = async (message: string): Promise<LLMResponse> => {
  console.log('📝 Processando mensagem:', message);

  try {
    // 1. Verifica se é expressão matemática
    const mathPattern = /(\d+\s*[\+\-\*\/]\s*\d+)/;
    const mathMatch = message.match(mathPattern);

    if (mathMatch) {
      const expression = mathMatch[1];
      const cleanExpr = expression.replace(/\s+/g, '');
      try {
        const result = eval(cleanExpr);
        if (Number.isFinite(result)) {
          return {
            content: `${cleanExpr} = ${result}`,
            confidence: 1
          };
        }
      } catch (error) {
        console.error('❌ Erro no cálculo:', error);
      }
    }

    // 2. Busca mais abrangente no banco
    const searchTerm = message.toLowerCase().trim();
    const knowledge = await Knowledge.findOne({
      $or: [
        // Busca exata
        { content: { $regex: new RegExp(`\\b${searchTerm}\\b`, 'i') } },
        // Busca no início de frases
        { content: { $regex: new RegExp(`^${searchTerm}\\b|\\. ${searchTerm}\\b`, 'i') } },
        // Busca em definições
        { content: { $regex: new RegExp(`${searchTerm}\\s+(?:is|are|é|são|significa|means)`, 'i') } },
        // Busca em tags HTML
        { content: { $regex: new RegExp(`<${searchTerm}[^>]*>|tag\\s+${searchTerm}`, 'i') } }
      ]
    }).sort({ 
      // Prioriza conteúdo mais relevante
      source: -1,
      timestamp: -1 
    });

    if (knowledge) {
      // Extrai a parte mais relevante do conteúdo
      const relevantContent = extractRelevantContent(knowledge.content, searchTerm);
      
      return {
        content: relevantContent,
        confidence: 0.8
      };
    }

    return {
      content: `Não encontrei uma definição para "${message}". Você pode me ensinar?`,
      confidence: 0
    };

  } catch (error) {
    console.error('❌ Erro:', error);
    return {
      content: "Ocorreu um erro ao processar sua pergunta.",
      confidence: 0
    };
  }
};

const extractRelevantContent = (content: string, term: string): string => {
  // Remove tags HTML
  const cleanContent = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  
  // Procura por sentenças contendo o termo
  const sentences = cleanContent.split(/[.!?]+/);
  const relevantSentences = sentences.filter(sentence => 
    sentence.toLowerCase().includes(term.toLowerCase())
  );

  if (relevantSentences.length > 0) {
    return relevantSentences[0].trim();
  }

  return cleanContent;
};

// Função para aprender de novas fontes
const learnFromSource = async (url: string, content: string) => {
  const source = new URL(url);
  const path = source.pathname
    .split('/')
    .filter(Boolean)
    .join('/');

  await Knowledge.create({
    content,
    source: source.hostname,
    path,
    timestamp: new Date()
  });
};

// Função para avaliar expressões matemáticas
const evaluateExpression = (expr: string): number => {
  try {
    // Remove espaços e caracteres especiais
    const cleanExpr = expr.replace(/[^0-9+\-*\/()]/g, '');
    return eval(cleanExpr);
  } catch {
    return NaN;
  }
};

// Função para popular o banco com expressões matemáticas
const populateBasicMath = async () => {
  try {
    // Verifica se já existem dados
    const existingMath = await Knowledge.findOne({ source: 'basic_math' });
    if (existingMath) return;

    const basicExpressions = [];
    
    // Expressões básicas (como antes)
    for (let i = 0; i <= 10; i++) {
      for (let j = 0; j <= 10; j++) {
        // Adição
        basicExpressions.push({
          content: `${i} + ${j} = ${i + j}`,
          source: 'basic_math',
          path: 'addition',
          timestamp: new Date()
        });

        // Multiplicação
        basicExpressions.push({
          content: `${i} * ${j} = ${i * j}`,
          source: 'basic_math',
          path: 'multiplication',
          timestamp: new Date()
        });

        // Expressões combinadas
        const combined = `${i} + ${j} * 10`;
        basicExpressions.push({
          content: `${combined} = ${evaluateExpression(combined)}`,
          source: 'basic_math',
          path: 'combined',
          timestamp: new Date()
        });

        const combined2 = `${i} * 10 + ${j}`;
        basicExpressions.push({
          content: `${combined2} = ${evaluateExpression(combined2)}`,
          source: 'basic_math',
          path: 'combined',
          timestamp: new Date()
        });
      }
    }

    // Subtração (apenas resultados não negativos)
    for (let i = 0; i <= 10; i++) {
      for (let j = 0; j <= i; j++) {
        basicExpressions.push({
          content: `${i} - ${j} = ${i - j}`,
          source: 'basic_math',
          path: 'subtraction',
          timestamp: new Date()
        });
      }
    }

    // Divisão (apenas resultados inteiros)
    for (let i = 1; i <= 10; i++) {
      for (let j = 1; j <= 10; j++) {
        const result = i * j;
        basicExpressions.push({
          content: `${result} / ${i} = ${j}`,
          source: 'basic_math',
          path: 'division',
          timestamp: new Date()
        });
      }
    }

    await Knowledge.insertMany(basicExpressions);
    console.log('✅ Base matemática populada com sucesso!');

  } catch (error) {
    console.error('❌ Erro ao popular base matemática:', error);
  }
};

// Chama a função quando o servidor iniciar
populateBasicMath();

const chatController = {
  chat: (async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { message } = req.body;
      console.log('🔍 Buscando por:', message);

      if (!message) {
        return res.status(400).json({ error: 'Mensagem é obrigatória' });
      }
      
      const response = await generateResponse(message);
      
      // Verifica se response existe e tem content
      if (!response || !response.content) {
        return res.status(404).json({ 
          response: 'Desculpe, não consegui processar sua pergunta.' 
        });
      }
      
      // Retorna o conteúdo da resposta
      res.json({ response: response.content });

    } catch (error) {
      console.error('❌ Erro:', error);
      res.status(500).json({ 
        error: 'Erro interno ao processar mensagem' 
      });
    }
  }) as unknown as RequestHandler
};

export { chatController };