import { Router } from 'express';
import { userRoutes } from './user.routes.js';
import { meetingRoutes } from './meeting.routes.js';
import { domainRoutes } from './domain.routes.js';
import { aiRoutes } from './ai.routes.js';
import { dashboardRoutes } from './dashboard.routes.js';
import { searchRoutes } from './search.routes.js';

export const routes = Router();
routes.use(aiRoutes);
routes.use('/users', userRoutes);
routes.use('/meetings', meetingRoutes);
routes.use('/dashboard', dashboardRoutes);
routes.use('/search', searchRoutes);
routes.use(domainRoutes);
