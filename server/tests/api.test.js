import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { createApp } from '../app.js';
import { readConfig } from '../config.js';
import { hashPassword, hashToken } from '../lib/security.js';

const config = readConfig({ JWT_SECRET: 's'.repeat(40), PAYSTACK_SECRET_KEY: 'sk_test_demo', FLUTTERWAVE_SECRET_KEY: 'test-secret', FLUTTERWAVE_WEBHOOK_HASH: 'test-hash', FLUTTERWAVE_PLAN_PRICES: '{"pro":{"USD":{"monthly":2500,"yearly":25000}}}', CLIENT_URL: 'http://localhost:4173' });
const user = { _id: '000000000000000000000021', name: 'Maya', email: 'maya@example.com', role: 'user', status: 'active', timezone: 'UTC', sessionVersion: 0 };
const csrf = 'this-is-a-test-csrf-secret';
function cookie(version = 0) { return `helios_session=${jwt.sign({ ver: version, csrf }, config.jwtSecret, { subject: user._id, expiresIn: '1h', issuer: 'helios-api', audience: 'helios-web' })}`; }
function makeApp(overrides = {}) {
  const mock = overrides.models ?? {};
  const models = {
    User: { findById: async () => user },
    Subscription: { findOne: () => ({ lean: async () => null }) },
    ...mock,
    Payment: { updateOne: async () => ({ matchedCount: 1 }), ...mock.Payment },
  };
  return createApp({ config: overrides.config ?? config, models, gateway: overrides.gateway, flutterwave: overrides.flutterwave, settlementStore: overrides.settlementStore });
}
function writeHeaders(req, token = csrf) { return req.set('Cookie', cookie()).set('Origin', config.clientUrl).set('X-Nooky-Client', '1').set('X-CSRF-Token', token); }

test('private user and administrator routes require a valid session', async () => {
  const app = makeApp();
  for (const path of ['/api/account/dashboard', '/api/agent', '/api/admin/dashboard', '/api/admin/payments']) assert.equal((await request(app).get(path)).status, 401);
});
test('a signed customer session cannot read administrator records', async () => {
  const response = await request(makeApp()).get('/api/admin/users').set('Cookie', cookie()); assert.equal(response.status, 403);
});
test('self profile reports the saved Google connection without exposing the Google ID', async () => {
  for (const account of [{ ...user }, { ...user, role: 'admin', googleId: 'private-subject' }, { ...user, googleId: 'private-subject' }]) {
    const app = makeApp({ models: {
      User: {
        findById: async (_, projection) => { assert.match(projection, /\+googleId/); return account; },
        findByIdAndUpdate: (_, { $set }) => ({ select: async projection => {
          assert.match(projection, /\+googleId/); return { ...account, ...$set };
        } }),
      },
      Activity: { create: async () => {} },
    } });
    const me = await request(app).get('/api/auth/me').set('Cookie', cookie());
    const save = await writeHeaders(request(app).patch('/api/account/profile')).send({ name: 'Updated name', timezone: 'UTC' });
    for (const response of [me, save]) {
      assert.equal(response.status, 200);
      assert.equal(response.body.user.googleLinked, Boolean(account.googleId));
      assert.equal(response.body.user.googleId, undefined);
    }
  }
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
  assert.equal((await request(app).post('/api/auth/logout').set('Cookie', cookie()).set('X-Nooky-Client', '1').set('X-CSRF-Token', csrf).set('Origin', 'https://other.example.com').send({})).status, 403);
  const good = await writeHeaders(request(app).post('/api/auth/logout')).send({}); assert.equal(good.status, 200); assert.match(good.headers['set-cookie'][0], /Expires=/);
});
test('public signup rejects injected admin privileges before any database write', async () => {
  const response = await request(makeApp()).post('/api/auth/signup').set('X-Nooky-Client', '1').send({ name: 'Maya', email: 'maya@example.com', password: 'a-long-enough-password', role: 'admin' });
  assert.equal(response.status, 400);
});
test('login issues an HttpOnly session and separates customer and admin entry points', async () => {
  const secret = 'a-long-enough-test-password';
  const record = { ...user, passwordHash: await hashPassword(secret) };
  const app = makeApp({ models: { User: { findById: async () => record, findOne: () => ({ select: async () => record }) } } });
  const response = await request(app).post('/api/auth/login').set('X-Nooky-Client', '1').send({ email: user.email, password: secret });
  assert.equal(response.status, 200); assert.equal(response.body.user.role, 'user'); assert.ok(response.body.csrf); assert.equal(response.body.user.passwordHash, undefined); assert.match(response.headers['set-cookie'][0], /HttpOnly/);
  const admin = await request(app).post('/api/auth/admin/login').set('X-Nooky-Client', '1').send({ email: user.email, password: secret });
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
    const other = await request(app).post('/api/auth/admin/signup').set('X-Nooky-Client', '1').send({ ...body, email: 'other@example.com' }); assert.equal(other.status, 403);
    const valid = await request(app).post('/api/auth/admin/signup').set('X-Nooky-Client', '1').send(body); assert.equal(valid.status, 201); assert.equal(valid.body.user.role, 'admin');
    const replay = await request(app).post('/api/auth/admin/signup').set('X-Nooky-Client', '1').send(body); assert.equal(replay.status, 403); assert.equal(created, 1);
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
test('a customer can recover their Flutterwave payment with a different payer email', async () => {
  const reference = 'nooky_flw_' + 'a'.repeat(32);
  const payment = { reference, userId: user._id, email: user.email, provider: 'flutterwave', amount: 500000, currency: 'NGN', status: 'pending' };
  const paid = { reference, amount: payment.amount, currency: payment.currency, customer: { email: 'payer@example.com' }, id: 1, status: 'success', paid_at: '2026-11-18T12:00:00Z' };
  const check = async (owner, details = {}) => {
    let applied = 0, verified = 0;
    const app = makeApp({
      models: { Payment: { exists: async filter => filter.userId === owner && filter.reference === reference } },
      flutterwave: { verify: async ref => { assert.equal(ref, reference); verified++; return { ...paid, ...details }; } },
      settlementStore: { find: async () => payment, apply: async () => { applied++; return { ...payment, status: 'success' }; } },
    });
    const response = await writeHeaders(request(app).post('/api/payments/verify')).send({ reference });
    return [response.status, verified, applied];
  };
  assert.deepEqual(await check(user._id), [200, 1, 1]);
  assert.deepEqual(await check('other-customer'), [404, 0, 0]);
  assert.deepEqual(await check(user._id, { amount: payment.amount - 1 }), [409, 1, 0]);
  assert.deepEqual(await check(user._id, { currency: 'USD' }), [409, 1, 0]);
  assert.deepEqual(await check(user._id, { reference: 'nooky_flw_' + 'b'.repeat(32) }), [409, 1, 0]);
  assert.deepEqual(await check(user._id, { status: 'pending' }), [409, 1, 0]);
});
test('checkout uses the server price in NGN kobo, never a browser amount', async () => {
  let initialised, saved;
  const plan = { _id: '000000000000000000000002', code: 'pro', name: 'Pro', currency: 'NGN', monthlyPrice: 500000, yearlyPrice: 5000000, responseLimit: 1000 };
  const app = makeApp({ models: { Plan: { findOne: async () => plan }, Payment: { create: async data => { saved = data; return data; } } }, flutterwave: { initialise: async data => { initialised = data; return { link: 'https://checkout.flutterwave.com/test-checkout' }; } } });
  const forged = await writeHeaders(request(app).post('/api/payments/checkout')).send({ planId: plan._id, period: 'monthly', amount: 1 }); assert.equal(forged.status, 400);
  const valid = await writeHeaders(request(app).post('/api/payments/checkout')).send({ planId: plan._id, period: 'yearly', currency: 'NGN' });
  assert.equal(valid.status, 201); assert.equal(initialised.amount, 5000000); assert.equal(initialised.currency, 'NGN'); assert.equal(saved.amount, 5000000); assert.equal(saved.provider, 'flutterwave'); assert.equal(initialised.redirectUrl, `${config.clientUrl}/payment/callback?reference=${saved.reference}`);
  const usd = await writeHeaders(request(app).post('/api/payments/checkout')).send({ planId: plan._id, period: 'monthly' });
  assert.equal(usd.status, 201); assert.equal(saved.amount, 2500); assert.equal(initialised.currency, 'USD');
  assert.equal((await writeHeaders(request(app).post('/api/payments/checkout')).send({ planId: plan._id, period: 'monthly', currency: 'GBP' })).status, 400);
});
test('checkout enforces the renewal window and blocks purchasing a lower tier before expiry', async () => {
  const plan = { _id: '000000000000000000000002', code: 'pro', name: 'Pro', currency: 'NGN', monthlyPrice: 500000, yearlyPrice: 5000000 };
  const checkout = async (planCode, daysLeft) => {
    let created = 0;
    let purchase;
    const subscription = { planCode, endsAt: new Date(Date.now() + daysLeft * 86400000), lastPaymentId: '000000000000000000000042' };
    const app = makeApp({
      models: { Subscription: { findOne: () => ({ lean: async () => subscription }) }, Plan: { findOne: async () => plan },
        Payment: { create: async data => { created++; purchase = data; return data; } } },
      flutterwave: { initialise: async data => {
        assert.equal(data.sessionMinutes, 30);
        assert.ok(Date.parse(data.expiresAt) > Date.now());
        return { link: 'https://checkout.flutterwave.com/test-checkout' };
      } },
    });
    const response = await writeHeaders(request(app).post('/api/payments/checkout')).send({ planId: plan._id, period: 'monthly', currency: 'NGN' });
    if (purchase) assert.equal(purchase.basePaymentId, subscription.lastPaymentId);
    return [response.status, created];
  };
  assert.deepEqual(await checkout('pro', 8), [409, 0]);
  assert.deepEqual(await checkout('pro', 5), [201, 1]);
  assert.deepEqual(await checkout('max', 1), [409, 0]);
  assert.deepEqual(await checkout('max', -1), [201, 1]);
});
test('checkout redirects to the Flutterwave sandbox hostname only with a test key', async () => {
  const plan = { _id: '000000000000000000000002', code: 'pro', name: 'Pro', currency: 'NGN', monthlyPrice: 500000, yearlyPrice: 5000000, responseLimit: 1000 };
  const sandboxLink = 'https://checkout-v2.dev-flutterwave.com/v3/hosted/pay/test-link';
  const checkout = (key, link) => {
    const app = makeApp({
      config: { ...config, flutterwaveSecret: key, production: true },
      models: { Plan: { findOne: async () => plan }, Payment: { create: async data => data } },
      flutterwave: { initialise: async () => ({ link }) },
    });
    return writeHeaders(request(app).post('/api/payments/checkout')).send({ planId: plan._id, period: 'monthly', currency: 'NGN' });
  };
  const sandbox = await checkout('FLWSECK_TEST-example', sandboxLink);
  assert.equal(sandbox.status, 201);
  assert.equal(sandbox.body.checkoutUrl, sandboxLink);
  assert.equal((await checkout('FLWSECK-example', sandboxLink)).status, 502);
  assert.equal((await checkout('FLWSECK_TEST-example', 'https://checkout-v2.dev-flutterwave.com.example.com/v3/hosted/pay/test-link')).status, 502);
  const live = await checkout('FLWSECK-example', 'https://checkout.flutterwave.com/v3/hosted/pay/test-link');
  assert.equal(live.status, 201);
});
test('admin prices override environment prices for the catalog and checkout', async () => {
  const plan = { _id: '000000000000000000000002', code: 'pro', name: 'Pro', currency: 'NGN', monthlyPrice: 500000, yearlyPrice: 5000000, responseLimit: 1000, published: true };
  const adminId = '000000000000000000000022';
  const adminCookie = `helios_session=${jwt.sign({ ver: 0, csrf }, config.jwtSecret, { subject: adminId, expiresIn: '1h', issuer: 'helios-api', audience: 'helios-web' })}`;
  const queries = result => ({ select: () => queries(result), sort: () => queries(result), lean: async () => result });
  const payments = [];
  const app = makeApp({ models: {
    User: { findById: async id => id === adminId ? { ...user, _id: adminId, role: 'admin' } : user },
    Plan: { find: filter => queries(!filter || plan.published ? [plan] : []), findById: async () => plan,
      findOne: async () => plan.published ? plan : null, findByIdAndUpdate: async (_, { $set }) => Object.assign(plan, $set) },
    AgentTemplate: { find: () => queries([]) }, AgentInstance: { countDocuments: async () => 0 },
    Activity: { create: async () => {} }, Payment: { create: async data => (payments.push(data), data) },
  }, flutterwave: { initialise: async () => ({ link: 'https://checkout.flutterwave.com/test-checkout' }) } });
  const catalog = () => request(app).get('/api/catalog');
  const adminCatalog = () => request(app).get('/api/admin/catalog').set('Cookie', adminCookie);
  const patch = (prices, published = true) => writeHeaders(request(app).patch(`/api/admin/plans/${plan._id}`)).set('Cookie', adminCookie)
    .send({ name: 'Pro', description: 'An agent for your business.', responseLimit: 1000, features: [], published, prices });
  const checkout = currency => writeHeaders(request(app).post('/api/payments/checkout')).send({ planId: plan._id, period: 'yearly', currency });

  assert.deepEqual((await adminCatalog()).body.plans[0].prices, { USD: { monthly: 2500, yearly: 25000 }, NGN: { monthly: 500000, yearly: 5000000 } });
  assert.equal((await checkout('USD')).status, 201);
  for (const bad of [{ GBP: { monthly: 2200 } }, { EUR: { monthly: 100.5, yearly: 2000 } }, { NGN: { monthly: 4999, yearly: 6000 } }, { CAD: { monthly: 100, yearly: 1000 } }, {}]) {
    assert.equal((await patch(bad)).status, 400, JSON.stringify(bad));
  }
  const prices = { USD: { monthly: 3100, yearly: 31000 }, GBP: { monthly: 2200, yearly: 22000 }, EUR: { monthly: 2500, yearly: 25000 } };
  assert.equal((await patch(prices)).status, 200);
  assert.deepEqual((await adminCatalog()).body.plans[0].prices, prices);
  assert.deepEqual((await catalog()).body.plans[0].prices, prices);
  assert.equal(plan.monthlyPrice, 0);
  for (const currency of Object.keys(prices)) {
    assert.equal((await checkout(currency)).status, 201);
    assert.equal(payments.at(-1).amount, prices[currency].yearly);
    assert.equal(payments.at(-1).currency, currency);
  }
  assert.equal((await checkout('NGN')).status, 400);
  assert.equal(payments[0].amount, 25000);
  assert.equal((await patch({ GBP: prices.GBP })).status, 200);
  assert.equal((await checkout('USD')).status, 400);
  assert.equal((await patch({}, false)).status, 200);
  assert.deepEqual((await adminCatalog()).body.plans[0].prices, {});
  assert.deepEqual((await catalog()).body.plans, []);
});
test('new NGN checkout refuses dollar plans, unconfirmed naira prices, and amounts below the NGN minimum', async () => {
  let writes = 0, requests = 0;
  const plan = { _id: '000000000000000000000002', code: 'pro', name: 'Pro', currency: 'USD', monthlyPrice: 2500, yearlyPrice: 25000, responseLimit: 1000 };
  const app = makeApp({ models: { Plan: { findOne: async () => plan }, Payment: { create: async data => { writes++; return data; } } }, flutterwave: { initialise: async () => { requests++; } } });
  for (const change of [{ currency: 'USD' }, { currency: 'NGN', pricingNeedsReview: true }, { currency: 'NGN', pricingNeedsReview: false, monthlyPrice: 4999 }]) {
    Object.assign(plan, change);
    const response = await writeHeaders(request(app).post('/api/payments/checkout')).send({ planId: plan._id, period: 'monthly', currency: 'NGN' });
    assert.equal(response.status, 400);
  }
  assert.equal(writes, 0); assert.equal(requests, 0);
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

test('Flutterwave webhook requires a valid signature and verifies provider details before applying access', async () => {
  const reference = 'nooky_flw_' + 'a'.repeat(32);
  const payment = { reference, provider: 'flutterwave', amount: 2500, currency: 'USD', email: user.email };
  let applied = 0, currency = 'EUR';
  const app = makeApp({ flutterwave: { verify: async ref => ({ reference: ref, amount: 2500, currency, customer: { email: 'payer@example.com' }, status: 'success', id: 1, paid_at: new Date().toISOString() }) },
    settlementStore: { find: async () => payment, apply: async () => { applied++; return payment; } } });
  const body = JSON.stringify({ event: 'charge.completed', data: { tx_ref: reference, status: 'successful' } });
  const signature = crypto.createHmac('sha256', config.flutterwaveHash).update(body).digest('base64');
  const post = () => request(app).post('/api/payments/flutterwave/webhook').set('Content-Type', 'application/json');
  assert.equal((await post().set('flutterwave-signature', 'wrong').send(body)).status, 401);
  assert.equal((await post().set('flutterwave-signature', signature).send(body)).status, 409);
  assert.equal(applied, 0);
  currency = 'USD';
  assert.equal((await post().set('flutterwave-signature', signature).send(body)).status, 200);
  assert.equal(applied, 1);
});
