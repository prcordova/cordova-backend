import { Request, Response, NextFunction, RequestHandler } from 'express';
import { Knowledge } from '../models/Knowledge.model';
import { baseKnowledge as initialKnowledge } from '../knowledge';
import { learnFromGoogle, findKnowledge } from './knowledge.controller';
import { franc } from 'franc'; // Para detectar idioma
import { translate } from '@vitalets/google-translate-api'; // Para tradução

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
  // Padrões de aprendizado dinâmicos
  const patterns = [
    {
      regex: /(\d+\s*[\+\-\*\/]\s*\d+)\s*=\s*(\d+)/,
      type: 'math',
      extract: (match: RegExpMatchArray) => ({
        term: match[1].replace(/\s+/g, ''),
        value: match[2],
        category: 'calculation'
      })
    },
    {
      regex: /(?:o que é|significa|define-se como|é|são) (.+)/i,
      type: 'definition',
      extract: (match: RegExpMatchArray) => ({
        term: match[1].trim(),
        value: message,
        category: 'concept'
      })
    },
    {
      regex: /a capital d[aeo] (.+) é (.+)/i,
      type: 'location',
      extract: (match: RegExpMatchArray) => ({
        term: match[1].trim(),
        value: match[2].trim(),
        category: 'capital'
      })
    },
    {
      regex: /(?:o presidente|líder) d[aeo] (.+) é (.+)/i,
      type: 'person',
      extract: (match: RegExpMatchArray) => ({
        term: match[1].trim(),
        value: match[2].trim(),
        category: 'leader'
      })
    }
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern.regex);
    if (match) {
      const data = pattern.extract(match);
      await Knowledge.create({
        term: data.term,
        content: data.value,
        type: pattern.type,
        category: data.category,
        source: 'user_teaching',
        timestamp: new Date()
      });
      return true;
    }
  }

  // Salva mensagem geral para contexto
  await Knowledge.create({
    content: message,
    type: 'conversation',
    source: 'user_input',
    timestamp: new Date()
  });
  
  return false;
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

interface TranslationMap {
  [key: string]: {
    [key: string]: string;
  };
}

 
interface DictionaryResponse {
  word: string;
  meanings: string[];
  language: string;
  source: string;
}

const searchDictionaries = async (term: string, lang: string): Promise<DictionaryResponse | null> => {
  try {
    const cached = await Knowledge.findOne({
      term: term.toLowerCase(),
      language: lang,
      type: 'dictionary'
    });

    if (cached) {
      return {
        word: cached.term,
        meanings: [cached.content],
        language: cached.language,
        source: cached.source
      };
    }

    return null;
  } catch (error) {
    console.error('❌ Erro na busca em dicionários:', error);
    return null;
  }
};

const generateResponse = async (message: string): Promise<LLMResponse> => {
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

    // 2. Verifica se é comando de aprendizado
    if (message.toLowerCase().startsWith('aprenda')) {
      const content = message
        .replace(/^aprenda\s*["'](.*)["'].*$/i, '$1')
        .trim();

      // Analisa o conteúdo para determinar o tipo
      const contentType = analyzeContentType(content);
      const term = extractTerm(content, contentType);

      if (!term) {
        return {
          content: 'Não consegui identificar o termo. Pode ser mais específico?',
          confidence: 0
        };
      }

      // Salva o conhecimento de forma dinâmica
      await Knowledge.create({
        content,
        type: contentType.type,
        category: contentType.category,
        source: 'user_teaching',
        path: `${contentType.category}/${contentType.type}`,
        language: 'pt',
        term: term.toLowerCase(),
        confidence: 1,
        timestamp: new Date()
      });

      return {
        content: `Obrigado! Aprendi sobre ${term} na categoria ${contentType.category}.`,
        confidence: 1
      };
    }

    // 3. Busca normal
    const searchTerm = message.toLowerCase()
      .replace(/[?.,!]/g, '')
      .replace(/o que é|what is|que es|como usar|how to use/g, '')
      .trim();

    // 4. Busca dinâmica pelo termo
    const knowledge = await Knowledge.findOne({
      term: searchTerm
    }).sort({ timestamp: -1 });

    if (knowledge) {
      return {
        content: formatResponse(knowledge),
        confidence: knowledge.confidence || 0.8
      };
    }

    return {
      content: `Não encontrei uma definição para "${searchTerm}". Você pode me ensinar usando 'aprenda "definição"'`,
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

const analyzeContentType = (content: string) => {
  // Detecta padrões no conteúdo
  if (content.match(/<[^>]+>|tag|html|css/i)) {
    return { type: 'element', category: 'html' };
  }
  if (content.match(/presidente|governo|política|ministro/i)) {
    return { type: 'concept', category: 'politics' };
  }
  if (content.match(/\d+\s*[\+\-\*\/]\s*\d+/)) {
    return { type: 'operation', category: 'math' };
  }
  if (content.match(/capital|país|cidade|estado/i)) {
    return { type: 'location', category: 'geography' };
  }
  // Categoria padrão para outros tipos de conteúdo
  return { type: 'concept', category: 'general' };
};

const extractTerm = (content: string, contentType: { type: string, category: string }) => {
  switch (contentType.category) {
    case 'html':
      return content.match(/<(\w+)[^>]*>|(?:tag|elemento)\s+(\w+)/i)?.[1] || null;
    case 'politics':
      return content.match(/(?:sobre|presidente|política)\s+(\w+)/i)?.[1] || null;
    case 'geography':
      return content.match(/(?:capital|país|cidade)\s+(\w+)/i)?.[1] || null;
    default:
      // Extrai o primeiro substantivo relevante
      return content.split(/\s+/)[0];
  }
};

const formatResponse = (knowledge: any) => {
  switch (knowledge.category) {
    case 'html':
      return `A tag <${knowledge.term}> é ${knowledge.content}`;
    case 'politics':
      return `${knowledge.term}: ${knowledge.content}`;
    case 'geography':
      return `${knowledge.term} é ${knowledge.content}`;
    default:
      return knowledge.content;
  }
};

const removeDuplicateContent = (results: any[]): any[] => {
  const seen = new Set();
  return results.filter(item => {
    const cleanContent = item.content
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    
    if (seen.has(cleanContent)) return false;
    seen.add(cleanContent);
    return true;
  });
};

const validateContentUtility = (results: any[]): any[] => {
  return results.filter(item => {
    const content = item.content.toLowerCase();
    
    // Critérios de utilidade
    const hasDefinition = content.includes('is') || content.includes('means') || content.includes('defines');
    const hasTechnicalContext = content.includes('tag') || content.includes('element') || content.includes('attribute');
    const hasNoiseWords = content.includes('login') || content.includes('menu') || content.includes('javascript needs');
    const isTooShort = content.length < 20;
    const isTooLong = content.length > 500;

    return (hasDefinition || hasTechnicalContext) && !hasNoiseWords && !isTooShort && !isTooLong;
  });
};

const cleanAndExtractDefinition = (content: string, term: string): string => {
  // Remove conteúdo indesejado
  content = content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
    .replace(/JavaScript|precisa|ativar|Google Drive/gi, '')
    .replace(/menu|login|copyright|navigation/gi, '');

  // Procura pela definição mais relevante
  const definitionPatterns = [
    new RegExp(`<${term}[^>]*>.*?<\/${term}>.*?(?=\\.|$)`, 'i'),
    new RegExp(`${term}\\s+(?:tag|element).*?(?=\\.|$)`, 'i'),
    new RegExp(`(?:defines|specifies|is).*?${term}.*?(?=\\.|$)`, 'i')
  ];

  for (const pattern of definitionPatterns) {
    const match = content.match(pattern);
    if (match) {
      return match[0]
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    }
  }

  return '';
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