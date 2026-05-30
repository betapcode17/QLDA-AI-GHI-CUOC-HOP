import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { verifyAccessToken } from '../utils/jwt.js';

const getDefaultUser = () =>
  prisma.user.findFirst({
    where: { deletedAt: null },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }]
  });

export const authenticate = async (req, _res, next) => {
  try {
    if (env.AUTH_DISABLED) {
      const user = await getDefaultUser();
      if (!user) throw new AppError(500, 'No default user available. Run npm run prisma:seed.');
      req.user = user;
      return next();
    }

    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new AppError(401, 'Missing bearer token');
    const payload = verifyAccessToken(token);
    const user = await prisma.user.findFirst({ where: { id: payload.sub, deletedAt: null } });
    if (!user) throw new AppError(401, 'Invalid token user');
    req.user = user;
    next();
  } catch (error) {
    next(error.statusCode ? error : new AppError(401, 'Invalid or expired token'));
  }
};

export const authorize = (...roles) => (req, _res, next) => {
  if (env.AUTH_DISABLED) return next();
  if (!req.user) return next(new AppError(401, 'Authentication required'));
  if (!roles.includes(req.user.role)) return next(new AppError(403, 'Permission denied'));
  return next();
};
