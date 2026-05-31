import fs from 'fs/promises';
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import PDFDocument from 'pdfkit';
import { prisma } from '../config/prisma.js';
import { aiService } from './ai.service.js';
import { fileService, keywordService } from './domain.service.js';
import { AppError, notFound } from '../utils/errors.js';

const getAiSegments = (result) =>
  result?.transcript?.segments ||
  result?.segments ||
  result?.transcript?.transcripts ||
  [];

const getSegmentSpeaker = (segment, index) =>
  segment.speaker ||
  segment.speaker_label ||
  segment.speakerLabel ||
  `SPEAKER_${String(index % 2).padStart(2, '0')}`;

const getSegmentText = (segment) =>
  segment.text ||
  segment.original_text ||
  segment.originalText ||
  '';

const getLlmResult = (result) =>
  result?.llm?.action_items || result?.llm?.summary || result?.llm?.meeting_minutes
    ? result.llm
    : result?.llm?.result ||
      result?.llm_result?.result ||
      result?.llmResult?.result ||
      result?.result ||
      {};

const normalizeImportedSegments = (text, filename = '') => {
  const lower = filename.toLowerCase();

  if (lower.endsWith('.json')) {
    const parsed = JSON.parse(text);
    const rows = Array.isArray(parsed) ? parsed : parsed.segments || parsed.transcripts || [];
    return rows.map((item, index) => ({
      speakerLabel: item.speaker || item.speakerLabel || item.speaker_label || `SPEAKER_${String(index % 2).padStart(2, '0')}`,
      startTimestamp: Number(item.start ?? item.startTimestamp ?? item.start_timestamp ?? index * 10),
      endTimestamp: Number(item.end ?? item.endTimestamp ?? item.end_timestamp ?? index * 10 + 5),
      originalText: item.text || item.originalText || item.original_text || ''
    })).filter((item) => item.originalText);
  }

  if (lower.endsWith('.srt') || lower.endsWith('.vtt')) {
    const blocks = text.replace(/^WEBVTT\s*/i, '').split(/\r?\n\r?\n/);
    return blocks.map((block, index) => {
      const lines = block.split(/\r?\n/).filter(Boolean);
      const timeLineIndex = lines.findIndex((line) => line.includes('-->'));
      const content = lines.slice(timeLineIndex + 1).join(' ').trim();
      return {
        speakerLabel: `SPEAKER_${String(index % 2).padStart(2, '0')}`,
        startTimestamp: index * 10,
        endTimestamp: index * 10 + 5,
        originalText: content
      };
    }).filter((item) => item.originalText);
  }

  return text
    .split(/\r?\n/)
    .map((line, index) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const speakerMatch = line.match(/^\[?([A-Za-z0-9_ -]+?)(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?\]?\s*[:\-]\s*(.+)$/);
      return {
        speakerLabel: speakerMatch?.[1]?.trim() || `SPEAKER_${String(index % 2).padStart(2, '0')}`,
        startTimestamp: index * 10,
        endTimestamp: index * 10 + 5,
        originalText: speakerMatch?.[2]?.trim() || line
      };
    });
};

const saveSegments = async (meetingId, segments, { replace = false } = {}) => {
  if (replace) {
    await prisma.transcript.updateMany({ where: { meetingId, deletedAt: null }, data: { deletedAt: new Date() } });
  }

  const created = [];
  for (const [index, segment] of segments.entries()) {
    const speakerLabel = segment.speakerLabel || getSegmentSpeaker(segment, index);
    const speaker = await prisma.speaker.upsert({
      where: { meetingId_speakerLabel: { meetingId, speakerLabel } },
      update: { deletedAt: null },
      create: { meetingId, speakerLabel, realName: segment.realName || null }
    });

    created.push(await prisma.transcript.create({
      data: {
        meetingId,
        speakerId: speaker.id,
        startTimestamp: segment.startTimestamp ?? segment.start ?? null,
        endTimestamp: segment.endTimestamp ?? segment.end ?? null,
        originalText: segment.originalText || getSegmentText(segment),
        translatedText: segment.translatedText || segment.translated_text || null,
        sentimentLabel: segment.sentimentLabel || segment.sentiment_label || null,
        behaviorLabel: segment.behaviorLabel || segment.behavior_label || null
      }
    }));
  }

  await keywordService.extract(meetingId);
  return created;
};

const meetingForExport = async (meetingId) => {
  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, deletedAt: null },
    include: {
      participants: { include: { user: true } },
      speakers: { where: { deletedAt: null } },
      transcripts: { where: { deletedAt: null }, include: { speaker: true }, orderBy: { startTimestamp: 'asc' } },
      summaries: { orderBy: { createdAt: 'desc' } },
      keywords: { orderBy: { frequencyCount: 'desc' } },
      actionItems: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
      files: { where: { deletedAt: null } }
    }
  });
  if (!meeting) throw notFound('Meeting');
  return meeting;
};

const jsonBuffer = (meeting) => Buffer.from(JSON.stringify(meeting, null, 2), 'utf-8');

const docxBuffer = async (meeting) => {
  const children = [
    new Paragraph({ text: meeting.title, heading: HeadingLevel.TITLE }),
    new Paragraph({ text: meeting.description || '', spacing: { after: 240 } }),
    new Paragraph({ text: 'Summary', heading: HeadingLevel.HEADING_1 }),
    ...meeting.summaries.map((summary) => new Paragraph({
      children: [new TextRun({ text: `${summary.summaryType}: `, bold: true }), new TextRun(summary.content)]
    })),
    new Paragraph({ text: 'Transcript', heading: HeadingLevel.HEADING_1 }),
    ...meeting.transcripts.map((item) => new Paragraph({
      children: [
        new TextRun({ text: `${item.speaker?.realName || item.speaker?.speakerLabel || 'Speaker'}: `, bold: true }),
        new TextRun(item.originalText)
      ]
    })),
    new Paragraph({ text: 'Action Items', heading: HeadingLevel.HEADING_1 }),
    ...meeting.actionItems.map((item) => new Paragraph(`${item.taskContent}${item.assigneeName ? ` - ${item.assigneeName}` : ''}`))
  ];

  return Packer.toBuffer(new Document({ sections: [{ children }] }));
};

const pdfBuffer = (meeting) => new Promise((resolve) => {
  const doc = new PDFDocument({ margin: 48 });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  doc.on('end', () => resolve(Buffer.concat(chunks)));

  doc.fontSize(20).text(meeting.title);
  if (meeting.description) doc.moveDown(0.5).fontSize(11).text(meeting.description);
  doc.moveDown().fontSize(16).text('Summary');
  meeting.summaries.forEach((summary) => {
    doc.moveDown(0.3).fontSize(11).text(`${summary.summaryType}: ${summary.content}`);
  });
  doc.moveDown().fontSize(16).text('Transcript');
  meeting.transcripts.forEach((item) => {
    doc.moveDown(0.3).fontSize(10).text(`${item.speaker?.realName || item.speaker?.speakerLabel || 'Speaker'}: ${item.originalText}`);
  });
  doc.moveDown().fontSize(16).text('Action Items');
  meeting.actionItems.forEach((item) => {
    doc.moveDown(0.3).fontSize(10).text(`- ${item.taskContent}${item.assigneeName ? ` (${item.assigneeName})` : ''}`);
  });
  doc.end();
});

export const meetingWorkflowService = {
  async processAudio(meetingId, file, params = {}) {
    const meeting = await prisma.meeting.findFirst({ where: { id: meetingId, deletedAt: null } });
    if (!meeting) throw notFound('Meeting');
    if (!file) throw new AppError(400, 'Audio file is required');

    const savedFile = await fileService.save(meetingId, file, 'Audio');
    const aiResult = await aiService.process(file, params);
    const segments = getAiSegments(aiResult);
    const transcripts = await saveSegments(meetingId, segments, { replace: params.replace_transcripts === 'true' });

    const llm = getLlmResult(aiResult);
    const summaryText = aiResult?.summary || llm.summary || llm.meeting_minutes;
    let summary = null;
    if (summaryText) {
      summary = await prisma.summary.create({
        data: {
          meetingId,
          summaryType: 'Executive',
          content: typeof summaryText === 'string' ? summaryText : JSON.stringify(summaryText)
        }
      });
    }

    const actionItems = [];
    for (const item of llm.action_items || []) {
      actionItems.push(await prisma.actionItem.create({
        data: {
          meetingId,
          taskContent: item.task || item.task_content || String(item),
          assigneeName: item.assignee || item.assignee_name || null,
          deadline: item.deadline ? new Date(item.deadline) : null,
          priority: 'Medium',
          status: 'Todo'
        }
      }));
    }

    return { file: savedFile, aiResult, transcripts, summary, actionItems };
  },

  async persistAiResult(meetingId, file, aiResult, params = {}) {
    const meeting = await prisma.meeting.findFirst({ where: { id: meetingId, deletedAt: null } });
    if (!meeting) throw notFound('Meeting');

    const savedFile = file
      ? await fileService.save(meetingId, file, 'Audio')
      : null;
    const segments = getAiSegments(aiResult);
    const transcripts = await saveSegments(meetingId, segments, { replace: params.replace_transcripts === 'true' });

    const llm = getLlmResult(aiResult);
    const summaryText = aiResult?.summary || llm.summary || llm.meeting_minutes;
    let summary = null;
    if (summaryText) {
      summary = await prisma.summary.create({
        data: {
          meetingId,
          summaryType: 'Executive',
          content: typeof summaryText === 'string' ? summaryText : JSON.stringify(summaryText)
        }
      });
    }

    const actionItems = [];
    for (const item of llm.action_items || []) {
      actionItems.push(await prisma.actionItem.create({
        data: {
          meetingId,
          taskContent: item.task || item.task_content || String(item),
          assigneeName: item.assignee || item.assignee_name || null,
          deadline: item.deadline ? new Date(item.deadline) : null,
          priority: 'Medium',
          status: 'Todo'
        }
      }));
    }

    return { file: savedFile, transcripts, summary, actionItems };
  },

  async importTranscripts(meetingId, file, { replace = false } = {}) {
    const meeting = await prisma.meeting.findFirst({ where: { id: meetingId, deletedAt: null } });
    if (!meeting) throw notFound('Meeting');
    if (!file) throw new AppError(400, 'Transcript file is required');

    await fileService.save(meetingId, file, 'Transcript');
    const text = await fs.readFile(file.path, 'utf-8');
    const segments = normalizeImportedSegments(text, file.originalname);
    if (!segments.length) throw new AppError(400, 'No transcript segments found in file');
    const transcripts = await saveSegments(meetingId, segments, { replace });
    return { count: transcripts.length, results: transcripts };
  },

  async search(q, limit = 20) {
    const take = Math.min(Math.max(Number(limit) || 20, 1), 50);
    const whereText = { contains: q, mode: 'insensitive' };
    const [meetings, transcripts, summaries, actionItems] = await Promise.all([
      prisma.meeting.findMany({ where: { deletedAt: null, OR: [{ title: whereText }, { description: whereText }] }, take }),
      prisma.transcript.findMany({ where: { deletedAt: null, originalText: whereText }, include: { meeting: true, speaker: true }, take }),
      prisma.summary.findMany({ where: { content: whereText }, include: { meeting: true }, take }),
      prisma.actionItem.findMany({ where: { deletedAt: null, taskContent: whereText }, include: { meeting: true }, take })
    ]);
    return { q, meetings, transcripts, summaries, actionItems };
  },

  async exportMeeting(meetingId, format) {
    const meeting = await meetingForExport(meetingId);
    if (format === 'json') return { buffer: jsonBuffer(meeting), mimeType: 'application/json', filename: `${meeting.title}.json` };
    if (format === 'docx') return { buffer: await docxBuffer(meeting), mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', filename: `${meeting.title}.docx` };
    if (format === 'pdf') return { buffer: await pdfBuffer(meeting), mimeType: 'application/pdf', filename: `${meeting.title}.pdf` };
    throw new AppError(400, 'Unsupported export format');
  }
};
