import mongoose, { Schema } from 'mongoose';

export enum KnowledgeType {
  MATH = 'math',
  GEOGRAPHY = 'geography',
  POLITICS = 'politics',
  HISTORY = 'history',
  SCIENCE = 'science',
  GENERAL = 'general'
}

const KnowledgeSchema = new Schema({
  content: {
    type: String,
    required: true,
    trim: true
  },
  source: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: Object.values(KnowledgeType),
    default: KnowledgeType.GENERAL
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  embeddings: {
    type: [Number],
    default: []
  }
}, {
  timestamps: true
});

KnowledgeSchema.index({ content: 'text' });
KnowledgeSchema.index({ source: 1 });
KnowledgeSchema.index({ type: 1 });

export const Knowledge = mongoose.model('Knowledge', KnowledgeSchema);