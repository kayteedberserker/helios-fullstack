import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { hashPassword, comparePassword, password, signupSchema, publicUser, hashToken, issueSession } from '../lib/security.js';
import { readConfig, assertServerConfig } from '../config.js';

test('passwords are hashed, checked, and rejected over bcrypt’s UTF-8 byte limit', async () => {
  const input = 'a-long-enough-secret'; const hash = await hashPassword(input);
  assert.notEqual(hash, input); assert.equal(await comparePassword(input, hash), true); assert.equal(await comparePassword('wrong-secret', hash), false);
  assert.equal(password.safeParse('short').success, false); assert.equal(password.safeParse('🌞'.repeat(20)).success, false);
});
test('public signup cannot set an administrator role or account status', () => {
  const data = { name: 'Maya', email: 'MAYA@example.com', password: 'a-long-enough-secret' };
  assert.equal(signupSchema.parse(data).email, 'maya@example.com');
  assert.equal(signupSchema.safeParse({ ...data, role: 'admin' }).success, false);
  assert.equal(signupSchema.safeParse({ ...data, status: 'active' }).success, false);
});
test('public account serialization does not leak password hashes or session version', () => {
  const user = publicUser({ _id: '000000000000000000000021', name: 'Maya', email: 'maya@example.com', role: 'user', status: 'active', passwordHash: 'private', sessionVersion: 2 });
  assert.equal('passwordHash' in user, false); assert.equal('sessionVersion' in user, false);
});
test('session cookie is HttpOnly and binds a CSRF secret to its signed token', () => {
  const config = readConfig({ JWT_SECRET: 's'.repeat(40), CLIENT_URL: 'https://helios.example.com', NODE_ENV: 'production' }); let cookie;
  const response = issueSession({ cookie: (name, value, options) => { cookie = { name, value, options }; } }, { _id: '000000000000000000000021', sessionVersion: 3, role: 'user' }, config);
  assert.equal(cookie.options.httpOnly, true); assert.equal(cookie.options.secure, true); assert.equal(cookie.options.sameSite, 'lax');
  const payload = jwt.verify(cookie.value, config.jwtSecret, { issuer: 'helios-api', audience: 'helios-web' });
  assert.equal(payload.csrf, response.csrf); assert.equal(payload.ver, 3); assert.ok(response.csrf.length >= 40);
});
test('reset and invitation tokens are stored as digests', () => { const token = 'a-private-link-token'; assert.notEqual(hashToken(token), token); assert.equal(hashToken(token), hashToken(token)); });
test('the server refuses missing or placeholder secrets and insecure production origins', () => {
  assert.throws(() => assertServerConfig(readConfig({})), /MONGODB_URI/);
  assert.throws(() => assertServerConfig(readConfig({ MONGODB_URI: 'mongodb://local', JWT_SECRET: 'change-me'.repeat(8) })), /JWT_SECRET/);
  assert.throws(() => readConfig({ NODE_ENV: 'production', CLIENT_URL: 'http://helios.example.com' }), /HTTPS/);
  assert.throws(() => readConfig({ COOKIE_SAME_SITE: 'none' }), /production HTTPS/);
});
