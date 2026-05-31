import fs from 'fs/promises';
import path from 'path';
import { WebSocket, WebSocketServer } from 'ws';
import { v4 as uuid } from 'uuid';
import { env } from '../config/env.js';
import { aiService } from '../services/ai.service.js';
import { logger } from '../utils/logger.js';

const MAX_LIVE_CHUNK_BYTES = env.MAX_UPLOAD_MB * 1024 * 1024;

const sendJson = (socket, payload) => {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
};

const normalizeConfig = (payload = {}) => ({
  mode: payload.mode === 'multi' ? 'multi' : 'single',
  language: payload.language || 'vi',
  expectedSpeakers: Number(payload.expectedSpeakers) || 2
});

const extractSegments = (response, fallbackSpeaker) => {
  const segments = response?.transcript?.segments || response?.segments || [];
  if (Array.isArray(segments) && segments.length) {
    return segments
      .map((segment) => ({
        speaker: segment.speaker || segment.speaker_label || fallbackSpeaker,
        start: segment.start ?? segment.start_time ?? null,
        end: segment.end ?? segment.end_time ?? null,
        text: String(segment.text || segment.original_text || '').trim()
      }))
      .filter((segment) => segment.text);
  }

  const text = String(response?.text || response?.transcript?.text || '').trim();
  return text ? [{ speaker: fallbackSpeaker, start: null, end: null, text }] : [];
};

export const attachRecordingWebSocket = (server) => {
  const wss = new WebSocketServer({ server, path: '/ws/recording' });

  wss.on('connection', (socket, req) => {
    let config = normalizeConfig();
    const queue = [];
    let processing = false;
    let closed = false;

    sendJson(socket, {
      type: 'status',
      message: 'WebSocket connected. Send config, then audio chunks.'
    });

    const processQueue = async () => {
      if (processing || closed) return;

      const item = queue.shift();
      if (!item) return;

      processing = true;
      const chunkId = uuid();
      const filename = `live-${chunkId}.webm`;
      const filePath = path.join(env.UPLOAD_DIR, filename);

      try {
        await fs.mkdir(env.UPLOAD_DIR, { recursive: true });
        await fs.writeFile(filePath, item.buffer);

        sendJson(socket, {
          type: 'status',
          chunkId,
          message:
            config.mode === 'multi'
              ? 'Processing live chunk with diarization...'
              : 'Processing live chunk with STT...'
        });

        const file = {
          path: filePath,
          originalname: filename,
          mimetype: 'audio/webm',
          size: item.buffer.length
        };

        const response =
          config.mode === 'multi'
            ? await aiService.process(file, {
                language: config.language,
                include_diarization: true,
                expected_speakers: config.expectedSpeakers,
                include_summary: false,
                include_llm: false
              })
            : await aiService.transcribe(file, {
                language: config.language,
                include_speakers: false
              });

        const segments = extractSegments(
          response,
          config.mode === 'multi' ? 'SPEAKER' : 'Speaker'
        );

        segments.forEach((segment) => {
          sendJson(socket, {
            type: 'transcript_segment',
            chunkId,
            segment
          });
        });

        sendJson(socket, {
          type: 'chunk_done',
          chunkId,
          detected: segments.length,
          queued: queue.length
        });
      } catch (error) {
        logger.error('Live recording WebSocket chunk failed', {
          error: error.message,
          mode: config.mode,
          url: req.url
        });
        sendJson(socket, {
          type: 'error',
          chunkId,
          message: error.response?.data?.detail || error.message || 'Live transcription failed.'
        });
      } finally {
        await fs.rm(filePath, { force: true }).catch(() => {});
        processing = false;
        void processQueue();
      }
    };

    socket.on('message', (data, isBinary) => {
      if (!isBinary) {
        try {
          const payload = JSON.parse(data.toString());
          if (payload.type === 'config') {
            config = normalizeConfig(payload);
            sendJson(socket, {
              type: 'configured',
              mode: config.mode,
              language: config.language,
              expectedSpeakers: config.expectedSpeakers
            });
          }
        } catch (error) {
          sendJson(socket, { type: 'error', message: 'Invalid WebSocket message.' });
        }
        return;
      }

      const buffer = Buffer.from(data);
      if (!buffer.length) return;
      if (buffer.length > MAX_LIVE_CHUNK_BYTES) {
        sendJson(socket, { type: 'error', message: 'Audio chunk is too large.' });
        return;
      }

      queue.push({ buffer, receivedAt: Date.now() });
      sendJson(socket, { type: 'chunk_received', queued: queue.length });
      void processQueue();
    });

    socket.on('close', () => {
      closed = true;
      queue.length = 0;
    });

    socket.on('error', (error) => {
      logger.warn('Live recording WebSocket error', { error: error.message });
    });
  });

  logger.info('Live recording WebSocket mounted at /ws/recording');
  return wss;
};
