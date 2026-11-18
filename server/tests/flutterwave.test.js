import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlutterwave } from '../lib/flutterwave.js';
import { validatePaidTransaction } from '../lib/payments.js';

test('Flutterwave checkout converts stored minor units to major units and verifies the original currency and amount', async () => {
  const calls = [];
  const payment = { reference: 'test-reference', amount: 1299, currency: 'USD', email: 'example@example.com' };
  const gateway = createFlutterwave('test', async (url, opts) => {
    calls.push([url, opts]);
    return Response.json({ status: 'success', data: opts.method === 'POST' ? { link: 'https://checkout.flutterwave.com/test' } : {
      tx_ref: payment.reference, amount: 12.99, currency: 'USD', status: 'successful', customer: { email: payment.email }, id: 1, created_at: new Date().toISOString(),
    } });
  });
  await gateway.initialise(payment);
  assert.equal(JSON.parse(calls[0][1].body).amount, 12.99);
  const verified = await gateway.verify(payment.reference);
  assert.match(calls[1][0], /verify_by_reference\?tx_ref=test-reference$/);
  assert.doesNotThrow(() => validatePaidTransaction(payment, verified));
  assert.throws(() => validatePaidTransaction(payment, { ...verified, currency: 'EUR' }));
});
