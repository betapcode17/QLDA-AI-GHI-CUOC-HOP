import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { env } from './config/env.js';
import { setupSwagger } from './docs/swagger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { routes } from './routes/index.js';

BigInt.prototype.toJSON = function toJSON() {
  return this.toString();
};

export const createApp = () => {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: env.FRONTEND_ORIGIN.split(',').map((item) => item.trim()), credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(rateLimit({ windowMs: env.RATE_LIMIT_WINDOW_MS, max: env.RATE_LIMIT_MAX }));

  setupSwagger(app);
  app.get('/ready', (_req, res) => res.json({ status: 'ok', service: 'node-backend' }));
  app.use(routes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
};
