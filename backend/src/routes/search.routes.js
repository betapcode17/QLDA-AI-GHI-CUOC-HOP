import { Router } from 'express';
import { searchController } from '../controllers/search.controller.js';
import { authenticate } from '../middleware/auth.js';

export const searchRoutes = Router();
searchRoutes.get('/', authenticate, searchController.global);
