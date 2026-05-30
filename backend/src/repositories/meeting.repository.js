import { prisma } from '../config/prisma.js';
import { BaseRepository } from './base.repository.js';

class MeetingRepository extends BaseRepository {
  constructor() {
    super(prisma.meeting);
  }

  detail(id) {
    return prisma.meeting.findFirst({
      where: { id, deletedAt: null },
      include: {
        participants: { include: { user: true } },
        speakers: { where: { deletedAt: null } },
        transcripts: { where: { deletedAt: null }, orderBy: { startTimestamp: 'asc' }, include: { speaker: true } },
        summaries: true,
        keywords: { orderBy: { frequencyCount: 'desc' } },
        files: { where: { deletedAt: null } },
        actionItems: { where: { deletedAt: null } }
      }
    });
  }

  search({ search, status, from, to, take, cursor, skip }) {
    return prisma.meeting.findMany({
      where: {
        deletedAt: null,
        ...(status ? { status } : {}),
        ...(from || to
          ? { startTime: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
          : {}),
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } }
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

export const meetingRepository = new MeetingRepository();
