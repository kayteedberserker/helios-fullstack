import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import { createServerlessHandler } from '../lib/serverless-handler.js';
import { createApp } from '../app.js';
import { readConfig } from '../config.js';
import { readApiJson } from '../../src/lib/httpResponse.js';
import { readFile } from 'node:fs/promises';

const silent = { info() {}, error() {} };
test('serverless requests share startup and keep the original API path and query', async () => {
  let calls = 0;
  const handler = createServerlessHandler(async () => {
    calls++;
    await new Promise(resolve => setTimeout(resolve, 20));
    return (req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ url: req.url })); };
  }, silent);
  const responses = await Promise.all([request(handler).get('/api/catalog?search=hello'), request(handler).get('/api/auth/me')]);
  assert.equal(calls, 1); assert.equal(responses[0].body.url, '/api/catalog?search=hello'); assert.equal(responses[1].body.url, '/api/auth/me');
  assert.equal(responses[0].headers['cache-control'], 'no-store');
});
test('failed startup returns safe JSON, logs no secrets, and can recover on the next invocation', async () => {
  const lines = []; const logger = { info: (...args) => lines.push(args), error: (...args) => lines.push(args) };
  let attempts = 0;
  const handler = createServerlessHandler(async () => {
    if (++attempts === 1) throw new Error('mongodb://user:private-password@host');
    return (req, res) => { res.end('ready'); };
  }, logger);
  const failed = await request(handler).get('/api/auth/me?token=private-token').set('Cookie', 'private-cookie');
  assert.equal(failed.status, 503); assert.equal(failed.body.code, 'API_STARTUP_FAILED');
  assert.equal((await request(handler).get('/api/catalog')).status, 200); assert.equal(attempts, 2);
  assert.doesNotMatch(JSON.stringify(lines) + failed.text, /private-password|private-token|private-cookie/);
});
test('the Vercel handler preserves raw webhook bytes for signature verification', async () => {
  const config = readConfig({ JWT_SECRET: 's'.repeat(40), PAYSTACK_SECRET_KEY: 'sk_test_webhook', CLIENT_URL: 'https://helios.example.com', NODE_ENV: 'production' });
  const handler = createServerlessHandler(async () => createApp({ config, serveStatic: false }), silent);
  const payload = '{ "event": "subscription.disable", "data": { "id": 7 } }';
  const signature = crypto.createHmac('sha512', config.paystackSecret).update(payload).digest('hex');
  const good = await request(handler).post('/api/payments/webhook').set('Content-Type', 'application/json').set('x-paystack-signature', signature).send(payload);
  assert.equal(good.status, 200);
  const bad = await request(handler).post('/api/payments/webhook').set('Content-Type', 'application/json').set('x-paystack-signature', signature).send(payload.replace('7', '8'));
  assert.equal(bad.status, 401);
  const unknown = await request(handler).get('/api/missing'); assert.equal(unknown.status, 404); assert.equal(unknown.body.message, 'API route not found.');
});
test('deployment routes prioritize the API over files and the React fallback', async () => {
  const config = JSON.parse(await readFile(new URL('../../vercel.json', import.meta.url)));
  const [api, files, spa] = config.routes;
  assert.equal(new RegExp(`^${api.src}$`).test('/api/auth/me'), true);
  assert.equal(new RegExp(`^${api.src}$`).test('/api/payments/webhook'), true);
  assert.equal(new RegExp(`^${api.src}$`).test('/app/dashboard'), false);
  assert.equal(api.dest, '/api/index.js'); assert.equal(files.handle, 'filesystem'); assert.equal(spa.dest, '/index.html');
  assert.equal(config.framework, 'vite'); assert.equal(config.outputDirectory, 'dist');
});
test('the frontend rejects HTML API fallbacks even when Vercel returns HTTP 200', async () => {
  await assert.rejects(readApiJson(new Response('<html>landing page</html>', { headers: { 'Content-Type': 'text/html' } })), /API deployment/);
  assert.deepEqual(await readApiJson(new Response('{"status":"ok"}', { headers: { 'Content-Type': 'application/json' } })), { status: 'ok' });
});
