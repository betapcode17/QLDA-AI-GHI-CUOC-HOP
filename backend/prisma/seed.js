import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const prisma = new PrismaClient();

const password = 'Admin@123456';

const upsertUser = async ({ email, username, fullName, role }) =>
  prisma.user.upsert({
    where: { email },
    update: { username, fullName, role, deletedAt: null },
    create: {
      username,
      email,
      fullName,
      passwordHash: await bcrypt.hash(password, 12),
      role
    }
  });

const main = async () => {
  const [admin, manager, memberA, memberB, memberC] = await Promise.all([
    upsertUser({ email: 'admin@example.com', username: 'admin', fullName: 'System Admin', role: 'Admin' }),
    upsertUser({ email: 'manager@example.com', username: 'manager', fullName: 'Nguyen Minh Manager', role: 'Manager' }),
    upsertUser({ email: 'lan@example.com', username: 'lan', fullName: 'Tran Thi Lan', role: 'Member' }),
    upsertUser({ email: 'nam@example.com', username: 'nam', fullName: 'Le Van Nam', role: 'Member' }),
    upsertUser({ email: 'mai@example.com', username: 'mai', fullName: 'Pham Thanh Mai', role: 'Member' })
  ]);

  const meetingDefinitions = [
    {
      title: 'Sprint planning AI Meeting Assistant',
      description: 'Plan sprint scope, owners, and release risks.',
      status: 'Completed',
      startTime: new Date('2026-05-20T02:00:00.000Z'),
      endTime: new Date('2026-05-20T03:00:00.000Z'),
      passcode: 'SP-2026',
      folderId: 'project-alpha',
      participants: [
        [admin, 'Host'],
        [manager, 'CoHost'],
        [memberA, 'Participant'],
        [memberB, 'Participant']
      ],
      speakers: [
        { speakerLabel: 'SPEAKER_00', realName: 'Nguyen Minh Manager', colorHex: '#2563eb' },
        { speakerLabel: 'SPEAKER_01', realName: 'Tran Thi Lan', colorHex: '#16a34a' },
        { speakerLabel: 'SPEAKER_02', realName: 'Le Van Nam', colorHex: '#dc2626' }
      ],
      transcripts: [
        ['SPEAKER_00', 0.0, 12.4, 'Chung ta can chot pham vi sprint nay va uu tien tinh nang upload audio.', 'We need to finalize sprint scope and prioritize audio upload.', 'Neutral', 'Decision', true],
        ['SPEAKER_01', 13.0, 32.8, 'Em de xuat them dashboard tong quan de quan ly so cuoc hop va action item.', 'I suggest adding an overview dashboard for meetings and action items.', 'Positive', 'Suggestion', false],
        ['SPEAKER_02', 33.2, 55.1, 'Rui ro lon nhat la pipeline diarization cham khi file dai hon mot gio.', 'The main risk is slow diarization for files longer than one hour.', 'Negative', 'Question', true]
      ],
      summaries: [
        ['Executive', 'Team agreed to prioritize upload audio, dashboard overview, and diarization performance improvements.'],
        ['KeyDecisions', 'Freeze sprint scope around upload, dashboard, transcript review, and API stability.'],
        ['ActionItems', 'Lan owns dashboard UI, Nam owns diarization profiling, Manager owns stakeholder update.']
      ],
      keywords: [
        ['audio', 8],
        ['dashboard', 6],
        ['diarization', 5],
        ['sprint', 4]
      ],
      actions: [
        ['Build dashboard overview API integration', 'Tran Thi Lan', '2026-05-24T10:00:00.000Z', 'High', 'InProgress'],
        ['Profile diarization on long meeting files', 'Le Van Nam', '2026-05-25T10:00:00.000Z', 'Critical', 'Todo']
      ],
      files: [
        ['Audio', 'uploads/sample-sprint-planning.wav', 'sample-sprint-planning.wav', 'audio/wav', 18432000n],
        ['Transcript', 'uploads/sample-sprint-transcript.txt', 'sample-sprint-transcript.txt', 'text/plain', 12000n]
      ]
    },
    {
      title: 'Customer research debrief',
      description: 'Discuss feedback from pilot users.',
      status: 'Completed',
      startTime: new Date('2026-05-21T07:00:00.000Z'),
      endTime: new Date('2026-05-21T07:45:00.000Z'),
      passcode: 'CR-2026',
      folderId: 'research',
      participants: [
        [manager, 'Host'],
        [memberA, 'Participant'],
        [memberC, 'Participant']
      ],
      speakers: [
        { speakerLabel: 'SPEAKER_00', realName: 'Pham Thanh Mai', colorHex: '#9333ea' },
        { speakerLabel: 'SPEAKER_01', realName: 'Tran Thi Lan', colorHex: '#16a34a' }
      ],
      transcripts: [
        ['SPEAKER_00', 0.0, 18.2, 'Nguoi dung muon tim kiem bien ban nhanh va co bo loc theo nguoi noi.', 'Users want fast search and speaker filters.', 'Positive', 'Suggestion', false],
        ['SPEAKER_01', 19.0, 38.5, 'Can them tinh nang bookmark nhung doan quan trong trong transcript.', 'We need bookmarks for important transcript segments.', 'Neutral', 'Action', true]
      ],
      summaries: [
        ['Executive', 'Pilot users value fast transcript search, speaker filters, and bookmark notes.'],
        ['Detailed', 'Research feedback focused on retrieval speed, review workflow, and note taking.']
      ],
      keywords: [
        ['search', 7],
        ['bookmark', 5],
        ['speaker', 4]
      ],
      actions: [
        ['Prototype transcript bookmark workflow', 'Pham Thanh Mai', '2026-05-27T10:00:00.000Z', 'Medium', 'Todo']
      ],
      files: [
        ['Audio', 'uploads/sample-research-debrief.m4a', 'sample-research-debrief.m4a', 'audio/mp4', 10485760n]
      ]
    },
    {
      title: 'Architecture review backend',
      description: 'Review Node.js backend, Prisma schema, and deployment path.',
      status: 'InProgress',
      startTime: new Date('2026-05-22T08:30:00.000Z'),
      endTime: null,
      passcode: 'AR-2026',
      folderId: 'architecture',
      participants: [
        [admin, 'Host'],
        [manager, 'CoHost'],
        [memberB, 'Participant']
      ],
      speakers: [
        { speakerLabel: 'SPEAKER_00', realName: 'System Admin', colorHex: '#0f172a' },
        { speakerLabel: 'SPEAKER_01', realName: 'Le Van Nam', colorHex: '#dc2626' }
      ],
      transcripts: [
        ['SPEAKER_00', 0.0, 22.7, 'Backend Node se quan ly du lieu nghiep vu va proxy tac vu AI sang FastAPI.', 'Node backend owns business data and proxies AI tasks to FastAPI.', 'Neutral', 'Decision', true],
        ['SPEAKER_01', 23.0, 41.1, 'Can test migration, seed, swagger va authentication truoc khi demo.', 'We need to test migration, seed, Swagger, and authentication before demo.', 'Neutral', 'Action', false]
      ],
      summaries: [
        ['Executive', 'Architecture review confirmed Node backend as business API and FastAPI as AI inference service.']
      ],
      keywords: [
        ['backend', 9],
        ['prisma', 6],
        ['swagger', 3]
      ],
      actions: [
        ['Run endpoint smoke tests before demo', 'System Admin', '2026-05-23T10:00:00.000Z', 'High', 'InProgress']
      ],
      files: []
    }
  ];

  for (const definition of meetingDefinitions) {
    const existingMeeting = await prisma.meeting.findFirst({ where: { title: definition.title } });
    const meetingData = {
      description: definition.description,
      status: definition.status,
      startTime: definition.startTime,
      endTime: definition.endTime,
      passcode: definition.passcode,
      folderId: definition.folderId,
      deletedAt: null
    };
    const meeting = existingMeeting
      ? await prisma.meeting.update({
        where: { id: existingMeeting.id },
        data: meetingData
      })
      : await prisma.meeting.create({
        data: {
          title: definition.title,
          description: definition.description,
          status: definition.status,
          startTime: definition.startTime,
          endTime: definition.endTime,
          passcode: definition.passcode,
          folderId: definition.folderId
        }
      });

    for (const [user, meetingRole] of definition.participants) {
      await prisma.meetingParticipant.upsert({
        where: { meetingId_userId: { meetingId: meeting.id, userId: user.id } },
        update: { meetingRole },
        create: { meetingId: meeting.id, userId: user.id, meetingRole }
      });
    }

    const speakersByLabel = new Map();
    for (const speaker of definition.speakers) {
      const saved = await prisma.speaker.upsert({
        where: { meetingId_speakerLabel: { meetingId: meeting.id, speakerLabel: speaker.speakerLabel } },
        update: { realName: speaker.realName, colorHex: speaker.colorHex, deletedAt: null },
        create: { ...speaker, meetingId: meeting.id }
      });
      speakersByLabel.set(speaker.speakerLabel, saved);
    }

    await prisma.transcript.deleteMany({ where: { meetingId: meeting.id } });
    const savedTranscripts = [];
    for (const [label, startTimestamp, endTimestamp, originalText, translatedText, sentimentLabel, behaviorLabel, isHighlighted] of definition.transcripts) {
      savedTranscripts.push(await prisma.transcript.create({
        data: {
          meetingId: meeting.id,
          speakerId: speakersByLabel.get(label)?.id,
          startTimestamp,
          endTimestamp,
          originalText,
          translatedText,
          sentimentLabel,
          behaviorLabel,
          isHighlighted
        }
      }));
    }

    await prisma.summary.deleteMany({ where: { meetingId: meeting.id } });
    for (const [summaryType, content] of definition.summaries) {
      await prisma.summary.create({ data: { meetingId: meeting.id, summaryType, content } });
    }

    for (const [keyword, frequencyCount] of definition.keywords) {
      await prisma.meetingKeyword.upsert({
        where: { meetingId_keyword: { meetingId: meeting.id, keyword } },
        update: { frequencyCount },
        create: { meetingId: meeting.id, keyword, frequencyCount }
      });
    }

    await prisma.actionItem.deleteMany({ where: { meetingId: meeting.id } });
    for (const [taskContent, assigneeName, deadline, priority, status] of definition.actions) {
      await prisma.actionItem.create({
        data: {
          meetingId: meeting.id,
          taskContent,
          assigneeName,
          deadline: new Date(deadline),
          priority,
          status,
          sourceTranscriptId: savedTranscripts[0]?.id
        }
      });
    }

    await prisma.meetingFile.deleteMany({ where: { meetingId: meeting.id } });
    for (const [fileType, filePath, fileName, mimeType, fileSize] of definition.files) {
      await prisma.meetingFile.create({ data: { meetingId: meeting.id, fileType, filePath, fileName, mimeType, fileSize } });
    }

    await prisma.userBookmarkNote.deleteMany({ where: { meetingId: meeting.id, userId: admin.id } });
    await prisma.userBookmarkNote.create({
      data: {
        meetingId: meeting.id,
        userId: admin.id,
        transcriptId: savedTranscripts[0]?.id,
        noteContent: `Sample note for ${definition.title}`,
        isBookmark: true
      }
    });

    await prisma.systemLog.create({
      data: {
        userId: admin.id,
        actionType: 'SEED_SAMPLE_MEETING',
        ipAddress: '127.0.0.1',
        details: { meetingId: meeting.id, title: meeting.title }
      }
    });
  }

  console.log(`Seed completed. Users: 5, Meetings: ${meetingDefinitions.length}`);
};

main().finally(async () => prisma.$disconnect());
