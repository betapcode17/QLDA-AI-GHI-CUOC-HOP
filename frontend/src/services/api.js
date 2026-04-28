import axios from 'axios';
import { mockMeetings, mockSettings } from './mockData';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  headers: {
    'Content-Type': 'application/json',
  },
});

const delay = (value) =>
  new Promise((resolve) => {
    window.setTimeout(() => resolve(value), 250);
  });

const getErrorMessage = (error, fallback) =>
  error?.response?.data?.detail || error?.response?.data?.error || error?.message || fallback;

export const meetingService = {
  async getMeetings() {
    try {
      const response = await api.get('/meetings');
      return Array.isArray(response.data) ? response.data : response.data?.results || [];
    } catch (error) {
      return delay(mockMeetings);
    }
  },

  async getMeetingById(id) {
    try {
      const response = await api.get(`/meetings/${id}`);
      return response.data;
    } catch (error) {
      const meeting = mockMeetings.find((item) => item.id === id);
      if (!meeting) {
        throw new Error('Meeting not found');
      }
      return delay(meeting);
    }
  },
};

export const recordingService = {
  async startRecording() {
    try {
      const response = await api.post('/record/start');
      return response.data;
    } catch (error) {
      return delay({
        sessionId: `session-${Date.now()}`,
        startedAt: new Date().toISOString(),
        status: 'recording',
      });
    }
  },

  async stopRecording() {
    try {
      const response = await api.post('/record/stop');
      return response.data;
    } catch (error) {
      return delay({
        status: 'stopped',
        meetingId: 'mtg-004',
      });
    }
  },

  async transcribeChunk(audioBlob, language = 'vi') {
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, `live-chunk-${Date.now()}.webm`);

      const response = await api.post('/api/transcribe', formData, {
        params: {
          language,
        },
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error, 'Live transcription failed.'));
    }
  },
};

export const settingsService = {
  async getSettings() {
    return delay(mockSettings);
  },
};

export const uploadService = {
  async getHealth() {
    try {
      const response = await api.get('/health');
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error, 'Khong the ket noi toi backend AI.'));
    }
  },

  async getModelsStatus() {
    try {
      const response = await api.get('/models/status');
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error, 'Khong the lay trang thai model.'));
    }
  },

  async transcribeAudio(file, language = 'vi') {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await api.post('/api/transcribe', formData, {
        params: {
          language,
        },
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error, 'Speech to text that bai.'));
    }
  },

  async translateText(text, direction, maxNewTokens = 512) {
    try {
      const response = await api.post('/api/translate', {
        text,
        direction,
        max_new_tokens: maxNewTokens,
      });
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error, 'Dich noi dung that bai.'));
    }
  },
  async runLlmAnalysis(transcript) {
    try {
      const response = await api.post('/debug/llm-test', {
        transcript,
      });
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error, 'Phan tich LLM that bai.'));
    }
  },

  buildQuestionAnswer(question, llmResult, displayLanguage = 'vi') {
    const normalized = question.toLowerCase();
    const result = llmResult?.result || {};
    const actionItems = result.action_items || [];
    const decisions = result.decisions || [];
    const blockers = result.risks_or_blockers || [];

    if (
      normalized.includes('action') ||
      normalized.includes('task') ||
      normalized.includes('việc') ||
      normalized.includes('viec') ||
      normalized.includes('nhiệm vụ') ||
      normalized.includes('nhiem vu')
    ) {
      if (!actionItems.length) {
        return displayLanguage === 'en'
          ? 'No action items were returned from the LLM analysis.'
          : 'LLM chua tra ve action item nao.';
      }

      return actionItems
        .map((item, index) => {
          const suffix = [item.assignee, item.deadline].filter(Boolean).join(' - ');
          return `${index + 1}. ${item.task}${suffix ? ` (${suffix})` : ''}`;
        })
        .join('\n');
    }

    if (
      normalized.includes('decision') ||
      normalized.includes('quyết định') ||
      normalized.includes('quyet dinh')
    ) {
      if (!decisions.length) {
        return displayLanguage === 'en'
          ? 'No decisions were identified by the LLM.'
          : 'LLM chua xac dinh duoc quyet dinh nao.';
      }

      return decisions.map((item, index) => `${index + 1}. ${item}`).join('\n');
    }

    if (
      normalized.includes('risk') ||
      normalized.includes('block') ||
      normalized.includes('rui ro') ||
      normalized.includes('rủi ro') ||
      normalized.includes('vuong') ||
      normalized.includes('vướng')
    ) {
      if (!blockers.length) {
        return displayLanguage === 'en'
          ? 'No blockers or risks were identified by the LLM.'
          : 'LLM khong ghi nhan blocker hoac rui ro noi bat.';
      }

      return blockers.map((item, index) => `${index + 1}. ${item}`).join('\n');
    }

    return (
      result.summary ||
      result.meeting_minutes ||
      (displayLanguage === 'en'
        ? 'The LLM summary is not available yet.'
        : 'Tom tat LLM hien chua san sang.')
    );
  },
};

export default api;
