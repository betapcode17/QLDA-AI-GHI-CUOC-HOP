import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/errors.js';

const ai = axios.create({ baseURL: env.AI_SERVICE_URL, timeout: 1000 * 60 * 30 });

const proxyUpload = async (endpoint, file, params = {}) => {
  if (!file) throw new AppError(400, 'File is required');
  const form = new FormData();
  form.append('file', fs.createReadStream(file.path), file.originalname);
  const { data } = await ai.post(endpoint, form, { params, headers: form.getHeaders() });
  return data;
};

export const aiService = {
  async health() {
    const { data } = await ai.get('/health');
    return data;
  },
  async models() {
    const { data } = await ai.get('/models/status');
    return data;
  },
  transcribe: (file, params) => proxyUpload('/api/transcribe', file, params),
  transcribeWithSpeakers: (file, params) => proxyUpload('/api/transcribe-with-speakers', file, params),
  diarize: (file, params) => proxyUpload('/api/diarize', file, params),
  process: (file, params) => proxyUpload('/api/process', file, params),
  async processStream(file, params, onChunk) {
    if (!file) throw new AppError(400, 'File is required');
    const form = new FormData();
    form.append('file', fs.createReadStream(file.path), file.originalname);
    const response = await ai.post('/api/process-stream', form, {
      params,
      headers: form.getHeaders(),
      responseType: 'stream',
      timeout: 1000 * 60 * 30
    });
    response.data.on('data', onChunk);
    return new Promise((resolve, reject) => {
      response.data.on('end', resolve);
      response.data.on('error', reject);
    });
  },
  async translateText(payload) {
    const { data } = await ai.post('/api/translate', payload);
    return data;
  },
  async summarizeText(payload) {
    const { data } = await ai.post('/api/summarize', payload);
    return data;
  },
  async llmTest(payload) {
    const { data } = await ai.post('/debug/llm-test', payload);
    return data;
  },
  async translateTranscript(id, direction = 'vi-en') {
    const transcript = await prisma.transcript.findUnique({ where: { id } });
    if (!transcript) throw new AppError(404, 'Transcript not found');
    const result = await this.translateText({ text: transcript.originalText, direction });
    return prisma.transcript.update({ where: { id }, data: { translatedText: result.translated_text } });
  }
};
