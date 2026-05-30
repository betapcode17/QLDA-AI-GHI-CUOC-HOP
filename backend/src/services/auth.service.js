import bcrypt from 'bcrypt';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { userRepository } from '../repositories/user.repository.js';
import { AppError } from '../utils/errors.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';

const sanitizeUser = ({ passwordHash, ...user }) => user;

class AuthService {
  async register(data) {
    const passwordHash = await bcrypt.hash(data.password, env.BCRYPT_ROUNDS);
    const user = await userRepository.create({
      username: data.username,
      email: data.email,
      fullName: data.fullName,
      passwordHash,
      role: data.role || 'Member'
    });
    return this.tokens(user);
  }

  async login({ login, password }) {
    const user = await userRepository.findByLogin(login);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new AppError(401, 'Invalid credentials');
    return this.tokens(user);
  }

  async refresh(refreshToken) {
    const payload = verifyRefreshToken(refreshToken);
    const user = await prisma.user.findFirst({ where: { id: payload.sub, deletedAt: null } });
    if (!user || user.tokenVersion !== payload.tokenVersion) throw new AppError(401, 'Invalid refresh token');
    return this.tokens(user);
  }

  async logout(userId) {
    await prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
    return { ok: true };
  }

  async changePassword(user, { currentPassword, newPassword }) {
    const fresh = await prisma.user.findUnique({ where: { id: user.id } });
    if (!(await bcrypt.compare(currentPassword, fresh.passwordHash))) throw new AppError(400, 'Current password is incorrect');
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS), tokenVersion: { increment: 1 } }
    });
    return { ok: true };
  }

  async resetPassword({ email, newPassword }) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return { ok: true };
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS), tokenVersion: { increment: 1 } }
    });
    return { ok: true };
  }

  tokens(user) {
    return {
      user: sanitizeUser(user),
      accessToken: signAccessToken(user),
      refreshToken: signRefreshToken(user)
    };
  }
}

export const authService = new AuthService();
export { sanitizeUser };
