import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { logger } from '../utils/logger.js';

export const notFoundHandler = (req, _res, next) => {
  next(Object.assign(new Error(`Route not found: ${req.method} ${req.originalUrl}`), { statusCode: 404 }));
};

export const errorHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Validation failed', details: err.flatten() });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Unique constraint violation', details: err.meta });
    if (err.code === 'P2025') return res.status(404).json({ error: 'Record not found' });
  }
  const statusCode = err.statusCode || 500;
  if (statusCode >= 500) logger.error(err.message, { stack: err.stack, details: err.details });
  return res.status(statusCode).json({ error: err.message || 'Internal server error', details: err.details });
};
