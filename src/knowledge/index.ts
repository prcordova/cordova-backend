import { mathKnowledge } from './math.knowledge';
import { geographyKnowledge } from './geography.knowledge';
import { politicsKnowledge } from './politics.knowledge';
import { Knowledge } from '../models/Knowledge.model';

// Carrega conhecimento do MongoDB na inicialização
const loadStoredKnowledge = async () => {
  const mathKnowledge = await Knowledge.find({ type: 'math' });
  mathKnowledge.forEach(k => {
    const match = k.content.match(/(.+)=(.+)/);
    if (match) {
      const [_, expression, result] = match;
      baseKnowledge.math.operations.set(expression.trim(), result.trim());
    }
  });
};

// Chama a função quando o servidor inicia
loadStoredKnowledge().catch(console.error);

export const baseKnowledge = {
  math: mathKnowledge,
  geography: geographyKnowledge,
  politics: politicsKnowledge,
  
  greetings: [
    "Olá! Como posso ajudar você hoje?",
    "Oi! Estou aqui para ajudar.",
    "Olá! Que bom ter você aqui."
  ]
}; 