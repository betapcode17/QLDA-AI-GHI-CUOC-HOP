import { Router } from 'express';
import { userController } from '../controllers/user.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { userSchemas } from '../dtos/schemas.js';

export const userRoutes = Router();
userRoutes.use(authenticate, authorize('Admin', 'Manager'));
userRoutes.get('/', userController.list);
userRoutes.post('/', authorize('Admin'), validate(userSchemas.create), userController.create);
userRoutes.get('/:id', userController.get);
userRoutes.put('/:id', validate(userSchemas.update), userController.update);
userRoutes.patch('/:id/role', authorize('Admin'), validate(userSchemas.role), userController.assignRole);
userRoutes.delete('/:id', authorize('Admin'), userController.remove);
