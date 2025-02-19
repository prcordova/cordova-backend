import { Request, Response, NextFunction, RequestHandler } from 'express';
import { Knowledge, KnowledgeType } from '../models/Knowledge.model';
import { baseKnowledge } from '../knowledge';
import { learnFromGoogle } from './knowledge.controller';
import { findKnowledge } from './knowledge.controller';

export const detectKnowledgeType = (message: string): KnowledgeType => {
  const msgLower = message.toLowerCase();
  if (msgLower.match(/[\d\+\-\*\/\=]/)) return KnowledgeType.MATH;
  if (msgLower.match(/capital|país|continente|clima/i)) return KnowledgeType.GEOGRAPHY;
  if (msgLower.match(/presidente|política|governo|eleição|partido/i)) return KnowledgeType.POLITICS;
  return KnowledgeType.GENERAL;
};

const learnFromMessage = async (message: string) => {
  // Padrões de aprendizado
  const mathPattern = /(\d+\s*[\+\-\*\/]\s*\d+)\s*=\s*(\d+)/;
  const definitionPattern = /(?:o que é|significa|define-se como|é|são) (.+)/i;
  const capitalPattern = /a capital d[aeo] (.+) é (.+)/i;
  const presidentPattern = /(?:o presidente|líder) d[aeo] (.+) é (.+)/i;

  let match;

  if (match = message.match(mathPattern)) {
    const [_, expression, result] = match;
    const cleanExpression = expression.replace(/\s+/g, '');
    
    baseKnowledge.math.operations.set(cleanExpression, result);
    baseKnowledge.math.operations.set(expression, result);

    await Knowledge.create({
      content: `${expression} = ${result}`,
      source: 'user_teaching',
      type: KnowledgeType.MATH
    });
    return true;
  } 
  
  if (match = message.match(capitalPattern)) {
    const [_, country, capital] = match;
    baseKnowledge.geography.capitals.set(country.trim(), capital.trim());
    await Knowledge.create({
      content: message,
      source: 'user_conversation',
      type: KnowledgeType.GEOGRAPHY
    });
    return true;
  }
  
  if (match = message.match(presidentPattern)) {
    const [_, country, leader] = match;
    baseKnowledge.politics.leaders.set(country.trim(), leader.trim());
    await Knowledge.create({
      content: message,
      source: 'user_conversation',
      type: KnowledgeType.POLITICS
    });
    return true;
  }

  // Salva conversas gerais para contexto
  await Knowledge.create({
    content: message,
    source: 'user_conversation',
    type: detectKnowledgeType(message)
  });
  
  return false;
};

const generateResponse = async (message: string, knowledge: any[]) => {
  const msgLower = message.toLowerCase().trim();
  console.log('📝 Mensagem recebida:', message);

  // Busca mais específica baseada em palavras-chave
  const searchTerms = msgLower.split(' ').filter(term => term.length > 2);
  
  const query = {
    $or: [
      { content: { $regex: searchTerms.join('|'), $options: 'i' } },
      { content: { $regex: message, $options: 'i' } }
    ]
  };

  const results = await Knowledge.find(query)
    .sort({ _id: -1 })
    .limit(5);

  if (results.length > 0) {
    // Tenta encontrar a resposta mais relevante
    let bestMatch = results[0].content;
    
    // Se perguntou sobre estrutura HTML
    if (msgLower.includes('estrutura') && msgLower.includes('html')) {
      const htmlStructure = `A estrutura básica do HTML é:

<!DOCTYPE html>
<html>
<head>
    <title>Título da página</title>
</head>
<body>
    Conteúdo da página
</body>
</html>`;
      
      return htmlStructure;
    }

    // Remove URLs e conteúdo irrelevante
    bestMatch = bestMatch.replace(/https?:\/\/[^\s]+/g, '')
                        .replace(/[^\w\s<>\/="'{}().,;:-]/g, ' ')
                        .trim();

    // Extrai um trecho relevante
    const sentences = bestMatch.split(/[.!?]+/);
    const relevantSentences = sentences.filter(sentence => 
      searchTerms.some(term => sentence.toLowerCase().includes(term))
    );

    return relevantSentences.join('. ') || bestMatch;
  }

  return "Desculpe, ainda não tenho informações suficientes sobre isso. Você pode me ensinar compartilhando documentos ou links relevantes.";
};

const chatController = {
  chat: (async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { message } = req.body;
      console.log('🔍 Buscando por:', message);

      if (!message) {
        return res.status(400).json({ error: 'Mensagem é obrigatória' });
      }
      
      const relevantKnowledge = await Knowledge.find({
        content: { $regex: message, $options: 'i' }
      })
      .select('content')
      .limit(3);

      console.log('🎯 Total encontrado:', relevantKnowledge.length);
      
      const response = await generateResponse(message, relevantKnowledge);
      
      res.json({ response });
      return;
    } catch (error) {
      console.error('❌ Erro:', error);
      next(error);
      return;
    }
  }) as unknown as RequestHandler
};

export { chatController };