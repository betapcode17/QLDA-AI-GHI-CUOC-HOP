import { prisma } from '../config/prisma.js';

export const dashboardController = {
  overview: async (_req, res, next) => {
    try {
      const [totalMeetings, completedMeetings, totalUsers, totalActionItems, pendingActionItems, totalTranscripts, totalSummaries, totalAudioFiles] = await Promise.all([
        prisma.meeting.count({ where: { deletedAt: null } }),
        prisma.meeting.count({ where: { deletedAt: null, status: 'Completed' } }),
        prisma.user.count({ where: { deletedAt: null } }),
        prisma.actionItem.count({ where: { deletedAt: null } }),
        prisma.actionItem.count({ where: { deletedAt: null, status: { in: ['Todo', 'InProgress'] } } }),
        prisma.transcript.count({ where: { deletedAt: null } }),
        prisma.summary.count(),
        prisma.meetingFile.count({ where: { deletedAt: null, fileType: 'Audio' } })
      ]);
      res.json({ totalMeetings, completedMeetings, totalUsers, totalActionItems, pendingActionItems, totalTranscripts, totalSummaries, totalAudioFiles });
    } catch (e) { next(e); }
  },
  analytics: async (_req, res, next) => {
    try {
      const [meetings, sentimentDistribution, speakerDistribution, keywordTrend, actionItemStatistics] = await Promise.all([
        prisma.meeting.groupBy({ by: ['status'], _count: { _all: true }, where: { deletedAt: null } }),
        prisma.transcript.groupBy({ by: ['sentimentLabel'], _count: { _all: true }, where: { deletedAt: null, sentimentLabel: { not: null } } }),
        prisma.speaker.groupBy({ by: ['meetingId'], _count: { _all: true }, where: { deletedAt: null } }),
        prisma.meetingKeyword.findMany({ orderBy: { frequencyCount: 'desc' }, take: 20 }),
        prisma.actionItem.groupBy({ by: ['status'], _count: { _all: true }, where: { deletedAt: null } })
      ]);
      res.json({ meetingTrend: meetings, sentimentDistribution, speakerDistribution, keywordTrend, actionItemStatistics });
    } catch (e) { next(e); }
  }
};
