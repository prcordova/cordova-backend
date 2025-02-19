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

  // Saudações
  if (msgLower.match(/^(oi|olá|hey|hi|hello)$/)) {
    return baseKnowledge.greetings[Math.floor(Math.random() * baseKnowledge.greetings.length)];
  }

  // Se está ensinando (contém =)
  if (message.includes('=')) {
    const learned = await learnFromMessage(message);
    return learned ? 
      "Obrigado por me ensinar! Agora sei a resposta." : 
      "Desculpe, não entendi bem essa expressão.";
  }
  
  // Se está perguntando
  const answer = await findKnowledge(message);
  if (answer) {
    return answer;
  }

  // Se não encontrou resposta
  if (message.match(/\d+\s*[\+\-\*x\/]\s*\d+/)) {
    return "Desculpe, ainda não sei essa resposta. Você pode me ensinar?";
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