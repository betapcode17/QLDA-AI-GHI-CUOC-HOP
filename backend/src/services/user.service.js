import bcrypt from 'bcrypt';
import { env } from '../config/env.js';
import { userRepository } from '../repositories/user.repository.js';
import { notFound } from '../utils/errors.js';
import { getPagination, pageResult } from '../utils/pagination.js';
import { sanitizeUser } from './auth.service.js';

class UserService {
  async create(data) {
    const user = await userRepository.create({
      username: data.username,
      email: data.email,
      fullName: data.fullName,
      role: data.role,
      passwordHash: await bcrypt.hash(data.password, env.BCRYPT_ROUNDS)
    });
    return sanitizeUser(user);
  }

  async list(query) {
    const pagination = getPagination(query);
    const users = await userRepository.search({ ...query, ...pagination });
    return pageResult(users.map(sanitizeUser), pagination.take);
  }

  async get(id) {
    const user = await userRepository.findById(id);
    if (!user) throw notFound('User');
    return sanitizeUser(user);
  }

  async update(id, data) {
    const patch = { ...data };
    if (patch.password) {
      patch.passwordHash = await bcrypt.hash(patch.password, env.BCRYPT_ROUNDS);
      delete patch.password;
    }
    const user = await userRepository.update(id, patch);
    return sanitizeUser(user);
  }

  assignRole(id, role) {
    return this.update(id, { role });
  }

  async remove(id) {
    await userRepository.softDelete(id);
    return { ok: true };
  }
}

export const userService = new UserService();
