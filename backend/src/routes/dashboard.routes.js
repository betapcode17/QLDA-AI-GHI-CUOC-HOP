import { Router } from 'express';
import { dashboardController } from '../controllers/dashboard.controller.js';
import { authenticate } from '../middleware/auth.js';

export const dashboardRoutes = Router();
dashboardRoutes.get('/overview', authenticate, dashboardController.overview);
dashboardRoutes.get('/analytics', authenticate, dashboardController.analytics);
