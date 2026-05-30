import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { authSchemas } from '../dtos/schemas.js';

export const authRoutes = Router();
authRoutes.post('/register', validate(authSchemas.register), authController.register);
authRoutes.post('/login', validate(authSchemas.login), authController.login);
authRoutes.post('/refresh-token', validate(authSchemas.refresh), authController.refresh);
authRoutes.post('/logout', authenticate, authController.logout);
authRoutes.post('/change-password', authenticate, validate(authSchemas.changePassword), authController.changePassword);
authRoutes.post('/reset-password', validate(authSchemas.resetPassword), authController.resetPassword);
authRoutes.get('/profile', authenticate, authController.profile);
