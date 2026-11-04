import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { googleRoutes } from '../routes/google.js';
import { googleAccount, googleProvider } from '../services/google.js';
import { readConfig } from '../config.js';
import { createPaystack, paystackFailure } from '../lib/payments.js';

const config = readConfig({ JWT_SECRET: 's'.repeat(40), CLIENT_URL: 'https://nooky.example.com', GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret', NODE_ENV: 'production' });
const customer = { _id: '000000000000000000000021', name: 'Maya', email: 'maya@example.com', role: 'user', status: 'active', sessionVersion: 0 };
function fixture(overrides = {}) {
  const calls = [];
  const app = express(); app.use(cookieParser());
  const auth = async (req, res, next) => { if (req.get('x-test-session') !== 'valid') throw new Error('No session'); req.user = overrides.user || customer; next(); };
  app.use('/api/auth', googleRoutes({ config: overrides.config || config, models: {}, auth,
    provider: { exchange: async (...args) => { calls.push(args); return { sub: 'google-subject', email: customer.email, name: customer.name }; } },
    resolveAccount: overrides.resolveAccount || (async () => customer) }));
  app.use((err, req, res, next) => res.status(401).json({ message: 'Sign in required.' }));
  return { app, calls };
}
const flowCookie = response => response.headers['set-cookie'].find(c => c.startsWith('nooky_google_flow=')).split(';')[0];

test('Google start uses configured origin, signed browser state, nonce and PKCE', async () => {
  const { app } = fixture(); const start = await request(app).get('/api/auth/google/start');
  assert.equal(start.status, 302);
  const url = new URL(start.headers.location); assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('redirect_uri'), `${config.clientUrl}/api/auth/google/callback`);
  const signed = decodeURIComponent(flowCookie(start).split('=')[1]);
  const flow = jwt.verify(signed, config.jwtSecret, { algorithms: ['HS256'], issuer: 'nooky-google', audience: 'nooky-oauth' });
  assert.equal(url.searchParams.get('state'), flow.state); assert.equal(url.searchParams.get('nonce'), flow.nonce);
  assert.equal(url.searchParams.get('code_challenge'), crypto.createHash('sha256').update(flow.verifier).digest('base64url'));
  assert.match(start.headers['set-cookie'][0], /HttpOnly/); assert.match(start.headers['set-cookie'][0], /Secure/); assert.ok(flow.exp - flow.iat <= 600);
});
test('Google rejects missing, forged and mismatched browser state before contacting the provider', async () => {
  const { app, calls } = fixture(); const start = await request(app).get('/api/auth/google/start');
  for (const cookie of ['', 'nooky_google_flow=forged', flowCookie(start)]) {
    const res = await request(app).get('/api/auth/google/callback?code=unused&state=wrong').set('Cookie', cookie);
    assert.match(res.headers.location, /google_error=expired/);
  }
  assert.equal(calls.length, 0);
});
test('Google callback uses the bound verifier and nonce, issues the existing session and clears the flow cookie', async () => {
  const { app, calls } = fixture(); const start = await request(app).get('/api/auth/google/start');
  const state = new URL(start.headers.location).searchParams.get('state');
  const response = await request(app).get(`/api/auth/google/callback?state=${state}&code=one-use-code`).set('Cookie', flowCookie(start));
  assert.equal(response.headers.location, `${config.clientUrl}/app/dashboard`);
  assert.equal(calls[0][0], 'one-use-code'); assert.equal(calls[0][1].length, 64); assert.ok(calls[0][2]);
  assert.ok(response.headers['set-cookie'].some(c => c.startsWith('helios_session=') && c.includes('HttpOnly')));
  assert.ok(response.headers['set-cookie'].some(c => c.startsWith('nooky_google_flow=;')));
});
test('Google cancellation is handled without exchanging a code; missing credentials disable the button configuration', async () => {
  const { app, calls } = fixture(); const start = await request(app).get('/api/auth/google/start'); const state = new URL(start.headers.location).searchParams.get('state');
  const response = await request(app).get(`/api/auth/google/callback?state=${state}&error=access_denied`).set('Cookie', flowCookie(start));
  assert.match(response.headers.location, /google_error=cancelled/); assert.equal(calls.length, 0);
  const disabled = fixture({ config: { ...config, googleClientSecret: '' } }).app;
  assert.equal((await request(disabled).get('/api/auth/providers')).body.google, false);
});
test('linking Google requires the same authenticated customer session at start and callback', async () => {
  let linked;
  const { app } = fixture({ resolveAccount: async (models, profile, user) => { linked = user; return customer; } });
  assert.equal((await request(app).get('/api/auth/google/start?mode=link')).status, 401);
  const start = await request(app).get('/api/auth/google/start?mode=link').set('x-test-session', 'valid'); const state = new URL(start.headers.location).searchParams.get('state');
  const callback = `/api/auth/google/callback?state=${state}&code=once`;
  const failed = await request(app).get(callback).set('Cookie', flowCookie(start)); assert.match(failed.headers.location, /google_error=failed/); assert.equal(linked, undefined);
  const good = await request(app).get(callback).set('Cookie', flowCookie(start)).set('x-test-session', 'valid'); assert.equal(linked, customer); assert.match(good.headers.location, /google=linked/);
});
test('matching email never silently attaches Google to a password account, and suspended/admin users cannot sign in', async () => {
  const profile = { sub: 'google-sub', email: customer.email, name: 'Maya' };
  const models = { User: { findOne: async () => null, exists: async () => true } };
  await assert.rejects(googleAccount(models, profile, null), e => e.status === 409);
  for (const user of [{ ...customer, role: 'admin' }, { ...customer, status: 'suspended' }]) {
    await assert.rejects(googleAccount({ User: { findOne: async () => user } }, profile, null), e => e.status === 403);
  }
  await assert.rejects(googleAccount({}, { ...profile, email: 'different@example.com' }, customer), e => e.status === 403);
});
test('new Google customers receive only customer privileges and a Free subscription in one transaction', async () => {
  const writes = []; const session = {}; let inside = false;
  const create = type => async (rows, options) => { assert.equal(inside, true); assert.equal(options.session, session); writes.push([type, rows[0]]); return [{ ...customer, ...rows[0] }]; };
  const models = { User: { findOne: async () => null, exists: async () => false, create: create('user') }, Plan: { findOne: () => ({ session: async () => ({ _id: 'free-id', code: 'free', name: 'Free', responseLimit: 50 }) }) }, Subscription: { create: create('subscription') }, Activity: { create: create('activity') } };
  const user = await googleAccount(models, { sub: 'subject', email: customer.email, name: 'Maya' }, null, async fn => { inside = true; try { return await fn(session); } finally { inside = false; } });
  assert.equal(user.role, 'user'); assert.equal(writes[1][1].planCode, 'free'); assert.equal(writes[1][1].responseLimit, 50); assert.notEqual(writes[0][1].passwordHash, undefined);
});
test('Paystack categorizes USD eligibility, bad keys and outages without exposing arbitrary provider text', () => {
  assert.equal(paystackFailure(400, 'Currency not supported by merchant USD').code, 'PAYSTACK_CURRENCY');
  assert.equal(paystackFailure(401, 'Invalid key').code, 'PAYSTACK_AUTH');
  assert.equal(paystackFailure(429).code, 'PAYSTACK_RATE_LIMIT');
  assert.doesNotMatch(paystackFailure(500, 'secret@example.com secret-key').message, /secret@example.com|secret-key/);
});
test('Paystack rejects public keys before making a network request', async () => {
  await assert.rejects(createPaystack('pk_test_not_a_secret').initialise({}), /secret key beginning/);
});


test('Google exchange requires verified email and the exact nonce after ID token verification', async () => {
  let profile = { sub: 'subject', email: customer.email, email_verified: true, nonce: 'expected', name: 'Maya' };
  const client = { getToken: async options => { assert.equal(options.codeVerifier, 'verifier'); return { tokens: { id_token: 'signed-token' } }; }, verifyIdToken: async options => { assert.equal(options.audience, config.googleClientId); assert.equal(options.idToken, 'signed-token'); return { getPayload: () => profile }; } };
  const provider = googleProvider(config, client);
  assert.equal((await provider.exchange('code', 'verifier', 'expected')).email, customer.email);
  profile = { ...profile, nonce: 'wrong' };
  await assert.rejects(provider.exchange('code', 'verifier', 'expected'), e => e.status === 401);
  profile = { ...profile, nonce: 'expected', email_verified: false };
  await assert.rejects(provider.exchange('code', 'verifier', 'expected'), e => e.status === 401);
});


const administrator = { ...customer, _id: '000000000000000000000022', role: 'admin', email: 'admin@example.com' };
test('an existing administrator can explicitly link Google without changing privileges', async () => {
  let filter, update;
  const models = { User: { findOneAndUpdate: async (f, u) => { filter = f; update = u; return administrator; } } };
  const user = await googleAccount(models, { sub: 'admin-google', email: administrator.email }, administrator, undefined, 'admin');
  assert.equal(user.role, 'admin'); assert.equal(filter.role, 'admin'); assert.equal(filter._id, administrator._id);
  assert.deepEqual(update, { $set: { googleId: 'admin-google' } });
  await assert.rejects(googleAccount(models, { sub: 'admin-google', email: 'wrong@example.com' }, administrator, undefined, 'admin'), e => e.status === 403);
});
test('admin Google login accepts only an existing linked active administrator and never creates accounts', async () => {
  const profile = { sub: 'subject', email: administrator.email, name: 'Admin' };
  const linked = await googleAccount({ User: { findOne: async () => administrator } }, profile, null, undefined, 'admin');
  assert.equal(linked.role, 'admin');
  // Missing write methods deliberately make any attempted account creation fail.
  await assert.rejects(googleAccount({ User: { findOne: async () => null } }, profile, null, undefined, 'admin'), e => e.code === 'GOOGLE_ADMIN_UNLINKED');
  await assert.rejects(googleAccount({ User: { findOne: async () => customer } }, profile, null, undefined, 'admin'), e => e.status === 403);
  await assert.rejects(googleAccount({ User: { findOne: async () => ({ ...administrator, status: 'suspended' }) } }, profile, null, undefined, 'admin'), e => e.status === 403);
});
test('admin linking binds the actual authenticated role even when a customer portal is requested', async () => {
  let role, user;
  const { app } = fixture({ user: administrator, resolveAccount: async (models, profile, linked, txn, portal) => { role = portal; user = linked; return administrator; } });
  const start = await request(app).get('/api/auth/google/start?mode=link&role=user').set('x-test-session', 'valid');
  const state = new URL(start.headers.location).searchParams.get('state');
  const response = await request(app).get(`/api/auth/google/callback?state=${state}&code=once&role=user`).set('Cookie', flowCookie(start)).set('x-test-session', 'valid');
  assert.equal(role, 'admin'); assert.equal(user, administrator); assert.equal(response.headers.location, `${config.clientUrl}/admin/profile?google=linked`);
});
test('admin login portal is bound in signed state and redirects to the admin dashboard', async () => {
  let portal;
  const { app } = fixture({ resolveAccount: async (models, profile, linked, transaction, role) => { portal = role; return administrator; } });
  const start = await request(app).get('/api/auth/google/start?role=admin'); const state = new URL(start.headers.location).searchParams.get('state');
  const response = await request(app).get(`/api/auth/google/callback?state=${state}&code=once&role=user`).set('Cookie', flowCookie(start));
  assert.equal(portal, 'admin'); assert.equal(response.headers.location, `${config.clientUrl}/admin/dashboard`);
  assert.ok(response.headers['set-cookie'].some(c => c.startsWith('helios_session=')));
});
test('a customer account returned to an admin Google callback cannot receive an admin session', async () => {
  const { app } = fixture(); const start = await request(app).get('/api/auth/google/start?role=admin'); const state = new URL(start.headers.location).searchParams.get('state');
  const response = await request(app).get(`/api/auth/google/callback?state=${state}&code=once`).set('Cookie', flowCookie(start));
  assert.match(response.headers.location, /admin\/login\?google_error=account_unavailable/);
  assert.equal(response.headers['set-cookie'].some(c => c.startsWith('helios_session=')), false);
});
test('admin Google cancellation returns to admin login', async () => {
  const { app, calls } = fixture(); const start = await request(app).get('/api/auth/google/start?role=admin'); const state = new URL(start.headers.location).searchParams.get('state');
  const response = await request(app).get(`/api/auth/google/callback?state=${state}&error=access_denied`).set('Cookie', flowCookie(start));
  assert.equal(response.headers.location, `${config.clientUrl}/admin/login?google_error=cancelled`); assert.equal(calls.length, 0);
});
