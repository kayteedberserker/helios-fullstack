import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { createApp } from '../app.js';
import { readConfig } from '../config.js';
import { hashPassword, hashToken } from '../lib/security.js';

const config = readConfig({ JWT_SECRET: 's'.repeat(40), PAYSTACK_SECRET_KEY: 'sk_test_demo', CLIENT_URL: 'http://localhost:4173' });
const user = { _id: '000000000000000000000021', name: 'Maya', email: 'maya@example.com', role: 'user', status: 'active', timezone: 'UTC', sessionVersion: 0 };
const csrf = 'this-is-a-test-csrf-secret';
function cookie(version = 0) { return `helios_session=${jwt.sign({ ver: version, csrf }, config.jwtSecret, { subject: user._id, expiresIn: '1h', issuer: 'helios-api', audience: 'helios-web' })}`; }
function makeApp(overrides = {}) { return createApp({ config, models: { User: { findById: async () => user }, ...overrides.models }, gateway: overrides.gateway, settlementStore: overrides.settlementStore }); }
function writeHeaders(req, token = csrf) { return req.set('Cookie', cookie()).set('Origin', config.clientUrl).set('X-Helios-Client', '1').set('X-CSRF-Token', token); }

test('private user and administrator routes require a valid session', async () => {
  const app = makeApp();
  for (const path of ['/api/account/dashboard', '/api/agent', '/api/admin/dashboard', '/api/admin/payments']) assert.equal((await request(app).get(path)).status, 401);
});
test('a signed customer session cannot read administrator records', async () => {
  const response = await request(makeApp()).get('/api/admin/users').set('Cookie', cookie()); assert.equal(response.status, 403);
});
test('password changes and suspensions invalidate existing sessions', async () => {
  const versionChanged = makeApp({ models: { User: { findById: async () => ({ ...user, sessionVersion: 1 }) } } });
  assert.equal((await request(versionChanged).get('/api/auth/me').set('Cookie', cookie())).status, 401);
  const suspended = makeApp({ models: { User: { findById: async () => ({ ...user, status: 'suspended' }) } } });
  assert.equal((await request(suspended).get('/api/auth/me').set('Cookie', cookie())).status, 403);
});
test('mutations reject a missing or wrong CSRF secret and foreign origins', async () => {
  const app = makeApp();
  assert.equal((await writeHeaders(request(app).post('/api/auth/logout'), 'wrong').send({})).status, 403);
  assert.equal((await request(app).post('/api/auth/logout').set('Cookie', cookie()).set('X-Helios-Client', '1').set('X-CSRF-Token', csrf).set('Origin', 'https://other.example.com').send({})).status, 403);
  const good = await writeHeaders(request(app).post('/api/auth/logout')).send({}); assert.equal(good.status, 200); assert.match(good.headers['set-cookie'][0], /Expires=/);
});
test('public signup rejects injected admin privileges before any database write', async () => {
  const response = await request(makeApp()).post('/api/auth/signup').set('X-Helios-Client', '1').send({ name: 'Maya', email: 'maya@example.com', password: 'a-long-enough-password', role: 'admin' });
  assert.equal(response.status, 400);
});
test('login issues an HttpOnly session and separates customer and admin entry points', async () => {
  const secret = 'a-long-enough-test-password';
  const record = { ...user, passwordHash: await hashPassword(secret) };
  const app = makeApp({ models: { User: { findById: async () => record, findOne: () => ({ select: async () => record }) } } });
  const response = await request(app).post('/api/auth/login').set('X-Helios-Client', '1').send({ email: user.email, password: secret });
  assert.equal(response.status, 200); assert.equal(response.body.user.role, 'user'); assert.ok(response.body.csrf); assert.equal(response.body.user.passwordHash, undefined); assert.match(response.headers['set-cookie'][0], /HttpOnly/);
  const admin = await request(app).post('/api/auth/admin/login').set('X-Helios-Client', '1').send({ email: user.email, password: secret });
  assert.equal(admin.status, 401);
});
test('admin signup requires an email-bound invitation that cannot be reused', async () => {
  const original = mongoose.connection.transaction; let consumed = false, created = 0;
  const token = 'a'.repeat(43), address = 'invited@example.com';
  mongoose.connection.transaction = async callback => callback({});
  const app = makeApp({ models: {
    AdminInvite: { findOneAndUpdate: async filter => {
      assert.deepEqual(filter.usedAt, { $exists: false }); assert.ok(filter.expiresAt.$gt instanceof Date);
      if (filter.email !== address || filter.tokenHash !== hashToken(token) || consumed) return null;
      consumed = true; return { invitedBy: '000000000000000000000022' };
    } },
    User: { create: async values => { created += 1; return [{ ...user, ...values[0] }]; } }, Activity: { create: async () => [] },
  } });
  try {
    const body = { name: 'Invited Admin', email: address, password: 'a-long-enough-password', token };
    const other = await request(app).post('/api/auth/admin/signup').set('X-Helios-Client', '1').send({ ...body, email: 'other@example.com' }); assert.equal(other.status, 403);
    const valid = await request(app).post('/api/auth/admin/signup').set('X-Helios-Client', '1').send(body); assert.equal(valid.status, 201); assert.equal(valid.body.user.role, 'admin');
    const replay = await request(app).post('/api/auth/admin/signup').set('X-Helios-Client', '1').send(body); assert.equal(replay.status, 403); assert.equal(created, 1);
  } finally { mongoose.connection.transaction = original; }
});
test('customers cannot choose an agent owner and admins cannot use the customer agent API', async () => {
  const response = await writeHeaders(request(makeApp()).post('/api/agent')).send({ name: 'Sunny', templateId: '000000000000000000000011', userId: '000000000000000000000023' }); assert.equal(response.status, 400);
  const app = makeApp({ models: { User: { findById: async () => ({ ...user, role: 'admin' }) } } });
  assert.equal((await request(app).get('/api/agent').set('Cookie', cookie())).status, 403);
});
test('payment verification is scoped to the authenticated owner', async () => {
  let verified = false, filter;
  const app = makeApp({ models: { Payment: { exists: async query => { filter = query; return false; } } }, gateway: { verify: async () => { verified = true; } } });
  const reference = `helios_${'b'.repeat(32)}`;
  const response = await writeHeaders(request(app).post('/api/payments/verify')).send({ reference });
  assert.equal(response.status, 404); assert.equal(String(filter.userId), user._id); assert.equal(verified, false);
});
test('checkout uses the server price in USD cents, never a browser amount', async () => {
  let initialised, saved;
  const plan = { _id: '000000000000000000000002', code: 'pro', name: 'Pro', monthlyPrice: 2500, yearlyPrice: 25000, responseLimit: 1000 };
  const app = makeApp({ models: { Plan: { findOne: async () => plan }, Payment: { create: async data => { saved = data; return data; } } }, gateway: { initialise: async data => { initialised = data; return { authorization_url: 'https://checkout.paystack.com/test-checkout' }; } } });
  const forged = await writeHeaders(request(app).post('/api/payments/checkout')).send({ planId: plan._id, period: 'monthly', amount: 1 }); assert.equal(forged.status, 400);
  const valid = await writeHeaders(request(app).post('/api/payments/checkout')).send({ planId: plan._id, period: 'yearly' });
  assert.equal(valid.status, 201); assert.equal(initialised.amount, 25000); assert.equal(initialised.currency, 'USD'); assert.equal(saved.amount, 25000); assert.equal(initialised.callback_url, `${config.clientUrl}/payment/callback`);
});
test('the raw webhook route rejects altered bytes and accepts authentic events', async () => {
  let count = 0;
  const payment = { reference: `helios_${'c'.repeat(32)}`, amount: 2500, currency: 'USD', email: user.email };
  const transaction = { ...payment, status: 'success', id: 123, paid_at: new Date().toISOString(), customer: { email: user.email } };
  const app = makeApp({ gateway: { verify: async () => transaction }, settlementStore: { find: async () => payment, apply: async () => { count += 1; return { ...payment, status: 'success', appliedAt: new Date() }; } } });
  const body = JSON.stringify({ event: 'charge.success', data: { reference: payment.reference } });
  const signature = crypto.createHmac('sha512', config.paystackSecret).update(body).digest('hex');
  assert.equal((await request(app).post('/api/payments/webhook').set('Content-Type', 'application/json').set('x-paystack-signature', signature).send(body + ' ')).status, 401);
  assert.equal(count, 0);
  assert.equal((await request(app).post('/api/payments/webhook').set('Content-Type', 'application/json').set('x-paystack-signature', signature).send(body)).status, 200); assert.equal(count, 1);
});
test('unknown API URLs stay JSON 404s, including production SPA fallback', async () => {
  const app = createApp({ config: { ...config, production: true }, models: { User: { findById: async () => user } } });
  const response = await request(app).get('/api/does-not-exist');
  assert.equal(response.status, 404); assert.match(response.headers['content-type'], /application\/json/);
});
