import { meetingRepository } from '../repositories/meeting.repository.js';
import { notFound } from '../utils/errors.js';
import { getPagination, pageResult } from '../utils/pagination.js';

const mapMeetingForFrontend = (meeting) => {
  if (!meeting?.transcripts) {
    return {
      ...meeting,
      date: meeting.startTime || meeting.createdAt,
      duration: meeting.endTime && meeting.startTime ? `${Math.round((new Date(meeting.endTime) - new Date(meeting.startTime)) / 60000)} min` : '',
      source: 'API',
      speakers: 0,
      sentiment: 'Neutral'
    };
  }
  return {
    ...meeting,
    date: meeting.startTime || meeting.createdAt,
    duration: meeting.endTime && meeting.startTime ? `${Math.round((new Date(meeting.endTime) - new Date(meeting.startTime)) / 60000)} min` : '',
    source: meeting.files?.[0]?.fileType || 'API',
    speakers: meeting.speakers?.length || 0,
    sentiment: meeting.transcripts?.find((item) => item.sentimentLabel)?.sentimentLabel || 'Neutral',
    transcript: meeting.transcripts.map((item) => ({
      id: item.id,
      speaker: item.speaker?.realName || item.speaker?.speakerLabel || 'Speaker',
      time: String(item.startTimestamp ?? '00:00'),
      text: item.originalText
    })),
    summary: {
      overview: meeting.summaries?.[0]?.content || '',
      decisions: meeting.summaries?.filter((s) => s.summaryType === 'KeyDecisions').map((s) => s.content) || [],
      actionItems: meeting.actionItems?.map((a) => a.taskContent) || []
    }
  };
};

class MeetingService {
  create(data) {
    return meetingRepository.create({
      ...data,
      startTime: data.startTime ? new Date(data.startTime) : undefined,
      endTime: data.endTime ? new Date(data.endTime) : undefined
    });
  }

  async list(query) {
    const pagination = getPagination(query);
    const meetings = await meetingRepository.search({ ...query, ...pagination });
    return pageResult(meetings.map(mapMeetingForFrontend), pagination.take);
  }

  async detail(id) {
    const meeting = await meetingRepository.detail(id);
    if (!meeting) throw notFound('Meeting');
    return mapMeetingForFrontend(meeting);
  }

  update(id, data) {
    return meetingRepository.update(id, {
      ...data,
      startTime: data.startTime ? new Date(data.startTime) : undefined,
      endTime: data.endTime ? new Date(data.endTime) : undefined
    });
  }

  status(id, status) {
    return meetingRepository.update(id, { status });
  }

  async remove(id) {
    await meetingRepository.softDelete(id);
    return { ok: true };
  }
}

export const meetingService = new MeetingService();
