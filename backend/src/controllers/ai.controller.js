import { aiService } from '../services/ai.service.js';

export const aiController = {
  health: async (_req, res, next) => { try { res.json(await aiService.health()); } catch (e) { next(e); } },
  models: async (_req, res, next) => { try { res.json(await aiService.models()); } catch (e) { next(e); } },
  transcribe: async (req, res, next) => { try { res.json(await aiService.transcribe(req.file, req.query)); } catch (e) { next(e); } },
  transcribeWithSpeakers: async (req, res, next) => { try { res.json(await aiService.transcribeWithSpeakers(req.file, req.query)); } catch (e) { next(e); } },
  diarize: async (req, res, next) => { try { res.json(await aiService.diarize(req.file, req.query)); } catch (e) { next(e); } },
  process: async (req, res, next) => { try { res.json(await aiService.process(req.file, req.query)); } catch (e) { next(e); } },
  translate: async (req, res, next) => { try { res.json(await aiService.translateText(req.body)); } catch (e) { next(e); } },
  summarize: async (req, res, next) => { try { res.json(await aiService.summarizeText(req.body)); } catch (e) { next(e); } },
  llmTest: async (req, res, next) => { try { res.json(await aiService.llmTest(req.body)); } catch (e) { next(e); } }
};
