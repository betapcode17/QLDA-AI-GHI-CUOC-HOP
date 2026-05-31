import axios from "axios";
import { mockMeetings, mockSettings } from "./mockData";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:3001",
  headers: {
    "Content-Type": "application/json",
  },
});

const delay = (value) =>
  new Promise((resolve) => {
    window.setTimeout(() => resolve(value), 250);
  });

const getErrorMessage = (error, fallback) =>
  error?.response?.data?.detail ||
  error?.response?.data?.error ||
  error?.message ||
  fallback;

const buildWebSocketUrl = (path) => {
  const baseUrl = api.defaults.baseURL || window.location.origin;
  const normalized = baseUrl.replace(/\/$/, "").replace(/^http/, "ws");
  return `${normalized}${path}`;
};

export const meetingService = {
  async getMeetings() {
    try {
      const response = await api.get("/meetings");
      return Array.isArray(response.data)
        ? response.data
        : response.data?.results || [];
    } catch (error) {
      return delay(mockMeetings);
    }
  },

  async createMeeting(payload) {
    const response = await api.post("/meetings", payload);
    return response.data;
  },

  async updateMeeting(id, payload) {
    const response = await api.put(`/meetings/${id}`, payload);
    return response.data;
  },

  async getParticipants(meetingId) {
    const response = await api.get(`/meetings/${meetingId}/participants`);
    return response.data;
  },

  async addParticipant(meetingId, payload) {
    const response = await api.post(`/meetings/${meetingId}/participants`, payload);
    return response.data;
  },

  async getSpeakers(meetingId) {
    const response = await api.get(`/meetings/${meetingId}/speakers`);
    return response.data;
  },

  async getTranscripts(meetingId) {
    const response = await api.get(`/meetings/${meetingId}/transcripts`);
    return response.data;
  },

  async translateTranscript(transcriptId, direction = "vi-en") {
    const response = await api.post(`/transcripts/${transcriptId}/translate`, {
      direction,
    });
    return response.data;
  },

  async batchTranslateTranscripts(meetingId, direction = "vi-en") {
    const response = await api.post(`/meetings/${meetingId}/transcripts/batch-translate`, {
      direction,
    });
    return response.data;
  },

  async getSummaries(meetingId) {
    const response = await api.get(`/meetings/${meetingId}/summaries`);
    return response.data;
  },

  async generateSummary(meetingId, summaryType = "Executive") {
    const response = await api.post(`/meetings/${meetingId}/summaries/generate`, {
      summaryType,
    });
    return response.data;
  },

  async indexMeetingTranscript(meetingId) {
    const response = await api.post(`/meetings/${meetingId}/vector-index`);
    return response.data;
  },

  async askMeeting(meetingId, question) {
    const response = await api.post(`/meetings/${meetingId}/qa`, { question });
    return response.data;
  },

  async getFiles(meetingId) {
    const response = await api.get(`/meetings/${meetingId}/files`);
    return response.data;
  },

  async getNotes(meetingId) {
    const response = await api.get("/notes", { params: { meetingId } });
    return response.data;
  },

  async addNote(payload) {
    const response = await api.post("/notes", payload);
    return response.data;
  },

  async getActionItems(meetingId, status) {
    const response = await api.get(`/meetings/${meetingId}/action-items`, {
      params: status ? { status } : {},
    });
    return response.data;
  },

  async createActionItem(meetingId, payload) {
    const response = await api.post(`/meetings/${meetingId}/action-items`, payload);
    return response.data;
  },

  async updateActionItem(id, payload) {
    const response = await api.put(`/action-items/${id}`, payload);
    return response.data;
  },

  async completeActionItem(id) {
    const response = await api.patch(`/action-items/${id}/complete`);
    return response.data;
  },

  async exportMeeting(id, format) {
    const response = await api.get(`/meetings/${id}/export/${format}`, {
      responseType: "blob",
    });
    return response.data;
  },

  async getMeetingById(id) {
    try {
      const response = await api.get(`/meetings/${id}`);
      return response.data;
    } catch (error) {
      const meeting = mockMeetings.find((item) => item.id === id);
      if (!meeting) {
        throw new Error("Meeting not found");
      }
      return delay(meeting);
    }
  },
};

export const dashboardService = {
  async getOverview() {
    const response = await api.get("/dashboard/overview");
    return response.data;
  },

  async getAnalytics() {
    const response = await api.get("/dashboard/analytics");
    return response.data;
  },
};

export const userService = {
  async getUsers(params = {}) {
    const response = await api.get("/users", { params });
    return Array.isArray(response.data)
      ? response.data
      : response.data?.results || [];
  },
};

export const recordingService = {
  createRecordingSocket() {
    return new WebSocket(buildWebSocketUrl("/ws/recording"));
  },

  async startRecording() {
    try {
      const response = await api.post("/record/start");
      return response.data;
    } catch (error) {
      return delay({
        sessionId: `session-${Date.now()}`,
        startedAt: new Date().toISOString(),
        status: "recording",
      });
    }
  },

  async stopRecording() {
    try {
      const response = await api.post("/record/stop");
      return response.data;
    } catch (error) {
      return delay({
        status: "stopped",
        meetingId: "mtg-004",
      });
    }
  },

  async transcribeChunk(audioBlob, language = "vi") {
    try {
      const formData = new FormData();
      formData.append("file", audioBlob, `live-chunk-${Date.now()}.webm`);

      const response = await api.post("/api/transcribe", formData, {
        params: {
          language,
        },
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error, "Live transcription failed."));
    }
  },

  async processSpeakerChunk(
    audioBlob,
    language = "vi",
    expectedSpeakers = 2,
  ) {
    try {
      const formData = new FormData();
      formData.append("file", audioBlob, `speaker-chunk-${Date.now()}.webm`);

      const response = await api.post("/api/process", formData, {
        params: {
          language,
          include_diarization: true,
          expected_speakers: expectedSpeakers,
          include_summary: false,
          include_llm: false,
        },
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      return response.data;
    } catch (error) {
      throw new Error(
        getErrorMessage(error, "Speaker-aware live transcription failed."),
      );
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
      const response = await api.get("/health");
      return response.data;
    } catch (error) {
      throw new Error(
        getErrorMessage(error, "Khong the ket noi toi backend AI."),
      );
    }
  },

  async getModelsStatus() {
    try {
      const response = await api.get("/models/status");
      return response.data;
    } catch (error) {
      throw new Error(
        getErrorMessage(error, "Khong the lay trang thai model."),
      );
    }
  },

  async transcribeAudio(file, language = "vi", includeSpeakers = true) {
    try {
      const formData = new FormData();
      formData.append("file", file);

      const endpoint = includeSpeakers
        ? "/api/transcribe-with-speakers"
        : "/api/transcribe";

      const response = await api.post(endpoint, formData, {
        params: {
          language,
          include_speakers: includeSpeakers,
        },
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error, "Speech to text that bai."));
    }
  },

  async processAudio(
    file,
    language = "vi",
    includeDiarization = true,
    expectedSpeakers = null,
    translateTo = null,
    includeSummary = true,
    includeLlm = true,
  ) {
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await api.post("/api/process", formData, {
        params: {
          language,
          include_diarization: includeDiarization,
          expected_speakers: expectedSpeakers || undefined,
          translate_to: translateTo || undefined,
          include_summary: includeSummary,
          include_llm: includeLlm,
        },
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error, "Xu ly audio that bai."));
    }
  },

  async processMeetingAudio(
    meetingId,
    file,
    language = "vi",
    includeDiarization = true,
    expectedSpeakers = null,
    translateTo = null,
    includeSummary = true,
    includeLlm = true,
  ) {
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await api.post(
        `/meetings/${meetingId}/process-audio`,
        formData,
        {
          params: {
            language,
            include_diarization: includeDiarization,
            expected_speakers: expectedSpeakers || undefined,
            translate_to: translateTo || undefined,
            include_summary: includeSummary,
            include_llm: includeLlm,
            replace_transcripts: true,
          },
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );

      return response.data;
    } catch (error) {
      throw new Error(
        getErrorMessage(error, "Xu ly audio va luu database that bai."),
      );
    }
  },

  async processMeetingAudioStream(
    meetingId,
    file,
    {
      language = "vi",
      includeDiarization = true,
      expectedSpeakers = null,
      translateTo = null,
      includeSummary = false,
      includeLlm = false,
      onEvent,
    } = {},
  ) {
    const formData = new FormData();
    formData.append("file", file);
    const params = new URLSearchParams({
      language,
      include_diarization: String(includeDiarization),
      include_summary: String(includeSummary),
      include_llm: String(includeLlm),
      replace_transcripts: "true",
    });
    if (expectedSpeakers) params.set("expected_speakers", String(expectedSpeakers));
    if (translateTo) params.set("translate_to", translateTo);

    const response = await fetch(
      `${api.defaults.baseURL}/meetings/${meetingId}/process-audio-stream?${params}`,
      {
        method: "POST",
        body: formData,
      },
    );
    if (!response.ok || !response.body) {
      throw new Error("Streaming transcription failed.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let finalData = null;

    const parseEvent = (raw) => {
      const lines = raw.split("\n");
      const event = lines.find((line) => line.startsWith("event: "))?.slice(7);
      const data = lines.find((line) => line.startsWith("data: "))?.slice(6);
      if (!event || !data) return;
      const parsed = JSON.parse(data);
      onEvent?.(event, parsed);
      if (event === "done") finalData = parsed;
      if (event === "saved") finalData = { ...(finalData || {}), saved: parsed };
      if (event === "error") throw new Error(parsed.message || "Streaming transcription failed.");
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() || "";
      chunks.filter(Boolean).forEach(parseEvent);
    }
    if (buffer.trim()) parseEvent(buffer.trim());
    return finalData;
  },

  async detectSpeakers(file) {
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await api.post("/api/diarize", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error, "Detect speaker that bai."));
    }
  },

  async translateText(text, direction, maxNewTokens = 512) {
    try {
      const response = await api.post("/api/translate", {
        text,
        direction,
        max_new_tokens: maxNewTokens,
      });
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error, "Dich noi dung that bai."));
    }
  },
  async runLlmAnalysis(transcript) {
    try {
      const response = await api.post("/debug/llm-test", {
        transcript,
      });
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error, "Phan tich LLM that bai."));
    }
  },

  buildQuestionAnswer(question, llmResult, displayLanguage = "vi") {
    const normalized = question.toLowerCase();
    const result = llmResult?.result || {};
    const actionItems = result.action_items || [];
    const decisions = result.decisions || [];
    const blockers = result.risks_or_blockers || [];

    if (
      normalized.includes("action") ||
      normalized.includes("task") ||
      normalized.includes("việc") ||
      normalized.includes("viec") ||
      normalized.includes("nhiệm vụ") ||
      normalized.includes("nhiem vu")
    ) {
      if (!actionItems.length) {
        return displayLanguage === "en"
          ? "No action items were returned from the LLM analysis."
          : "LLM chua tra ve action item nao.";
      }

      return actionItems
        .map((item, index) => {
          const suffix = [item.assignee, item.deadline]
            .filter(Boolean)
            .join(" - ");
          return `${index + 1}. ${item.task}${suffix ? ` (${suffix})` : ""}`;
        })
        .join("\n");
    }

    if (
      normalized.includes("decision") ||
      normalized.includes("quyết định") ||
      normalized.includes("quyet dinh")
    ) {
      if (!decisions.length) {
        return displayLanguage === "en"
          ? "No decisions were identified by the LLM."
          : "LLM chua xac dinh duoc quyet dinh nao.";
      }

      return decisions.map((item, index) => `${index + 1}. ${item}`).join("\n");
    }

    if (
      normalized.includes("risk") ||
      normalized.includes("block") ||
      normalized.includes("rui ro") ||
      normalized.includes("rủi ro") ||
      normalized.includes("vuong") ||
      normalized.includes("vướng")
    ) {
      if (!blockers.length) {
        return displayLanguage === "en"
          ? "No blockers or risks were identified by the LLM."
          : "LLM khong ghi nhan blocker hoac rui ro noi bat.";
      }

      return blockers.map((item, index) => `${index + 1}. ${item}`).join("\n");
    }

    return (
      result.summary ||
      result.meeting_minutes ||
      (displayLanguage === "en"
        ? "The LLM summary is not available yet."
        : "Tom tat LLM hien chua san sang.")
    );
  },
};

export default api;
