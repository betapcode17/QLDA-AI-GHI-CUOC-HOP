import { userService } from '../services/user.service.js';

export const userController = {
  create: async (req, res, next) => { try { res.status(201).json(await userService.create(req.body)); } catch (e) { next(e); } },
  list: async (req, res, next) => { try { res.json(await userService.list(req.query)); } catch (e) { next(e); } },
  get: async (req, res, next) => { try { res.json(await userService.get(req.params.id)); } catch (e) { next(e); } },
  update: async (req, res, next) => { try { res.json(await userService.update(req.params.id, req.body)); } catch (e) { next(e); } },
  assignRole: async (req, res, next) => { try { res.json(await userService.assignRole(req.params.id, req.body.role)); } catch (e) { next(e); } },
  remove: async (req, res, next) => { try { res.json(await userService.remove(req.params.id)); } catch (e) { next(e); } }
};
