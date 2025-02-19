import { Request, Response, NextFunction, RequestHandler } from 'express';
import { Knowledge } from '../models/Knowledge.model';
 

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

 

// Função para analisar e categorizar conteúdo
const analyzeContent = async (content: string) => {
  // Detecta padrões no conteúdo para classificação
  const patterns = await Knowledge.find({ type: 'pattern' });
  let analysis = {
    content,
    term: '',
    type: 'general',
    category: 'general',
    language: 'pt',
    relatedTerms: []
  };

  // Extrai termos e relações do conteúdo
  const words = content.toLowerCase().split(/\s+/);
  const uniqueTerms = new Set(words);
  
  analysis.term = words[0]; // termo principal é a primeira palavra
  analysis.relatedTerms = Array.from(uniqueTerms);

  // Aplica padrões encontrados no banco
  for (const pattern of patterns) {
    if (new RegExp(pattern.pattern, 'i').test(content)) {
      analysis.type = pattern.resultType;
      analysis.category = pattern.resultCategory;
      break;
    }
  }

  return analysis;
};
 

 
// Tipos e interfaces 
 
   

interface LLMResponse {
  content: string;
  confidence: number;
  source?: string;
}
 
 
 

const generateResponse = async (message: string): Promise<LLMResponse> => {
  try {
    // 1. Verifica cálculos
    const mathPattern = /(\d+\s*[\+\-\*\/]\s*\d+)/;
    const mathMatch = message.match(mathPattern);
    if (mathMatch) {
      const expression = mathMatch[1];
      const cleanExpr = expression.replace(/\s+/g, '');
      const result = eval(cleanExpr);
      return {
        content: `${cleanExpr} = ${result}`,
        confidence: 1
      };
    }

    // 2. Verifica se é comando de aprendizado
    if (message.toLowerCase().startsWith('aprenda')) {
      const content = message
        .replace(/^aprenda\s*["']?(.*)["']?.*$/i, '$1')
        .trim();

      // Analisa o conteúdo para identificar padrões e relações
      const analysis = await analyzeContent(content);

      await Knowledge.create({
        content: analysis.content,
        term: analysis.term,
        relatedTerms: analysis.relatedTerms,
        type: analysis.type,
        category: analysis.category,
        source: 'user_teaching',
        path: `${analysis.category}/${analysis.type}`,
        language: analysis.language,
        confidence: 1,
        timestamp: new Date()
      });

      return {
        content: `Aprendi sobre ${analysis.term}. Você pode me perguntar sobre isso.`,
        confidence: 1
      };
    }

    // 3. Busca conhecimento
    const searchTerm = message.toLowerCase()
      .replace(/[?.,!]/g, '')
      .trim();

    const knowledge = await Knowledge.aggregate([
      {
        $match: {
          $or: [
            { term: searchTerm },
            { relatedTerms: searchTerm },
            { content: { $regex: searchTerm, $options: 'i' } }
          ]
        }
      },
      {
        $sort: { timestamp: -1 }
      }
    ]);

    if (knowledge && knowledge.length > 0) {
      const mainConcept = knowledge[0];
      return {
        content: mainConcept.content,
        confidence: mainConcept.confidence || 0.8
      };
    }

    return {
      content: `Não encontrei informações sobre "${searchTerm}". Você pode me ensinar usando o comando 'aprenda'.`,
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