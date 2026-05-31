import fs from 'fs';
import { prisma } from '../config/prisma.js';
import { AppError, notFound } from '../utils/errors.js';

export const participantService = {
  add: (meetingId, data) => prisma.meetingParticipant.upsert({
    where: { meetingId_userId: { meetingId, userId: data.userId } },
    update: { meetingRole: data.meetingRole },
    create: { meetingId, userId: data.userId, meetingRole: data.meetingRole || 'Participant' }
  }),
  list: (meetingId) => prisma.meetingParticipant.findMany({ where: { meetingId }, include: { user: true } }),
  updateRole: (meetingId, userId, meetingRole) => prisma.meetingParticipant.update({ where: { meetingId_userId: { meetingId, userId } }, data: { meetingRole } }),
  remove: async (meetingId, userId) => {
    await prisma.meetingParticipant.delete({ where: { meetingId_userId: { meetingId, userId } } });
    return { ok: true };
  }
};

export const speakerService = {
  create: (meetingId, data) => prisma.speaker.create({ data: { ...data, meetingId } }),
  list: (meetingId) => prisma.speaker.findMany({ where: { meetingId, deletedAt: null } }),
  rename: (id, data) => prisma.speaker.update({ where: { id }, data }),
  merge: async (sourceSpeakerId, targetSpeakerId) => {
    await prisma.transcript.updateMany({ where: { speakerId: sourceSpeakerId }, data: { speakerId: targetSpeakerId } });
    await prisma.speaker.update({ where: { id: sourceSpeakerId }, data: { deletedAt: new Date() } });
    return { ok: true };
  },
  remove: async (id) => {
    await prisma.speaker.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  }
};

export const transcriptService = {
  create: (meetingId, data) => prisma.transcript.create({ data: { ...data, meetingId } }),
  list: ({ meetingId, search, speakerId, sentimentLabel }) => prisma.transcript.findMany({
    where: {
      meetingId,
      deletedAt: null,
      ...(speakerId ? { speakerId } : {}),
      ...(sentimentLabel ? { sentimentLabel } : {}),
      ...(search ? { originalText: { contains: search, mode: 'insensitive' } } : {})
    },
    include: { speaker: true },
    orderBy: { startTimestamp: 'asc' }
  }),
  update: (id, data) => prisma.transcript.update({ where: { id }, data }),
  highlight: (id, isHighlighted = true) => prisma.transcript.update({ where: { id }, data: { isHighlighted } }),
  remove: async (id) => {
    await prisma.transcript.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  }
};

export const fileService = {
  async save(meetingId, file, fileType) {
    if (!file) throw new AppError(400, 'File is required');
    return prisma.meetingFile.create({
      data: {
        meetingId,
        fileType,
        filePath: file.path,
        fileName: file.originalname,
        mimeType: file.mimetype,
        fileSize: BigInt(file.size)
      }
    });
  },
  list: (meetingId) => prisma.meetingFile.findMany({ where: { meetingId, deletedAt: null } }),
  async metadata(id) {
    const file = await prisma.meetingFile.findFirst({ where: { id, deletedAt: null } });
    if (!file) throw notFound('File');
    return file;
  },
  async remove(id) {
    const file = await this.metadata(id);
    await prisma.meetingFile.update({ where: { id }, data: { deletedAt: new Date() } });
    if (fs.existsSync(file.filePath)) fs.unlinkSync(file.filePath);
    return { ok: true };
  }
};

export const summaryService = {
  create: (meetingId, data) => prisma.summary.create({ data: { ...data, meetingId } }),
  list: (meetingId, summaryType) => prisma.summary.findMany({ where: { meetingId, ...(summaryType ? { summaryType } : {}) }, orderBy: { createdAt: 'desc' } }),
  update: (id, content) => prisma.summary.update({ where: { id }, data: { content } })
};

export const actionItemService = {
  create: (meetingId, data) => prisma.actionItem.create({ data: { ...data, meetingId, deadline: data.deadline ? new Date(data.deadline) : undefined } }),
  list: (meetingId, status) => prisma.actionItem.findMany({ where: { meetingId, deletedAt: null, ...(status ? { status } : {}) }, orderBy: { createdAt: 'desc' } }),
  update: (id, data) => prisma.actionItem.update({ where: { id }, data: { ...data, deadline: data.deadline ? new Date(data.deadline) : undefined } }),
  complete: (id) => prisma.actionItem.update({ where: { id }, data: { status: 'Done' } })
};

export const keywordService = {
  async extract(meetingId) {
    const rows = await prisma.transcript.findMany({ where: { meetingId, deletedAt: null } });
    const counts = new Map();
    rows.flatMap((row) => row.originalText.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) || [])
      .forEach((word) => counts.set(word, (counts.get(word) || 0) + 1));
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 50);
    await Promise.all(top.map(([keyword, frequencyCount]) => prisma.meetingKeyword.upsert({
      where: { meetingId_keyword: { meetingId, keyword } },
      update: { frequencyCount },
      create: { meetingId, keyword, frequencyCount }
    })));
    return this.top(meetingId);
  },
  top: (meetingId, limit = 20) => prisma.meetingKeyword.findMany({ where: { meetingId }, orderBy: { frequencyCount: 'desc' }, take: Number(limit) || 20 }),
  update: (id, frequencyCount) => prisma.meetingKeyword.update({ where: { id }, data: { frequencyCount } })
};

export const noteService = {
  add: (userId, data) => prisma.userBookmarkNote.create({ data: { ...data, userId } }),
  list: (userId, meetingId) => prisma.userBookmarkNote.findMany({ where: { userId, deletedAt: null, ...(meetingId ? { meetingId } : {}) }, orderBy: { createdAt: 'desc' } }),
  update: (id, data) => prisma.userBookmarkNote.update({ where: { id }, data }),
  remove: async (id) => {
    await prisma.userBookmarkNote.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  }
};
