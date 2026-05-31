import { prisma } from '../config/prisma.js';
import { logger } from '../utils/logger.js';

export const auditLog = (actionType) => async (req, _res, next) => {
  try {
    await prisma.systemLog.create({
      data: {
        userId: req.user?.id,
        actionType,
        ipAddress: req.ip,
        details: { method: req.method, path: req.originalUrl, params: req.params }
      }
    });
  } catch (error) {
    logger.warn('Audit log failed', { error: error.message });
  }
  next();
};
