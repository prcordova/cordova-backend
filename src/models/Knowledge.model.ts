import mongoose, { Schema, model } from 'mongoose';

interface IKnowledge {
  content: string;
  category?: string;
  tokens?: string[];
  source: string;
  path: string;
  timestamp: Date;
  embeddings?: number[];
}

const KnowledgeSchema = new Schema<IKnowledge>({
  content: { type: String, required: true },
  category: { type: String },
  tokens: [String],
  source: { type: String, required: true },
  path: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  embeddings: [Number]
});

KnowledgeSchema.index({ content: 'text' });
KnowledgeSchema.index({ source: 1 });
KnowledgeSchema.index({ path: 1 });

export const Knowledge = model<IKnowledge>('Knowledge', KnowledgeSchema);