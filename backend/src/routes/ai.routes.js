import { Router } from 'express';
import { aiController } from '../controllers/ai.controller.js';
import { upload } from '../middleware/upload.js';

export const aiRoutes = Router();
aiRoutes.get('/health', aiController.health);
aiRoutes.get('/models/status', aiController.models);
aiRoutes.post('/api/transcribe', upload.single('file'), aiController.transcribe);
aiRoutes.post('/api/transcribe-with-speakers', upload.single('file'), aiController.transcribeWithSpeakers);
aiRoutes.post('/api/diarize', upload.single('file'), aiController.diarize);
aiRoutes.post('/api/process', upload.single('file'), aiController.process);
aiRoutes.post('/api/translate', aiController.translate);
aiRoutes.post('/api/summarize', aiController.summarize);
aiRoutes.post('/debug/llm-test', aiController.llmTest);
