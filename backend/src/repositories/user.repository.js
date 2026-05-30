import { prisma } from '../config/prisma.js';
import { BaseRepository } from './base.repository.js';

class UserRepository extends BaseRepository {
  constructor() {
    super(prisma.user);
  }

  findByLogin(login) {
    return prisma.user.findFirst({
      where: { deletedAt: null, OR: [{ username: login }, { email: login }] }
    });
  }

  search({ search, role, take, cursor, skip }) {
    return prisma.user.findMany({
      where: {
        deletedAt: null,
        ...(role ? { role } : {}),
        ...(search
          ? {
              OR: [
                { username: { contains: search, mode: 'insensitive' } },
                { fullName: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } }
              ]
            }
          : {})
      },
      orderBy: { createdAt: 'desc' },
      take,
      cursor,
      skip
    });
  }
}

export const userRepository = new UserRepository();
