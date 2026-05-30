import { Router } from 'express';
import { actionItemController, fileController, keywordController, noteController, participantController, speakerController, summaryController, transcriptController } from '../controllers/domain.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { actionSchemas, noteSchemas, participantSchemas, speakerSchemas, summarySchemas, transcriptSchemas } from '../dtos/schemas.js';

export const domainRoutes = Router();

domainRoutes.get('/meetings/:meetingId/participants', participantController.list);
domainRoutes.post('/meetings/:meetingId/participants', authenticate, validate(participantSchemas.add), participantController.add);
domainRoutes.patch('/meetings/:meetingId/participants/:userId/role', authenticate, validate(participantSchemas.role), participantController.role);
domainRoutes.delete('/meetings/:meetingId/participants/:userId', authenticate, participantController.remove);

domainRoutes.get('/meetings/:meetingId/speakers', speakerController.list);
domainRoutes.post('/meetings/:meetingId/speakers', authenticate, validate(speakerSchemas.create), speakerController.create);
domainRoutes.patch('/speakers/:id', authenticate, validate(speakerSchemas.rename), speakerController.rename);
domainRoutes.post('/speakers/merge', authenticate, validate(speakerSchemas.merge), speakerController.merge);
domainRoutes.delete('/speakers/:id', authenticate, speakerController.remove);

domainRoutes.get('/meetings/:meetingId/transcripts', transcriptController.list);
domainRoutes.post('/meetings/:meetingId/transcripts', authenticate, validate(transcriptSchemas.create), transcriptController.create);
domainRoutes.put('/transcripts/:id', authenticate, validate(transcriptSchemas.update), transcriptController.update);
domainRoutes.patch('/transcripts/:id/highlight', authenticate, validate(transcriptSchemas.highlight), transcriptController.highlight);
domainRoutes.post('/transcripts/:id/translate', authenticate, transcriptController.translate);
domainRoutes.post('/meetings/:meetingId/transcripts/batch-translate', authenticate, transcriptController.batchTranslate);
domainRoutes.post('/transcripts/:id/analyze-sentiment', authenticate, transcriptController.analyzeSentiment);
domainRoutes.post('/meetings/:meetingId/analyze-sentiment', authenticate, transcriptController.analyzeMeetingSentiment);
domainRoutes.post('/transcripts/:id/analyze-behavior', authenticate, transcriptController.analyzeBehavior);
domainRoutes.post('/meetings/:meetingId/analyze-behavior', authenticate, transcriptController.analyzeMeetingBehavior);
domainRoutes.delete('/transcripts/:id', authenticate, transcriptController.remove);

domainRoutes.get('/meetings/:meetingId/files', fileController.list);
domainRoutes.post('/meetings/:meetingId/files/audio', authenticate, upload.single('file'), fileController.upload('Audio'));
domainRoutes.post('/meetings/:meetingId/files/video', authenticate, upload.single('file'), fileController.upload('Video'));
domainRoutes.post('/meetings/:meetingId/files/transcript', authenticate, upload.single('file'), fileController.upload('Transcript'));
domainRoutes.get('/files/:id', fileController.metadata);
domainRoutes.get('/files/:id/download', fileController.download);
domainRoutes.delete('/files/:id', authenticate, fileController.remove);

domainRoutes.get('/meetings/:meetingId/summaries', summaryController.list);
domainRoutes.post('/meetings/:meetingId/summaries', authenticate, validate(summarySchemas.create), summaryController.create);
domainRoutes.post('/meetings/:meetingId/summaries/generate', authenticate, summaryController.generate);
domainRoutes.put('/summaries/:id/regenerate', authenticate, validate(summarySchemas.update), summaryController.regenerate);

domainRoutes.get('/meetings/:meetingId/action-items', actionItemController.list);
domainRoutes.post('/meetings/:meetingId/action-items', authenticate, validate(actionSchemas.create), actionItemController.create);
domainRoutes.put('/action-items/:id', authenticate, validate(actionSchemas.update), actionItemController.update);
domainRoutes.patch('/action-items/:id/complete', authenticate, actionItemController.complete);

domainRoutes.post('/meetings/:meetingId/keywords/extract', authenticate, keywordController.extract);
domainRoutes.get('/meetings/:meetingId/keywords/top', keywordController.top);
domainRoutes.patch('/keywords/:id', authenticate, keywordController.update);

domainRoutes.get('/notes', authenticate, noteController.list);
domainRoutes.post('/notes', authenticate, validate(noteSchemas.add), noteController.add);
domainRoutes.put('/notes/:id', authenticate, validate(noteSchemas.update), noteController.update);
domainRoutes.delete('/notes/:id', authenticate, noteController.remove);

domainRoutes.get('/logs', authenticate, authorize('Admin'), async (_req, res, next) => {
  try {
    const { prisma } = await import('../config/prisma.js');
    res.json(await prisma.systemLog.findMany({ orderBy: { timestamp: 'desc' }, take: 200 }));
  } catch (e) { next(e); }
});
