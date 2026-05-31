import { meetingWorkflowService } from '../services/meeting-workflow.service.js';
import { AppError } from '../utils/errors.js';

export const searchController = {
  global: async (req, res, next) => {
    try {
      const q = String(req.query.q || '').trim();
      if (!q) throw new AppError(400, 'Query parameter q is required');
      res.json(await meetingWorkflowService.search(q, req.query.limit));
    } catch (e) { next(e); }
  }
};
