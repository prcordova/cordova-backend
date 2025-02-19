import express from 'express';
import cors from 'cors';
import { chatRoutes } from './routes/chat.routes';
import { knowledgeRoutes } from './routes/knowledge.routes';
import bodyParser from 'body-parser';

declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

const app = express();

// Aumentar significativamente os limites
const maxSize = '500mb';

// Configurar body-parser
app.use(bodyParser.json({
  limit: maxSize
}));

app.use(bodyParser.urlencoded({
  limit: maxSize,
  extended: true,
  parameterLimit: 50000
}));

app.use(bodyParser.raw({
  limit: maxSize,
  type: 'application/octet-stream'
}));

// Configurar CORS
app.use(cors());

// Middleware de log
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// Rotas
app.use('/api/chat', chatRoutes);
app.use('/api/knowledge', knowledgeRoutes);

// Middleware de erro
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Erro interno do servidor',
    details: err.message 
  });
});

export { app }; 