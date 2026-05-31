import fsSync from 'fs';
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

const getSegmentSpeaker = (segment) =>
  segment.speaker ||
  segment.speaker_label ||
  segment.speakerLabel ||
  null;

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
  for (const segment of segments) {
    const speakerLabel = getSegmentSpeaker(segment);
    const speaker = speakerLabel
      ? await prisma.speaker.upsert({
          where: { meetingId_speakerLabel: { meetingId, speakerLabel } },
          update: { deletedAt: null },
          create: { meetingId, speakerLabel, realName: segment.realName || null }
        })
      : null;

    created.push(await prisma.transcript.create({
      data: {
        meetingId,
        speakerId: speaker?.id || null,
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

const normalizeTranscriptView = (value) => (value === 'full' ? 'full' : 'chunks');

const getSpeakerName = (item) => item.speaker?.realName || item.speaker?.speakerLabel || 'Speaker';

const getTranscriptTimeRange = (item) => {
  const start = item.startTimestamp ?? 0;
  const end = item.endTimestamp ?? 0;
  return `${start}s - ${end}s`;
};

const getFullTranscriptText = (meeting, translated = false) =>
  meeting.transcripts
    .map((item) => translated ? item.translatedText : item.originalText)
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

const buildExportPayload = (meeting, options = {}) => {
  const transcriptView = normalizeTranscriptView(options.transcriptView);
  if (transcriptView !== 'full') return { ...meeting, exportOptions: { transcriptView } };

  return {
    ...meeting,
    exportOptions: { transcriptView },
    fullTranscript: getFullTranscriptText(meeting),
    fullTranslatedTranscript: getFullTranscriptText(meeting, true)
  };
};

const jsonBuffer = (meeting, options = {}) =>
  Buffer.from(JSON.stringify(buildExportPayload(meeting, options), null, 2), 'utf-8');

const PDF_FONT_REGULAR_CANDIDATES = [
  process.env.PDF_FONT_REGULAR,
  '/usr/share/fonts/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/TTF/DejaVuSans.ttf',
  'C:/Windows/Fonts/arial.ttf',
  'C:/Windows/Fonts/calibri.ttf',
  'C:/Windows/Fonts/segoeui.ttf'
].filter(Boolean);

const PDF_FONT_BOLD_CANDIDATES = [
  process.env.PDF_FONT_BOLD,
  '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
  'C:/Windows/Fonts/arialbd.ttf',
  'C:/Windows/Fonts/calibrib.ttf',
  'C:/Windows/Fonts/segoeuib.ttf'
].filter(Boolean);

const findExistingFont = (candidates) =>
  candidates.find((candidate) => {
    try {
      return fsSync.existsSync(candidate);
    } catch {
      return false;
    }
  });

const registerPdfFonts = (doc) => {
  const regular = findExistingFont(PDF_FONT_REGULAR_CANDIDATES);
  const bold = findExistingFont(PDF_FONT_BOLD_CANDIDATES);

  if (regular) doc.registerFont('AppRegular', regular);
  if (bold) doc.registerFont('AppBold', bold);

  return {
    regular: regular ? 'AppRegular' : 'Helvetica',
    bold: bold ? 'AppBold' : regular ? 'AppRegular' : 'Helvetica-Bold'
  };
};

const buildDocxTranscriptParagraphs = (meeting, transcriptView) => {
  if (transcriptView === 'full') {
    const paragraphs = [
      new Paragraph({
        children: [new TextRun({ text: getFullTranscriptText(meeting) || 'No transcript content.', font: 'Arial' })]
      })
    ];
    const translatedText = getFullTranscriptText(meeting, true);
    if (translatedText) {
      paragraphs.push(
        new Paragraph({ children: [new TextRun({ text: 'Translation', bold: true, font: 'Arial' })] }),
        new Paragraph({ children: [new TextRun({ text: translatedText, font: 'Arial' })] })
      );
    }
    return paragraphs;
  }

  return meeting.transcripts.map((item) => new Paragraph({
    children: [
      new TextRun({ text: `${getSpeakerName(item)} (${getTranscriptTimeRange(item)}): `, bold: true, font: 'Arial' }),
      new TextRun({ text: item.originalText, font: 'Arial' }),
      ...(item.translatedText ? [new TextRun({ text: `\nTranslation: ${item.translatedText}`, font: 'Arial' })] : [])
    ]
  }));
};

const docxBuffer = async (meeting, options = {}) => {
  const transcriptView = normalizeTranscriptView(options.transcriptView);
  const children = [
    new Paragraph({ children: [new TextRun({ text: meeting.title, font: 'Arial' })], heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: meeting.description || '', font: 'Arial' })], spacing: { after: 240 } }),
    new Paragraph({ text: 'Summary', heading: HeadingLevel.HEADING_1 }),
    ...meeting.summaries.map((summary) => new Paragraph({
      children: [new TextRun({ text: `${summary.summaryType}: `, bold: true, font: 'Arial' }), new TextRun({ text: summary.content, font: 'Arial' })]
    })),
    new Paragraph({ text: transcriptView === 'full' ? 'Transcript - Full text' : 'Transcript - Chunks', heading: HeadingLevel.HEADING_1 }),
    ...buildDocxTranscriptParagraphs(meeting, transcriptView),
    new Paragraph({ text: 'Action Items', heading: HeadingLevel.HEADING_1 }),
    ...meeting.actionItems.map((item) => new Paragraph({
      children: [new TextRun({ text: `${item.taskContent}${item.assigneeName ? ` - ${item.assigneeName}` : ''}`, font: 'Arial' })]
    }))
  ];

  return Packer.toBuffer(new Document({ sections: [{ children }] }));
};

const renderPdfTranscript = (doc, fonts, meeting, transcriptView) => {
  doc.moveDown().font(fonts.bold).fontSize(16).text(transcriptView === 'full' ? 'Transcript - Full text' : 'Transcript - Chunks');

  if (transcriptView === 'full') {
    doc.moveDown(0.3).font(fonts.regular).fontSize(10).text(getFullTranscriptText(meeting) || 'No transcript content.', {
      lineGap: 3
    });
    const translatedText = getFullTranscriptText(meeting, true);
    if (translatedText) {
      doc.moveDown(0.6).font(fonts.bold).fontSize(11).text('Translation');
      doc.moveDown(0.2).font(fonts.regular).fontSize(10).text(translatedText, { lineGap: 3 });
    }
    return;
  }

  meeting.transcripts.forEach((item) => {
    doc.moveDown(0.3).font(fonts.bold).fontSize(10).text(`${getSpeakerName(item)} (${getTranscriptTimeRange(item)}): `, { continued: true });
    doc.font(fonts.regular).text(item.originalText);
    if (item.translatedText) {
      doc.moveDown(0.1).font(fonts.regular).fontSize(9).fillColor('#555555').text(`Translation: ${item.translatedText}`);
      doc.fillColor('#000000').fontSize(10);
    }
  });
};

const pdfBuffer = (meeting, options = {}) => new Promise((resolve) => {
  const transcriptView = normalizeTranscriptView(options.transcriptView);
  const doc = new PDFDocument({ margin: 48 });
  const fonts = registerPdfFonts(doc);
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  doc.on('end', () => resolve(Buffer.concat(chunks)));

  doc.font(fonts.bold).fontSize(20).text(meeting.title);
  if (meeting.description) doc.moveDown(0.5).font(fonts.regular).fontSize(11).text(meeting.description);
  doc.moveDown().font(fonts.bold).fontSize(16).text('Summary');
  meeting.summaries.forEach((summary) => {
    doc.moveDown(0.3).font(fonts.bold).fontSize(11).text(`${summary.summaryType}: `, { continued: true });
    doc.font(fonts.regular).text(summary.content);
  });
  renderPdfTranscript(doc, fonts, meeting, transcriptView);
  doc.moveDown().font(fonts.bold).fontSize(16).text('Action Items');
  meeting.actionItems.forEach((item) => {
    doc.moveDown(0.3).font(fonts.regular).fontSize(10).text(`- ${item.taskContent}${item.assigneeName ? ` (${item.assigneeName})` : ''}`);
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

  async exportMeeting(meetingId, format, options = {}) {
    const meeting = await meetingForExport(meetingId);
    const transcriptView = normalizeTranscriptView(options.transcriptView);
    const filename = `${meeting.title}-${transcriptView}`;
    if (format === 'json') return { buffer: jsonBuffer(meeting, { transcriptView }), mimeType: 'application/json', filename: `${filename}.json` };
    if (format === 'docx') return { buffer: await docxBuffer(meeting, { transcriptView }), mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', filename: `${filename}.docx` };
    if (format === 'pdf') return { buffer: await pdfBuffer(meeting, { transcriptView }), mimeType: 'application/pdf', filename: `${filename}.pdf` };
    throw new AppError(400, 'Unsupported export format');
  }
};
