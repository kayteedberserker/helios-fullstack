import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateNairaPricing } from '../services/catalog.js';
import { defaultPlans } from '../../shared/catalog.js';
import { validatePaidTransaction } from '../lib/payments.js';

test('old dollar plans are archived and paused once; confirmed NGN prices survive restarts', async () => {
  const plans = [
    { code: 'free', currency: 'USD', monthlyPrice: 0, yearlyPrice: 0, published: true },
    { code: 'pro', currency: 'USD', monthlyPrice: 2500, yearlyPrice: 25000, published: true, responseLimit: 1000 },
    { code: 'max', currency: 'NGN', monthlyPrice: 2000000, yearlyPrice: 20000000, published: true },
  ];
  function evaluate(value, row) {
    if (typeof value === 'string' && value.startsWith('$')) return row[value.slice(1)];
    if (!value || typeof value !== 'object') return value;
    if (value.$ifNull) return evaluate(value.$ifNull[0], row) ?? evaluate(value.$ifNull[1], row);
    if (value.$eq) return evaluate(value.$eq[0], row) === evaluate(value.$eq[1], row);
    if (value.$ne) return evaluate(value.$ne[0], row) !== evaluate(value.$ne[1], row);
    return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, evaluate(val, row)]));
  }
  const models = { Plan: { updateMany: async (filter, pipeline) => {
    for (const row of plans.filter(p => p.currency !== filter.currency.$ne)) {
      for (const stage of pipeline) Object.assign(row, evaluate(stage.$set, structuredClone(row)));
    }
  } } };
  await migrateNairaPricing(models);
  assert.equal(plans[0].published, true); assert.equal(plans[0].currency, 'NGN');
  assert.equal(plans[1].monthlyPrice, 0); assert.equal(plans[1].published, false); assert.equal(plans[1].pricingNeedsReview, true);
  assert.deepEqual(plans[1].legacyPricing, { currency: 'USD', monthlyPrice: 2500, yearlyPrice: 25000 });
  assert.equal(plans[1].responseLimit, 1000); assert.equal(plans[2].monthlyPrice, 2000000);
  plans[1].monthlyPrice = 500000; plans[1].yearlyPrice = 5000000; plans[1].published = true;
  await migrateNairaPricing(models);
  assert.equal(plans[1].monthlyPrice, 500000); assert.equal(plans[1].published, true);
});
test('new paid plans are unavailable until explicit naira prices are configured', () => {
  for (const plan of defaultPlans.filter(p => p.code !== 'free')) {
    assert.equal(plan.currency, 'NGN'); assert.equal(plan.published, false); assert.equal(plan.pricingNeedsReview, true);
  }
});
test('NGN payments verify in kobo and reject an identical numeric amount in USD', () => {
  const payment = { reference: 'ref', currency: 'NGN', amount: 500000, email: 'maya@example.com' };
  const transaction = { ...payment, status: 'success', customer: { email: payment.email }, id: 10, paid_at: new Date().toISOString() };
  assert.doesNotThrow(() => validatePaidTransaction(payment, transaction));
  assert.throws(() => validatePaidTransaction(payment, { ...transaction, currency: 'USD' }), /do not match/);
});
