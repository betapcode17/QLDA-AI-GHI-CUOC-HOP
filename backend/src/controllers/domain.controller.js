import path from 'path';
import { actionItemService, fileService, keywordService, noteService, participantService, speakerService, summaryService, transcriptService } from '../services/domain.service.js';
import { aiService } from '../services/ai.service.js';

export const participantController = {
  add: async (req, res, next) => { try { res.status(201).json(await participantService.add(req.params.meetingId, req.body)); } catch (e) { next(e); } },
  list: async (req, res, next) => { try { res.json(await participantService.list(req.params.meetingId)); } catch (e) { next(e); } },
  role: async (req, res, next) => { try { res.json(await participantService.updateRole(req.params.meetingId, req.params.userId, req.body.meetingRole)); } catch (e) { next(e); } },
  remove: async (req, res, next) => { try { res.json(await participantService.remove(req.params.meetingId, req.params.userId)); } catch (e) { next(e); } }
};

export const speakerController = {
  create: async (req, res, next) => { try { res.status(201).json(await speakerService.create(req.params.meetingId, req.body)); } catch (e) { next(e); } },
  list: async (req, res, next) => { try { res.json(await speakerService.list(req.params.meetingId)); } catch (e) { next(e); } },
  rename: async (req, res, next) => { try { res.json(await speakerService.rename(req.params.id, req.body)); } catch (e) { next(e); } },
  merge: async (req, res, next) => { try { res.json(await speakerService.merge(req.body.sourceSpeakerId, req.body.targetSpeakerId)); } catch (e) { next(e); } },
  remove: async (req, res, next) => { try { res.json(await speakerService.remove(req.params.id)); } catch (e) { next(e); } }
};

export const transcriptController = {
  create: async (req, res, next) => { try { res.status(201).json(await transcriptService.create(req.params.meetingId, req.body)); } catch (e) { next(e); } },
  list: async (req, res, next) => { try { res.json(await transcriptService.list({ meetingId: req.params.meetingId, ...req.query })); } catch (e) { next(e); } },
  update: async (req, res, next) => { try { res.json(await transcriptService.update(req.params.id, req.body)); } catch (e) { next(e); } },
  highlight: async (req, res, next) => { try { res.json(await transcriptService.highlight(req.params.id, req.body.isHighlighted)); } catch (e) { next(e); } },
  remove: async (req, res, next) => { try { res.json(await transcriptService.remove(req.params.id)); } catch (e) { next(e); } },
  translate: async (req, res, next) => { try { res.json(await aiService.translateTranscript(req.params.id, req.body.direction)); } catch (e) { next(e); } },
  batchTranslate: async (req, res, next) => {
    try {
      const rows = await transcriptService.list({ meetingId: req.params.meetingId });
      const translated = [];
      for (const row of rows) translated.push(await aiService.translateTranscript(row.id, req.body.direction || 'vi-en'));
      res.json({ count: translated.length, results: translated });
    } catch (e) { next(e); }
  },
  analyzeSentiment: async (req, res, next) => { try { res.json(await transcriptService.update(req.params.id, { sentimentLabel: req.body.sentimentLabel || 'Neutral' })); } catch (e) { next(e); } },
  analyzeMeetingSentiment: async (req, res, next) => {
    try {
      const rows = await transcriptService.list({ meetingId: req.params.meetingId });
      const results = await Promise.all(rows.map((row) => transcriptService.update(row.id, { sentimentLabel: 'Neutral' })));
      res.json({ count: results.length, results });
    } catch (e) { next(e); }
  },
  analyzeBehavior: async (req, res, next) => { try { res.json(await transcriptService.update(req.params.id, { behaviorLabel: req.body.behaviorLabel || 'Question' })); } catch (e) { next(e); } },
  analyzeMeetingBehavior: async (req, res, next) => {
    try {
      const rows = await transcriptService.list({ meetingId: req.params.meetingId });
      const results = await Promise.all(rows.map((row) => transcriptService.update(row.id, { behaviorLabel: 'Question' })));
      res.json({ count: results.length, results });
    } catch (e) { next(e); }
  }
};

export const fileController = {
  upload: (fileType) => async (req, res, next) => { try { res.status(201).json(await fileService.save(req.params.meetingId, req.file, fileType)); } catch (e) { next(e); } },
  list: async (req, res, next) => { try { res.json(await fileService.list(req.params.meetingId)); } catch (e) { next(e); } },
  metadata: async (req, res, next) => { try { res.json(await fileService.metadata(req.params.id)); } catch (e) { next(e); } },
  download: async (req, res, next) => { try { const file = await fileService.metadata(req.params.id); res.download(path.resolve(file.filePath), file.fileName || path.basename(file.filePath)); } catch (e) { next(e); } },
  remove: async (req, res, next) => { try { res.json(await fileService.remove(req.params.id)); } catch (e) { next(e); } }
};

export const summaryController = {
  create: async (req, res, next) => { try { res.status(201).json(await summaryService.create(req.params.meetingId, req.body)); } catch (e) { next(e); } },
  list: async (req, res, next) => { try { res.json(await summaryService.list(req.params.meetingId, req.query.summaryType)); } catch (e) { next(e); } },
  generate: async (req, res, next) => {
    try {
      const rows = await transcriptService.list({ meetingId: req.params.meetingId });
      const text = rows.map((row) => row.originalText).join('\n');
      const result = text ? await aiService.summarizeText({ text, max_new_tokens: 512, min_new_tokens: 60 }) : { summary: '' };
      res.status(201).json(await summaryService.create(req.params.meetingId, {
        summaryType: req.body.summaryType || 'Executive',
        content: result.summary || result.content || ''
      }));
    } catch (e) { next(e); }
  },
  regenerate: async (req, res, next) => { try { res.json(await summaryService.update(req.params.id, req.body.content)); } catch (e) { next(e); } }
};

export const actionItemController = {
  create: async (req, res, next) => { try { res.status(201).json(await actionItemService.create(req.params.meetingId, req.body)); } catch (e) { next(e); } },
  list: async (req, res, next) => { try { res.json(await actionItemService.list(req.params.meetingId, req.query.status)); } catch (e) { next(e); } },
  update: async (req, res, next) => { try { res.json(await actionItemService.update(req.params.id, req.body)); } catch (e) { next(e); } },
  complete: async (req, res, next) => { try { res.json(await actionItemService.complete(req.params.id)); } catch (e) { next(e); } }
};

export const keywordController = {
  extract: async (req, res, next) => { try { res.json(await keywordService.extract(req.params.meetingId)); } catch (e) { next(e); } },
  top: async (req, res, next) => { try { res.json(await keywordService.top(req.params.meetingId, req.query.limit)); } catch (e) { next(e); } },
  update: async (req, res, next) => { try { res.json(await keywordService.update(req.params.id, Number(req.body.frequencyCount))); } catch (e) { next(e); } }
};

export const noteController = {
  add: async (req, res, next) => { try { res.status(201).json(await noteService.add(req.user.id, req.body)); } catch (e) { next(e); } },
  list: async (req, res, next) => { try { res.json(await noteService.list(req.user.id, req.query.meetingId)); } catch (e) { next(e); } },
  update: async (req, res, next) => { try { res.json(await noteService.update(req.params.id, req.body)); } catch (e) { next(e); } },
  remove: async (req, res, next) => { try { res.json(await noteService.remove(req.params.id)); } catch (e) { next(e); } }
};
