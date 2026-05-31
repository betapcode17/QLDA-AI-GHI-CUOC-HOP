import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';

test('GET /ready returns backend readiness', async () => {
  const res = await request(createApp()).get('/ready');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
});
