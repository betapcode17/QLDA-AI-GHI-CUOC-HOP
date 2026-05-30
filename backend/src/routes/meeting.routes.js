import { Router } from 'express';
import { meetingController } from '../controllers/meeting.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { meetingSchemas } from '../dtos/schemas.js';

export const meetingRoutes = Router();
meetingRoutes.get('/', meetingController.list);
meetingRoutes.post('/', authenticate, authorize('Admin', 'Manager'), validate(meetingSchemas.create), meetingController.create);
meetingRoutes.post('/:id/process-audio', authenticate, authorize('Admin', 'Manager'), upload.single('file'), meetingController.processAudio);
meetingRoutes.post('/:id/process-audio-stream', authenticate, authorize('Admin', 'Manager'), upload.single('file'), meetingController.processAudioStream);
meetingRoutes.post('/:id/transcripts/import', authenticate, authorize('Admin', 'Manager'), upload.single('file'), meetingController.importTranscripts);
meetingRoutes.get('/:id/export/:format', authenticate, meetingController.export);
meetingRoutes.get('/:id', meetingController.detail);
meetingRoutes.put('/:id', authenticate, authorize('Admin', 'Manager'), validate(meetingSchemas.update), meetingController.update);
meetingRoutes.patch('/:id/status', authenticate, authorize('Admin', 'Manager'), validate(meetingSchemas.status), meetingController.status);
meetingRoutes.delete('/:id', authenticate, authorize('Admin'), meetingController.remove);
