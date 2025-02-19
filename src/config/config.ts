import dotenv from 'dotenv';

dotenv.config();

export const config = {
    mongodb: {
      url: process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-chat',
      options: {
        useNewUrlParser: true,
        useUnifiedTopology: true
      }
    },
    server: {
      port: process.env.PORT || 3001
    }
  };