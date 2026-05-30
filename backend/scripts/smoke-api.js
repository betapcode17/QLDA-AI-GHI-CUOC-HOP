import assert from 'node:assert/strict';

const baseUrl = process.env.API_BASE_URL || 'http://localhost:3001';

const state = {};
const results = [];

const request = async (method, path, { token, body, expected = [200], optional = false } = {}) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!expected.includes(response.status)) {
    if (optional) return { response, data, skipped: true };
    throw new Error(`${method} ${path} expected ${expected.join('/')} but got ${response.status}: ${text}`);
  }

  return { response, data };
};

const step = async (name, fn) => {
  try {
    const data = await fn();
    results.push({ name, status: 'PASS' });
    return data;
  } catch (error) {
    results.push({ name, status: 'FAIL', error: error.message });
    throw error;
  }
};

await step('GET /ready', async () => {
  const { data } = await request('GET', '/ready');
  assert.equal(data.status, 'ok');
});

await step('GET /users', async () => {
  const { data } = await request('GET', '/users?limit=10&search=example', { token: state.token });
  assert.ok(Array.isArray(data.results));
  state.memberId = data.results.find((user) => user.email === 'lan@example.com')?.id;
  assert.ok(state.memberId);
});

await step('POST /users', async () => {
  const suffix = Date.now();
  const { data } = await request('POST', '/users', {
    token: state.token,
    expected: [201],
    body: {
      username: `smoke_crud_${suffix}`,
      email: `smoke_crud_${suffix}@example.com`,
      fullName: 'Smoke CRUD User',
      password: 'Smoke@123456',
      role: 'Member'
    }
  });
  assert.equal(data.fullName, 'Smoke CRUD User');
  state.tempUserId = data.id;
});

await step('GET /users/:id', async () => {
  const { data } = await request('GET', `/users/${state.tempUserId}`, { token: state.token });
  assert.equal(data.id, state.tempUserId);
});

await step('PUT /users/:id', async () => {
  const { data } = await request('PUT', `/users/${state.tempUserId}`, {
    token: state.token,
    body: { fullName: 'Smoke CRUD User Updated' }
  });
  assert.equal(data.fullName, 'Smoke CRUD User Updated');
});

await step('PATCH /users/:id/role', async () => {
  const { data } = await request('PATCH', `/users/${state.memberId}/role`, {
    token: state.token,
    body: { role: 'Member' }
  });
  assert.equal(data.role, 'Member');
});

await step('DELETE /users/:id', async () => {
  const { data } = await request('DELETE', `/users/${state.tempUserId}`, { token: state.token });
  assert.equal(data.ok, true);
});

await step('GET /meetings', async () => {
  const { data } = await request('GET', '/meetings?limit=20&search=Sprint');
  assert.ok(Array.isArray(data.results));
  const meeting = data.results.find((item) => item.title === 'Sprint planning AI Meeting Assistant');
  assert.ok(meeting);
  state.meetingId = meeting.id;
});

await step('GET /meetings/:id', async () => {
  const { data } = await request('GET', `/meetings/${state.meetingId}`);
  assert.equal(data.id, state.meetingId);
  assert.ok(Array.isArray(data.transcript));
});

await step('PATCH /meetings/:id/status', async () => {
  const { data } = await request('PATCH', `/meetings/${state.meetingId}/status`, {
    token: state.token,
    body: { status: 'Completed' }
  });
  assert.equal(data.status, 'Completed');
});

await step('PUT /meetings/:id', async () => {
  const { data } = await request('PUT', `/meetings/${state.meetingId}`, {
    token: state.token,
    body: { description: 'Updated by smoke test.' }
  });
  assert.equal(data.description, 'Updated by smoke test.');
});

await step('GET /meetings/:id/participants', async () => {
  const { data } = await request('GET', `/meetings/${state.meetingId}/participants`);
  assert.ok(data.length >= 1);
});

await step('POST /meetings/:id/participants', async () => {
  const { data } = await request('POST', `/meetings/${state.meetingId}/participants`, {
    token: state.token,
    expected: [201],
    body: { userId: state.memberId, meetingRole: 'Participant' }
  });
  assert.equal(data.userId, state.memberId);
});

await step('PATCH /meetings/:id/participants/:userId/role', async () => {
  const { data } = await request('PATCH', `/meetings/${state.meetingId}/participants/${state.memberId}/role`, {
    token: state.token,
    body: { meetingRole: 'CoHost' }
  });
  assert.equal(data.meetingRole, 'CoHost');
});

await step('GET /meetings/:id/speakers', async () => {
  const { data } = await request('GET', `/meetings/${state.meetingId}/speakers`);
  assert.ok(data.length >= 1);
  state.speakerId = data[0].id;
});

await step('POST /meetings/:id/speakers', async () => {
  const { data } = await request('POST', `/meetings/${state.meetingId}/speakers`, {
    token: state.token,
    expected: [201],
    body: { speakerLabel: `SMOKE_${Date.now()}`, realName: 'Smoke Speaker', colorHex: '#f97316' }
  });
  assert.equal(data.realName, 'Smoke Speaker');
  state.createdSpeakerId = data.id;
});

await step('PATCH /speakers/:id', async () => {
  const { data } = await request('PATCH', `/speakers/${state.speakerId}`, {
    token: state.token,
    body: { colorHex: '#0ea5e9' }
  });
  assert.equal(data.colorHex, '#0ea5e9');
});

await step('DELETE /speakers/:id', async () => {
  const { data } = await request('DELETE', `/speakers/${state.createdSpeakerId}`, { token: state.token });
  assert.equal(data.ok, true);
});

await step('GET /meetings/:id/transcripts', async () => {
  const { data } = await request('GET', `/meetings/${state.meetingId}/transcripts`);
  assert.ok(data.length >= 1);
  state.transcriptId = data[0].id;
});

await step('POST /meetings/:id/transcripts', async () => {
  const { data } = await request('POST', `/meetings/${state.meetingId}/transcripts`, {
    token: state.token,
    expected: [201],
    body: {
      speakerId: state.speakerId,
      startTimestamp: 99.1,
      endTimestamp: 105.3,
      originalText: 'Smoke test transcript segment.',
      sentimentLabel: 'Neutral',
      behaviorLabel: 'Action'
    }
  });
  assert.equal(data.originalText, 'Smoke test transcript segment.');
  state.createdTranscriptId = data.id;
});

await step('PUT /transcripts/:id', async () => {
  const { data } = await request('PUT', `/transcripts/${state.createdTranscriptId}`, {
    token: state.token,
    body: { originalText: 'Updated smoke test transcript segment.' }
  });
  assert.equal(data.originalText, 'Updated smoke test transcript segment.');
});

await step('DELETE /transcripts/:id', async () => {
  const { data } = await request('DELETE', `/transcripts/${state.createdTranscriptId}`, { token: state.token });
  assert.equal(data.ok, true);
});

await step('PATCH /transcripts/:id/highlight', async () => {
  const { data } = await request('PATCH', `/transcripts/${state.transcriptId}/highlight`, {
    token: state.token,
    body: { isHighlighted: true }
  });
  assert.equal(data.isHighlighted, true);
});

await step('POST /transcripts/:id/analyze-sentiment', async () => {
  const { data } = await request('POST', `/transcripts/${state.transcriptId}/analyze-sentiment`, {
    token: state.token,
    body: { sentimentLabel: 'Positive' }
  });
  assert.equal(data.sentimentLabel, 'Positive');
});

await step('POST /transcripts/:id/analyze-behavior', async () => {
  const { data } = await request('POST', `/transcripts/${state.transcriptId}/analyze-behavior`, {
    token: state.token,
    body: { behaviorLabel: 'Decision' }
  });
  assert.equal(data.behaviorLabel, 'Decision');
});

await step('GET /meetings/:id/summaries', async () => {
  const { data } = await request('GET', `/meetings/${state.meetingId}/summaries`);
  assert.ok(data.length >= 1);
  state.summaryId = data[0].id;
});

await step('POST /meetings/:id/summaries', async () => {
  const { data } = await request('POST', `/meetings/${state.meetingId}/summaries`, {
    token: state.token,
    expected: [201],
    body: { summaryType: 'Detailed', content: 'Smoke test detailed summary.' }
  });
  assert.equal(data.summaryType, 'Detailed');
});

await step('PUT /summaries/:id/regenerate', async () => {
  const { data } = await request('PUT', `/summaries/${state.summaryId}/regenerate`, {
    token: state.token,
    body: { content: 'Updated smoke-test summary content.' }
  });
  assert.equal(data.content, 'Updated smoke-test summary content.');
});

await step('GET /meetings/:id/action-items', async () => {
  const { data } = await request('GET', `/meetings/${state.meetingId}/action-items`);
  assert.ok(data.length >= 1);
  state.actionItemId = data[0].id;
});

await step('POST /meetings/:id/action-items', async () => {
  const { data } = await request('POST', `/meetings/${state.meetingId}/action-items`, {
    token: state.token,
    expected: [201],
    body: { taskContent: 'Smoke test action item', assigneeName: 'System Admin', priority: 'Low', status: 'Todo' }
  });
  assert.equal(data.taskContent, 'Smoke test action item');
  state.createdActionItemId = data.id;
});

await step('PUT /action-items/:id', async () => {
  const { data } = await request('PUT', `/action-items/${state.createdActionItemId}`, {
    token: state.token,
    body: { priority: 'Medium', status: 'InProgress' }
  });
  assert.equal(data.status, 'InProgress');
});

await step('PATCH /action-items/:id/complete', async () => {
  const { data } = await request('PATCH', `/action-items/${state.actionItemId}/complete`, { token: state.token });
  assert.equal(data.status, 'Done');
});

await step('POST /meetings/:id/keywords/extract', async () => {
  const { data } = await request('POST', `/meetings/${state.meetingId}/keywords/extract`, { token: state.token });
  assert.ok(data.length >= 1);
  state.keywordId = data[0].id;
});

await step('GET /meetings/:id/keywords/top', async () => {
  const { data } = await request('GET', `/meetings/${state.meetingId}/keywords/top?limit=5`);
  assert.ok(data.length >= 1);
  state.keywordId = state.keywordId || data[0].id;
});

await step('PATCH /keywords/:id', async () => {
  const { data } = await request('PATCH', `/keywords/${state.keywordId}`, {
    token: state.token,
    body: { frequencyCount: 11 }
  });
  assert.equal(data.frequencyCount, 11);
});

await step('GET /meetings/:id/files', async () => {
  const { data } = await request('GET', `/meetings/${state.meetingId}/files`);
  assert.ok(Array.isArray(data));
});

await step('POST /meetings/:id/files/audio', async () => {
  const formData = new FormData();
  formData.append('file', new Blob(['smoke audio placeholder'], { type: 'audio/wav' }), 'smoke-audio.wav');
  const response = await fetch(`${baseUrl}/meetings/${state.meetingId}/files/audio`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${state.token}` },
    body: formData
  });
  const data = await response.json();
  assert.equal(response.status, 201);
  assert.equal(data.fileType, 'Audio');
  state.uploadedFileId = data.id;
});

await step('GET /files/:id', async () => {
  const { data } = await request('GET', `/files/${state.uploadedFileId}`);
  assert.equal(data.id, state.uploadedFileId);
});

await step('GET /files/:id/download', async () => {
  const response = await fetch(`${baseUrl}/files/${state.uploadedFileId}/download`);
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.equal(text, 'smoke audio placeholder');
});

await step('DELETE /files/:id', async () => {
  const { data } = await request('DELETE', `/files/${state.uploadedFileId}`, { token: state.token });
  assert.equal(data.ok, true);
});

await step('POST /meetings/:id/transcripts/import', async () => {
  const formData = new FormData();
  formData.append('file', new Blob(['SPEAKER_00: Imported transcript from smoke test.'], { type: 'text/plain' }), 'smoke-transcript.txt');
  const response = await fetch(`${baseUrl}/meetings/${state.meetingId}/transcripts/import`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${state.token}` },
    body: formData
  });
  const data = await response.json();
  assert.equal(response.status, 201);
  assert.ok(data.count >= 1);
});

await step('GET /search', async () => {
  const { data } = await request('GET', '/search?q=dashboard&limit=5', { token: state.token });
  assert.equal(data.q, 'dashboard');
  assert.ok(Array.isArray(data.meetings));
  assert.ok(Array.isArray(data.transcripts));
  assert.ok(Array.isArray(data.summaries));
  assert.ok(Array.isArray(data.actionItems));
});

await step('GET /meetings/:id/export/json', async () => {
  const response = await fetch(`${baseUrl}/meetings/${state.meetingId}/export/json`, {
    headers: { Authorization: `Bearer ${state.token}` }
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.id, state.meetingId);
});

await step('GET /meetings/:id/export/docx', async () => {
  const response = await fetch(`${baseUrl}/meetings/${state.meetingId}/export/docx`, {
    headers: { Authorization: `Bearer ${state.token}` }
  });
  assert.equal(response.status, 200);
  const buffer = Buffer.from(await response.arrayBuffer());
  assert.ok(buffer.length > 100);
  assert.equal(buffer.slice(0, 2).toString(), 'PK');
});

await step('GET /meetings/:id/export/pdf', async () => {
  const response = await fetch(`${baseUrl}/meetings/${state.meetingId}/export/pdf`, {
    headers: { Authorization: `Bearer ${state.token}` }
  });
  assert.equal(response.status, 200);
  const buffer = Buffer.from(await response.arrayBuffer());
  assert.ok(buffer.length > 100);
  assert.equal(buffer.slice(0, 4).toString(), '%PDF');
});

await step('GET /notes', async () => {
  const { data } = await request('GET', `/notes?meetingId=${state.meetingId}`, { token: state.token });
  assert.ok(data.length >= 1);
  state.noteId = data[0].id;
});

await step('POST /notes', async () => {
  const { data } = await request('POST', '/notes', {
    token: state.token,
    expected: [201],
    body: {
      meetingId: state.meetingId,
      transcriptId: state.transcriptId,
      noteContent: 'Created by smoke test.',
      isBookmark: true
    }
  });
  assert.equal(data.noteContent, 'Created by smoke test.');
  state.createdNoteId = data.id;
});

await step('PUT /notes/:id', async () => {
  const { data } = await request('PUT', `/notes/${state.noteId}`, {
    token: state.token,
    body: { noteContent: 'Updated by smoke test.' }
  });
  assert.equal(data.noteContent, 'Updated by smoke test.');
});

await step('DELETE /notes/:id', async () => {
  const { data } = await request('DELETE', `/notes/${state.createdNoteId}`, { token: state.token });
  assert.equal(data.ok, true);
});

await step('GET /dashboard/overview', async () => {
  const { data } = await request('GET', '/dashboard/overview', { token: state.token });
  assert.ok(data.totalMeetings >= 3);
});

await step('GET /dashboard/analytics', async () => {
  const { data } = await request('GET', '/dashboard/analytics', { token: state.token });
  assert.ok(Array.isArray(data.meetingTrend));
});

await step('GET /logs', async () => {
  const { data } = await request('GET', '/logs', { token: state.token });
  assert.ok(Array.isArray(data));
});

await step('POST /meetings and DELETE /meetings/:id', async () => {
  const created = await request('POST', '/meetings', {
    token: state.token,
    expected: [201],
    body: {
      title: `Smoke test meeting ${Date.now()}`,
      description: 'Temporary API smoke test meeting.',
      status: 'Scheduled'
    }
  });
  const deleted = await request('DELETE', `/meetings/${created.data.id}`, { token: state.token });
  assert.equal(deleted.data.ok, true);
});

const aiHealth = await request('GET', '/health', { expected: [200], optional: true }).catch((error) => ({
  skipped: true,
  error: error.message
}));
results.push({
  name: 'GET /health (AI proxy optional)',
  status: aiHealth.skipped ? 'SKIP' : 'PASS',
  error: aiHealth.error
});

console.table(results);
const failed = results.filter((item) => item.status === 'FAIL');
if (failed.length) process.exit(1);
