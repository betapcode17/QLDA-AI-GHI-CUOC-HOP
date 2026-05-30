import { authService, sanitizeUser } from '../services/auth.service.js';

export const authController = {
  register: async (req, res, next) => { try { res.status(201).json(await authService.register(req.body)); } catch (e) { next(e); } },
  login: async (req, res, next) => { try { res.json(await authService.login(req.body)); } catch (e) { next(e); } },
  refresh: async (req, res, next) => { try { res.json(await authService.refresh(req.body.refreshToken)); } catch (e) { next(e); } },
  logout: async (req, res, next) => { try { res.json(await authService.logout(req.user.id)); } catch (e) { next(e); } },
  changePassword: async (req, res, next) => { try { res.json(await authService.changePassword(req.user, req.body)); } catch (e) { next(e); } },
  resetPassword: async (req, res, next) => { try { res.json(await authService.resetPassword(req.body)); } catch (e) { next(e); } },
  profile: (req, res) => res.json(sanitizeUser(req.user))
};
