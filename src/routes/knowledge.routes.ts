import { Router } from 'express';
import { knowledgeController } from '../controllers/knowledge.controller';

const router = Router();

router.post('/learn', knowledgeController.learn);
router.post('/upload', knowledgeController.upload);
router.get('/', knowledgeController.list);

export const knowledgeRoutes = router; 