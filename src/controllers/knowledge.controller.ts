import { Request, Response, NextFunction, RequestHandler } from 'express';
import { Knowledge } from '../models/Knowledge.model';
import axios from 'axios';
import * as cheerio from 'cheerio';
import pdf from 'pdf-parse';

// Interface para a resposta do Bing
interface BingResponse {
  webPages?: {
    value: Array<{
      name: string;
      url: string;
      snippet: string;
    }>;
  };
  computation?: {
    expression: string;
    value: string;
  };
}

export const learnFromGoogle = async (query: string) => {
  try {
    console.log('🔍 Iniciando busca no Bing:', query);

    if (!process.env.BING_API_KEY) {
      throw new Error('BING_API_KEY não configurada no .env');
    }

    const response = await axios.get<BingResponse>('https://api.bing.microsoft.com/v7.0/search', {
      headers: {
        'Ocp-Apim-Subscription-Key': process.env.BING_API_KEY,
        'Accept-Language': 'pt-BR'
      },
      params: {
        q: query,
        mkt: 'pt-BR',
        responseFilter: 'Computation,Webpages',
        count: 10
      }
    });

    const searchResults: string[] = [];

    // Verifica se tem resultado de cálculo
    if (response.data.computation) {
      const { expression, value } = response.data.computation;
      searchResults.push(`${expression} = ${value}`);
    }

    // Verifica resultados da web
    if (response.data.webPages?.value) {
      for (const result of response.data.webPages.value) {
        const text = result.snippet.trim();
        
        // Para perguntas matemáticas
        if (/\d/.test(query)) {
          if (/\d.*=.*\d/.test(text)) {
            searchResults.push(text);
          }
        } else {
          // Para outras perguntas
          searchResults.push(text);
        }
      }
    }

    console.log('📝 Resultados encontrados:', searchResults.length);

    if (searchResults.length > 0) {
      for (const content of searchResults) {
        if (!content.includes('http') && content.length < 500) {
          console.log('💾 Salvando:', content);
          await Knowledge.create({
            content,
            source: 'bing_search',
            type: 'general'
          });
        }
      }
      console.log('✅ Conhecimento salvo com sucesso');
      return true;
    }

    console.log('❌ Nenhum resultado relevante encontrado');
    return false;

  } catch (error) {
    console.error('❌ Erro ao buscar no Bing:', error.message);
    if (axios.isAxiosError(error)) {
      console.error('Detalhes:', error.response?.data);
    }
    return false;
  }
};

export const learnFromMessage = async (message: string) => {
  try {
    console.log('📝 Aprendendo:', message);
    
    if (message.includes('=')) {
      const [expression, result] = message.split('=').map(s => s.trim());
      
      // Função para calcular expressão
      const calculateExpression = (expr: string): number => {
        const numbers = expr.split(/[\+\-\*x\/]/).map(Number);
        const operators = expr.match(/[\+\-\*x\/]/g) || [];
        
        let result = numbers[0];
        for (let i = 0; i < operators.length; i++) {
          const operator = operators[i];
          const nextNum = numbers[i + 1];
          
          switch(operator) {
            case '+': result += nextNum; break;
            case '-': result -= nextNum; break;
            case '*': case 'x': result *= nextNum; break;
            case '/': result /= nextNum; break;
          }
        }
        
        return result;
      };

      // Valida se é uma expressão matemática
      if (/^\d+(\s*[\+\-\*x\/]\s*\d+)*$/.test(expression)) {
        const calculatedResult = calculateExpression(expression);
        
        if (calculatedResult === Number(result)) {
          const content = `${expression} = ${result}`;
          console.log('✅ Expressão válida:', content);
          
          // Evita duplicatas
          const existing = await Knowledge.findOne({ 
            content,
            type: 'math'
          });

          if (!existing) {
            await Knowledge.create({
              content,
              source: 'user_teaching',
              type: 'math'
            });
          }
          
          return true;
        }
      }
    }
    
    // Processar o chunk como texto normal
    // ... resto do código existente para processamento de texto ...
    
    return 'Chunk processado com sucesso';
  } catch (error) {
    console.error('❌ Erro ao processar chunk:', error);
    throw error;
  }
};

export const processWebContent = async (content: string, url: string) => {
  try {
    console.log('🔍 Processando conteúdo da web');
    
    // Extrai expressões matemáticas completas
    const mathPattern = /(\d+)\s*([\+\-\*x\/])\s*(\d+)\s*=\s*(\d+)/g;
    const matches = content.matchAll(mathPattern);
    
    let count = 0;
    for (const match of Array.from(matches)) {
      const [_, num1, operator, num2, result] = match;
      
      // Valida o resultado
      let calculated;
      switch(operator) {
        case '+': calculated = Number(num1) + Number(num2); break;
        case '-': calculated = Number(num1) - Number(num2); break;
        case '*': case 'x': calculated = Number(num1) * Number(num2); break;
        case '/': calculated = Number(num1) / Number(num2); break;
      }
      
      if (calculated === Number(result)) {
        const expression = `${num1} ${operator} ${num2} = ${result}`;
        
        // Evita duplicatas
        const existing = await Knowledge.findOne({
          content: expression,
          type: 'math'
        });
        
        if (!existing) {
          await Knowledge.create({
            content: expression,
            source: 'web',
            type: 'math',
            url
          });
          count++;
        }
      }
    }
    
    console.log(`✅ Salvos ${count} cálculos válidos`);
    return count > 0;
  } catch (error) {
    console.error('❌ Erro ao processar conteúdo:', error);
    return false;
  }
};

export const findKnowledge = async (query: string) => {
  try {
    console.log('🔍 Buscando:', query);
    
    // Limpa a query
    const searchQuery = query
      .replace(/[?]/g, '')
      .replace(/quanto[é|e]/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Função para calcular expressão completa
    const calculateExpression = (expression: string): number => {
      const numbers = expression.split(/[\+\-\*x\/]/).map(Number);
      const operators = expression.match(/[\+\-\*x\/]/g) || [];
      
      let result = numbers[0];
      for (let i = 0; i < operators.length; i++) {
        const operator = operators[i];
        const nextNum = numbers[i + 1];
        
        switch(operator) {
          case '+': result += nextNum; break;
          case '-': result -= nextNum; break;
          case '*': case 'x': result *= nextNum; break;
          case '/': result /= nextNum; break;
        }
      }
      
      return result;
    };

    // Extrai a expressão matemática completa
    const mathMatch = searchQuery.match(/(\d+\s*[\+\-\*x\/]\s*\d+\s*[\+\-\*x\/\s\d]*)/);
    if (mathMatch) {
      const expression = mathMatch[0].replace(/\s+/g, ' ').trim();
      const result = calculateExpression(expression);
      
      // Formata a expressão para salvar
      const formattedExpression = `${expression} = ${result}`;
      console.log('🔢 Expressão calculada:', formattedExpression);
      
      // Verifica se já existe no banco
      const knowledge = await Knowledge.findOne({
        type: 'math',
        content: formattedExpression
      });
      
      if (knowledge) {
        return knowledge.content;
      }
      
      // Se não encontrou, salva e retorna
      console.log('📚 Salvando novo conhecimento:', formattedExpression);
      await Knowledge.create({
        content: formattedExpression,
        source: 'calculated',
        type: 'math'
      });
      
      return formattedExpression;
    }
    
    return null;
  } catch (error) {
    console.error('❌ Erro ao buscar:', error);
    return null;
  }
};

export const generateMathResponse = (knowledge: any[]) => {
  if (knowledge.length > 0) {
    // Retorna apenas a expressão com resultado
    return knowledge[0].content.trim();
  }
  return null;
};

const knowledgeController = {
  learn: (async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { url } = req.body;
      console.log('🌐 Processando URL:', url);

      if (!url) {
        return res.status(400).json({ error: 'URL é obrigatória' });
      }

      let text;

      if (url.endsWith('.pdf')) {
        const pdfData = await axios.get(url, { responseType: 'arraybuffer' });
        const data = await pdf(pdfData.data);
        text = data.text;
      } else {
        // Verifica se é uma página com múltiplos PDFs
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        
        // Coleta todos os links PDF da página
        const pdfLinks = $('a[href$=".pdf"]')
          .map((_, el) => $(el).attr('href'))
          .get();

        console.log('📑 PDFs encontrados:', pdfLinks.length);

        if (pdfLinks.length > 0) {
          // Processa cada PDF encontrado
          const results = [];
          for (const pdfUrl of pdfLinks) {
            try {
              console.log('📥 Baixando PDF:', pdfUrl);
              const pdfData = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
              const data = await pdf(pdfData.data);
              
              console.log('💾 Salvando conteúdo, tamanho:', data.text.length);
              const knowledge = new Knowledge({
                content: data.text,
                source: pdfUrl,
              });
              
              await knowledge.save();
              console.log('✅ PDF processado com sucesso:', pdfUrl);
              
              results.push({
                url: pdfUrl,
                success: true,
                length: data.text.length
              });
            } catch (error) {
              console.error('❌ Erro ao processar PDF:', pdfUrl, error);
              results.push({
                url: pdfUrl,
                success: false,
                error: error.message
              });
            }
          }
          
          // Verifica se algo foi salvo
          const totalSaved = await Knowledge.countDocuments();
          console.log('📊 Total de documentos na base:', totalSaved);
          
          return res.json({
            success: true,
            message: `Processados ${results.length} PDFs`,
            results
          });
        }
        const existingKnowledge = await Knowledge.findOne({ source: url });
        if (existingKnowledge) {
          return res.status(400).json({ error: 'URL já foi processada anteriormente' });
        }
        // Se não encontrou PDFs, processa a página normalmente
        console.log('🔍 Processando página HTML');
        $('script').remove();
        $('style').remove();
        text = $('body').text().trim().replace(/\s+/g, ' ');
      }
      
      const knowledge = new Knowledge({
        content: text,
        source: url,
      });
      
      await knowledge.save();
      console.log('✅ Página HTML processada, tamanho:', text.length);
      
      res.json({ 
        success: true, 
        message: 'Conhecimento adquirido com sucesso!',
        length: text.length
      });
      return;
    } catch (error) {
      console.error('❌ Erro geral:', error);
      next(error);
      return;
    }
  }) as unknown as RequestHandler,

  list: (async (req: Request, res: Response, next: NextFunction) => {
    try {
      const knowledge = await Knowledge.find({})
        .select('source timestamp')
        .sort('-timestamp');
      res.json(knowledge);
      return;
    } catch (error) {
      next(error);
      return;
    }
  }) as unknown as RequestHandler,

  upload: (async (req, res, next) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado' });
      }

      const pdfData = await axios.get(file.path, { responseType: 'arraybuffer' });
      const data = await pdf(pdfData.data);

      const knowledge = new Knowledge({
        content: data.text,
        source: file.path,
      });

      await knowledge.save();

      res.json({ success: true, message: 'Arquivo processado com sucesso!' });
      return;
    } catch (error) {
      next(error);
      return;
    }

  }) as unknown as RequestHandler,

  processInput: async (message: string) => {
    if (message.startsWith('@https://www.google.com/search')) {
      const url = new URL(message.slice(1));
      const query = url.searchParams.get('q');
      if (query) {
        const learned = await learnFromGoogle(query);
        return learned 
          ? "Aprendi novos conceitos através do Google Search!"
          : "Desculpe, não consegui aprender com essa busca.";
      }
    }
    // ... resto do código
  }
};

export { knowledgeController }; 