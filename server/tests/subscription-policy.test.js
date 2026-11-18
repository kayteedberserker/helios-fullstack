import test from 'node:test';
import assert from 'node:assert/strict';
import { DAY_MS, planChange, subscriptionPeriod } from '../../shared/billing.js';
import { settlePayment } from '../lib/payments.js';
import { mongoSettlementStore, settlementReviewReason } from '../services/settlement-store.js';

test('paid tiers allow upgrades, but renew only in the final seven days and downgrade after expiry', () => {
  const now = new Date('2026-11-18T12:00:00Z');
  const endsAt = new Date(now.getTime() + 7 * DAY_MS);
  const max = { planCode: 'max', startsAt: new Date(now.getTime() - 23 * DAY_MS), endsAt };
  assert.equal(planChange(max, 'max', new Date(now.getTime() - 1)).allowed, false);
  assert.equal(planChange(max, 'max', now).allowed, true);
  assert.equal(planChange(max, 'pro', now).allowed, false);
  assert.equal(planChange(max, 'pro', endsAt).allowed, true);
  assert.equal(planChange({ ...max, planCode: 'pro' }, 'max', now).kind, 'upgrade');
  assert.equal(subscriptionPeriod(max, { planCode: 'max', period: 'monthly' }, now).endsAt.getTime(), endsAt.getTime() + 30 * DAY_MS);
  assert.equal(subscriptionPeriod(max, { planCode: 'max', period: 'yearly' }, now).endsAt.getTime(), endsAt.getTime() + 365 * DAY_MS);
  assert.equal(subscriptionPeriod(max, { planCode: 'pro', period: 'monthly' }, endsAt).endsAt.getTime(), endsAt.getTime() + 30 * DAY_MS);
});

test('older unpaid records without a checkout snapshot cannot undo the last activation', () => {
  const now = new Date();
  const max = { planCode: 'max', lastPaymentId: 'max-payment', updatedAt: now, endsAt: new Date(now.getTime() + DAY_MS) };
  const older = new Date(now.getTime() - DAY_MS);
  assert.equal(settlementReviewReason({ planCode: 'pro', createdAt: older }, max, now), 'checkout_replaced');
  assert.equal(settlementReviewReason({ planCode: 'pro', basePaymentId: 'max-payment' }, max, now), 'active_higher_plan');
  assert.equal(settlementReviewReason({ planCode: 'max', basePaymentId: 'max-payment' }, { ...max, endsAt: new Date(now.getTime() + 10 * DAY_MS) }, now), 'renewal_too_early');
});

test('Pro → Max activation supersedes an older Pro checkout; its late charge goes to review once', async () => {
  const userId = 'customer';
  const records = new Map();
  let subscription, transactionOpen = false, locks = 0, writes = 0;
  const disabled = [];
  const now = new Date();
  const create = (reference, planCode, basePaymentId, account = userId) => {
    const payment = { _id: reference, reference, userId: account, status: 'pending', planCode, basePaymentId,
      provider: 'flutterwave', checkoutUrl: 'https://checkout.flutterwave.com/' + reference, period: 'monthly',
      amount: 500000, currency: 'NGN', createdAt: now };
    records.set(reference, payment);
    return payment;
  };
  const selectStale = query => {
    assert.equal(query.userId, userId);
    assert.equal(query.status, 'pending');
    return [...records.values()].filter(p => p.userId === query.userId && p._id !== query._id.$ne && p.status === query.status
      && !p.supersededAt && p.createdAt <= query.createdAt.$lte);
  };
  const Payment = {
    findOne: ({ reference }) => {
      const p = records.get(reference);
      const document = p && { ...p, toObject() { return { ...this }; }, async save() { Object.assign(p, this.toObject()); } };
      const result = { select: () => result, session: () => Promise.resolve(document), lean: async () => p };
      return result;
    },
    find: query => {
      const result = { select: () => result, sort: () => result, limit: () => result, session: () => result,
        lean: async () => selectStale(query).map(p => ({ checkoutUrl: p.checkoutUrl })) };
      return result;
    },
    updateMany: async (query, update) => { for (const payment of selectStale(query)) {
      Object.assign(payment, update.$set);
      delete payment.checkoutUrl;
    } },
  };
  const store = mongoSettlementStore({
    Payment,
    User: { updateOne: async filter => { assert.equal(filter._id, userId); locks++; return { matchedCount: 1 }; } },
    Subscription: {
      findOne: () => ({ session: () => ({ lean: async () => subscription }) }),
      findOneAndUpdate: async (_, update) => { assert.ok(transactionOpen); writes++; subscription = update.$set; },
    },
    Activity: { create: async () => {} },
  }, {
    disableCheckout: async url => { assert.equal(transactionOpen, false); disabled.push(url); },
    transact: async run => { transactionOpen = true; try { return await run('session'); } finally { transactionOpen = false; } },
  });
  const verify = async reference => ({ reference, amount: records.get(reference).amount, currency: 'NGN', status: 'success', id: reference, paid_at: now.toISOString() });
  const apply = reference => settlePayment(reference, { verify, store });

  create('first-pro', 'pro', null);
  await apply('first-pro');
  const max = create('upgrade-max', 'max', 'first-pro');
  const stale = create('second-pro', 'pro', 'first-pro');
  create('another-account', 'pro', null, 'another');
  const oldLink = stale.checkoutUrl;
  await apply(max.reference);
  assert.equal(subscription.planCode, 'max');
  assert.equal(subscription.lastPaymentId, max._id);
  assert.ok(stale.supersededAt);
  assert.deepEqual(disabled, [oldLink]);

  const expiry = subscription.endsAt;
  const late = await apply(stale.reference);
  assert.equal(late.status, 'success');
  assert.equal(late.reviewReason, 'checkout_replaced');
  assert.equal(late.appliedAt, undefined);
  assert.equal((await apply(stale.reference)).reviewReason, 'checkout_replaced');
  assert.equal((await apply(max.reference)).reviewReason, undefined);
  assert.equal(subscription.lastPaymentId, max._id);
  assert.equal(subscription.endsAt, expiry);
  assert.equal(writes, 2);
  assert.equal(locks, 3);
});
