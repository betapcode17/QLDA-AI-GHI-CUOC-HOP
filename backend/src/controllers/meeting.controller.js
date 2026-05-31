import { meetingService } from '../services/meeting.service.js';
import { meetingWorkflowService } from '../services/meeting-workflow.service.js';
import { aiService } from '../services/ai.service.js';

export const meetingController = {
  create: async (req, res, next) => { try { res.status(201).json(await meetingService.create(req.body)); } catch (e) { next(e); } },
  list: async (req, res, next) => { try { res.json(await meetingService.list(req.query)); } catch (e) { next(e); } },
  detail: async (req, res, next) => { try { res.json(await meetingService.detail(req.params.id)); } catch (e) { next(e); } },
  update: async (req, res, next) => { try { res.json(await meetingService.update(req.params.id, req.body)); } catch (e) { next(e); } },
  status: async (req, res, next) => { try { res.json(await meetingService.status(req.params.id, req.body.status)); } catch (e) { next(e); } },
  remove: async (req, res, next) => { try { res.json(await meetingService.remove(req.params.id)); } catch (e) { next(e); } },
  processAudio: async (req, res, next) => { try { res.status(201).json(await meetingWorkflowService.processAudio(req.params.id, req.file, req.query)); } catch (e) { next(e); } },
  processAudioStream: async (req, res, next) => {
    try {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      let buffer = '';
      let donePayload = null;
      const writeChunk = (chunk) => {
        const text = chunk.toString('utf-8');
        buffer += text;
        res.write(text);

        const events = buffer.split('\n\n');
        buffer = events.pop() || '';
        for (const rawEvent of events) {
          const eventName = rawEvent.split('\n').find((line) => line.startsWith('event: '))?.slice(7).trim();
          const dataLine = rawEvent.split('\n').find((line) => line.startsWith('data: '));
          if (eventName === 'done' && dataLine) {
            try {
              donePayload = JSON.parse(dataLine.slice(6));
            } catch {
              donePayload = null;
            }
          }
        }
      };

      await aiService.processStream(req.file, req.query, writeChunk);
      if (donePayload) {
        const saved = await meetingWorkflowService.persistAiResult(req.params.id, req.file, donePayload, req.query);
        res.write(`event: saved\ndata: ${JSON.stringify(saved)}\n\n`);
      }
      res.end();
    } catch (e) {
      if (!res.headersSent) return next(e);
      res.write(`event: error\ndata: ${JSON.stringify({ message: e.message })}\n\n`);
      res.end();
    }
  },
  importTranscripts: async (req, res, next) => { try { res.status(201).json(await meetingWorkflowService.importTranscripts(req.params.id, req.file, { replace: req.query.replace === 'true' })); } catch (e) { next(e); } },
  export: async (req, res, next) => {
    try {
      const result = await meetingWorkflowService.exportMeeting(req.params.id, req.params.format);
      res.setHeader('Content-Type', result.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(result.filename)}"`);
      res.send(result.buffer);
    } catch (e) { next(e); }
  }
};
