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
};

export const settingsService = {
  async getSettings() {
    return delay(mockSettings);
  },
};

export default api;
