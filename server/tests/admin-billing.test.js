import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../app.js';
import { readConfig } from '../config.js';
import { mongoAdminBilling } from '../services/admin-billing.js';
import { settlementReviewReason } from '../services/settlement-store.js';

const config = readConfig({ JWT_SECRET: 's'.repeat(40), CLIENT_URL: 'http://localhost:4173' });
const id = '000000000000000000000001';
const customer = '000000000000000000000002';
const csrf = 'admin-billing-csrf';
const reference = 'nooky_flw_' + 'a'.repeat(32);
const actorId = '000000000000000000000003';
const note = 'Customer requested immediate cancellation.';
const doNotExpose = { card: { first_6digits: '123456' }, customer: { email: 'payer@example.com' } };

test('billing detail and mutations require admin credentials and do not accept a client-controlled success status', async () => {
  let result;
  const build = role => createApp({ config, models: {
    User: { findById: async () => ({ _id: actorId, role, status: 'active', sessionVersion: 0 }) },
  }, adminBilling: {
    read: async id => ({ id }),
    verify: async id => { result = { action: 'verify', id }; return result; },
    markFailed: async (id, args, actor) => { result = { action: 'fail', id, args, actor }; return result; },
  } });
  const get = app => request(app).get('/api/admin/payments/' + id);
  const post = (app, route) => request(app).post('/api/admin/payments/' + id + '/' + route);
  const cookie = 'helios_session=' + jwt.sign({ ver: 0, csrf }, config.jwtSecret, { subject: actorId, expiresIn: '1h', issuer: 'helios-api', audience: 'helios-web' });
  const auth = req => req.set('cookie', cookie).set('X-Nooky-Client', '1').set('Origin', config.clientUrl);
  const mutate = req => auth(req).set('X-CSRF-Token', csrf);
  const admin = build('admin');
  assert.equal((await get(admin)).status, 401);
  assert.equal((await auth(get(build('user')))).status, 403);
  assert.equal((await auth(get(admin))).status, 200);
  assert.equal((await auth(post(admin, 'fail')).send({ reason: note })).status, 403);
  assert.equal((await mutate(post(admin, 'verify')).send({ status: 'success' })).status, 400);
  assert.equal((await mutate(post(admin, 'fail')).send({ reason: 'x' })).status, 400);
  assert.equal((await mutate(post(admin, 'cancel-subscription')).send({ reason: note })).status, 400);
  assert.equal(result, undefined);
  assert.equal((await mutate(post(admin, 'verify')).send({})).status, 200);
  assert.deepEqual(result, { action: 'verify', id });
  assert.equal((await mutate(post(admin, 'fail')).send({ reason: note })).status, 200);
  assert.deepEqual(result, { action: 'fail', id, args: { reason: note }, actor: actorId });
});

function billingFixture() {
  const now = new Date();
  const payment = { _id: id, userId: customer, reference, provider: 'flutterwave', status: 'pending', amount: 500000, currency: 'NGN' };
  const active = { _id: 'subscription', userId: customer, planCode: 'max', planName: 'Max', lastPaymentId: 'max-payment', updatedAt: now, endsAt: new Date(now.getTime()+86400000) };
  const history = [], disabled = [];
  let open = false;
  let transaction = { id: 17, reference, amount: 500000, chargedAmount: 520000, currency: 'NGN', status: 'pending',
    providerStatus: 'pending', providerReference: 'FLW-123', method: 'card', paid_at: now.toISOString(), ...doNotExpose };
  let grants = 0, closes = 0;
  const query = value => ({ select() { return this; }, session() { return this; }, populate() { return this; },
    sort() { return this; }, limit() { return this; }, lean: async () => structuredClone(value) });
  const models = {
    Payment: {
      findById: () => query(payment),
      find: () => query([{ checkoutUrl: 'https://checkout.flutterwave.com/pending' }]),
      updateOne: async (_, update) => { Object.assign(payment, update.$set); if (update.$unset) delete payment.checkoutUrl; },
      updateMany: async (_, update) => { assert.ok(open); closes++; Object.assign(payment, update.$set); },
    },
    User: { findById: () => query({ _id: customer, name: 'Customer', email: 'customer@example.com' }),
      updateOne: async filter => { assert.equal(filter._id, customer); assert.ok(open); return { matchedCount: 1 }; } },
    Subscription: { findOne: () => query(active), updateOne: async (_, change) => { assert.ok(open); Object.assign(active, change.$set); } },
    Activity: { create: async entries => { assert.ok(open); history.push(...entries); }, find: () => query(history) },
  };
  const transact = async run => { open = true; try { return await run('session'); } finally { open = false; } };
  const flutterwave = {
    verify: async ref => { assert.equal(ref, reference); return transaction; },
    disableCheckout: async url => { assert.equal(open, false); disabled.push(url); },
  };
  const settlementStore = {
    find: async () => payment,
    apply: async (_, data) => { grants++; payment.status = 'success'; payment.appliedAt = new Date(data.paid_at); return payment; },
  };
  const billing = mongoAdminBilling(models, { transact, flutterwave, gateway: {}, settlementStore });
  return { billing, payment, active, history, disabled, setTransaction: values => { transaction = { ...transaction, ...values }; },
    grants: () => grants, closes: () => closes };
}

test('provider check only applies a matching successful transaction and exposes a safe snapshot', async () => {
  const f = billingFixture();
  const pending = await f.billing.verify(id);
  assert.equal(pending.payment.status, 'pending');
  assert.equal(pending.payment.providerCheck.chargedAmount, 520000);
  assert.equal(pending.payment.providerCheck.providerReference, 'FLW-123');
  assert.doesNotMatch(JSON.stringify(pending), /123456|payer@example.com/);
  f.setTransaction({ status: 'success', providerStatus: 'successful', amount: 499999 });
  assert.match((await f.billing.verify(id)).notice, /do not match/);
  assert.equal(f.grants(), 0);
  await assert.rejects(f.billing.markFailed(id, { reason: note }, actorId), { status: 409 });
  f.setTransaction({ amount: 500000 });
  assert.equal((await f.billing.verify(id)).payment.status, 'success');
  await f.billing.verify(id);
  assert.equal(f.grants(), 1);
  await assert.rejects(f.billing.markFailed(id, { reason: note }, actorId), { status: 409 });
});

test('an admin closes a pending checkout without changing access and a later charge cannot activate it', async () => {
  const f = billingFixture();
  f.payment.checkoutUrl = 'https://checkout.flutterwave.com/open';
  const result = await f.billing.markFailed(id, { reason: note }, actorId);
  assert.equal(result.payment.status, 'failed');
  assert.equal(f.active.planCode, 'max');
  assert.deepEqual(f.disabled, ['https://checkout.flutterwave.com/open']);
  assert.equal(f.history[0].billingNote, note);
  assert.equal(f.history[0].actorId, actorId);
  assert.equal(settlementReviewReason(f.payment, f.active, new Date()), 'checkout_replaced');
});

test('subscription cancellation is revision-checked, ends access, closes pending checkouts and preserves the payment', async () => {
  const f = billingFixture();
  const revision = (await f.billing.read(id)).subscription.revision;
  await assert.rejects(f.billing.cancelSubscription(id, { reason: note, revision: '2025-01-01T00:00:00.000Z' }, actorId), { status: 409 });
  assert.equal(f.closes(), 0);
  const result = await f.billing.cancelSubscription(id, { reason: note, revision }, actorId);
  assert.equal(result.subscription.active, false);
  assert.equal(result.subscription.endsAt.getTime(), result.subscription.cancelledAt.getTime());
  assert.equal(result.payment.status, 'pending');
  assert.equal(f.closes(), 1);
  assert.deepEqual(f.disabled, ['https://checkout.flutterwave.com/pending']);
  assert.equal(f.history[0].billingNote, note);
  await assert.rejects(f.billing.cancelSubscription(id, { reason: note, revision }, actorId), { status: 409 });
  const racing = { planCode: 'pro', basePaymentId: f.active.lastPaymentId, baseCancelledAt: null, createdAt: new Date(Date.now()+1000) };
  assert.equal(settlementReviewReason(racing, f.active, new Date()), 'checkout_replaced');
});
