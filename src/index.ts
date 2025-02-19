import mongoose from 'mongoose';
import { app } from './app';
import { config } from './config/config';
import express from 'express';
import bodyParser from 'body-parser';

// Configuração do MongoDB com verificação de erro
mongoose.connect(config.mongodb.url)
  .then(() => {
    console.log('✅ Conectado ao MongoDB com sucesso');
  })
  .catch((error) => {
    console.error('❌ Erro ao conectar ao MongoDB:', error);
    process.exit(1);
  });

// Aumentar limite do Node.js
const maxSize = '500mb';
process.env.MAX_HTTP_HEADER_SIZE = '80000';

// Configurações de limite de tamanho usando body-parser
app.use(bodyParser.json({limit: maxSize}));
app.use(bodyParser.urlencoded({limit: maxSize, extended: true, parameterLimit: 50000}));
app.use(bodyParser.raw({limit: maxSize}));
app.use(bodyParser.text({limit: maxSize}));

// Configurações adicionais do express
app.use(express.json({limit: maxSize}));
app.use(express.urlencoded({limit: maxSize, extended: true, parameterLimit: 50000}));
app.use(express.raw({limit: maxSize}));
app.use(express.text({limit: maxSize}));

// Inicia o servidor
app.listen(config.server.port, () => {
  console.log(`🚀 Servidor rodando na porta ${config.server.port}`);
});

// Tratamento de erros não capturados
process.on('unhandledRejection', (error: Error) => {
  console.error('❌ Erro não tratado:', error);
});

process.on('SIGTERM', () => {
  console.log('🛑 Encerrando servidor...');
  process.exit(0);
});