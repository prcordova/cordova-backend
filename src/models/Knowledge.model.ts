import mongoose, { Schema, model } from 'mongoose';

interface IKnowledge {
  content: string;
  term?: string;
  category?: string;
  language?: string;
  type?: string;
  source: string;
  path: string;
  timestamp: Date;
  confidence?: number;
  embeddings?: number[];
}

const KnowledgeSchema = new Schema<IKnowledge>({
  content: { type: String, required: true },
  term: String,
  category: String,
  language: String,
  type: String,
  source: { type: String, required: true },
  path: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  confidence: Number,
  embeddings: [Number]
});

KnowledgeSchema.index({ content: 'text' });
KnowledgeSchema.index({ source: 1 });
KnowledgeSchema.index({ path: 1 });

export const Knowledge = model<IKnowledge>('Knowledge', KnowledgeSchema);