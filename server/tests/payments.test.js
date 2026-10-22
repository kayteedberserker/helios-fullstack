import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { settlePayment, validatePaidTransaction, validWebhookSignature, subscriptionPeriod } from '../lib/payments.js';

const payment = { reference: `helios_${'a'.repeat(32)}`, amount: 2500, currency: 'USD', email: 'maya@example.com', planCode: 'pro', period: 'monthly' };
const paid = { reference: payment.reference, amount: 2500, currency: 'USD', status: 'success', id: 1234, paid_at: '2026-10-08T10:00:00Z', customer: { email: 'maya@example.com' } };
test('only a matching successful payment can grant access', () => {
  assert.doesNotThrow(() => validatePaidTransaction(payment, paid));
  for (const change of [{ status: 'failed' }, { amount: 2499 }, { amount: '2500' }, { currency: 'NGN' }, { reference: 'someone-elses-payment' }, { customer: { email: 'someone@example.com' } }, { id: null }, { paid_at: 'not-a-date' }]) {
    assert.throws(() => validatePaidTransaction(payment, { ...paid, ...change }));
  }
});
test('webhooks authenticate the original bytes and reject tampering', () => {
  const raw = Buffer.from('{"event":"charge.success", "amount":2500}'); const secret = 'a-paystack-test-secret';
  const signature = crypto.createHmac('sha512', secret).update(raw).digest('hex');
  assert.equal(validWebhookSignature(raw, signature, secret), true);
  assert.equal(validWebhookSignature(Buffer.from('{"event":"charge.success","amount":2500}'), signature, secret), false);
  assert.equal(validWebhookSignature(raw, 'invalid', secret), false); assert.equal(validWebhookSignature(raw, signature, ''), false);
});
test('concurrent verification and webhook replays grant the entitlement once', async () => {
  let record = { ...payment }, grants = 0; let lock = Promise.resolve();
  const store = { find: async () => ({ ...record }), apply: async () => {
    const prior = lock; let release; lock = new Promise(resolve => { release = resolve; }); await prior;
    try { if (!record.appliedAt) { grants += 1; record = { ...record, appliedAt: new Date(), status: 'success' }; } return { ...record }; } finally { release(); }
  } };
  const dependencies = { verify: async () => paid, store };
  await Promise.all(Array.from({ length: 8 }, () => settlePayment(payment.reference, dependencies)));
  await settlePayment(payment.reference, dependencies); assert.equal(grants, 1);
});
test('a mismatched provider response never reaches settlement', async () => {
  let applied = false;
  await assert.rejects(settlePayment(payment.reference, { verify: async () => ({ ...paid, currency: 'NGN' }), store: { find: async () => payment, apply: async () => { applied = true; } } }));
  assert.equal(applied, false);
});
test('verified failed payments are recorded without granting access', async () => {
  let recorded = false, applied = false;
  await assert.rejects(settlePayment(payment.reference, {
    verify: async () => ({ ...paid, status: 'failed' }),
    store: { find: async () => payment, recordFailure: async reference => { assert.equal(reference, payment.reference); recorded = true; }, apply: async () => { applied = true; } },
  }), /not completed/);
  assert.equal(recorded, true); assert.equal(applied, false);
});
test('same-plan renewals extend access; changed plans start a new term', () => {
  const now = new Date('2026-10-08T00:00:00Z'), current = { planCode: 'pro', startsAt: new Date('2026-09-28T00:00:00Z'), endsAt: new Date('2026-10-28T00:00:00Z') };
  assert.equal(subscriptionPeriod(current, payment, now).endsAt.toISOString(), '2026-11-27T00:00:00.000Z');
  assert.equal(subscriptionPeriod(current, { ...payment, planCode: 'max' }, now).endsAt.toISOString(), '2026-11-07T00:00:00.000Z');
  assert.equal(subscriptionPeriod(null, { ...payment, period: 'yearly' }, now).endsAt.toISOString(), '2027-10-08T00:00:00.000Z');
});
