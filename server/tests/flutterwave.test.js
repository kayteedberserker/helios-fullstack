import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlutterwave, inspectCheckoutLink } from '../lib/flutterwave.js';
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

test('the documented hosted checkout link is accepted and rejected links return only safe diagnostics', () => {
  const hostedLink = 'https://checkout.flutterwave.com/v3/hosted/pay/flwlnk-test?session=example';
  assert.deepEqual(inspectCheckoutLink(hostedLink), { checkoutUrl: hostedLink });
  for (const [link, reason, hostname] of [
    [undefined, 'missing_link'],
    [{ url: hostedLink }, 'missing_link'],
    ['/relative-payment', 'invalid_url'],
    ['http://checkout.flutterwave.com/v3/hosted/pay/test', 'not_https'],
    ['https://someone:secret@checkout.flutterwave.com/pay', 'embedded_credentials'],
    ['https://checkout.flutterwave.com:8443/pay', 'unexpected_port', 'checkout.flutterwave.com'],
    ['https://checkout.flutterwave.com.other.example/pay/private-token?private=1', 'unexpected_hostname', 'checkout.flutterwave.com.other.example'],
  ]) {
    const info = inspectCheckoutLink(link);
    assert.equal(info.reason, reason);
    assert.equal(info.hostname, hostname);
    assert.equal(info.checkoutUrl, undefined);
    assert.doesNotMatch(JSON.stringify(info), /secret|private-token|private=1/);
  }
});

test('Flutterwave verification accepts an exact decimal amount without accepting rounded or fee-inclusive substitutes', async () => {
  const payment = { reference: 'test-reference', amount: 1299, currency: 'USD', email: 'example@example.com' };
  let amount;
  const gateway = createFlutterwave('test', async () => Response.json({ status: 'success', data: {
    tx_ref: payment.reference, amount, charged_amount: 12.99, currency: 'USD', status: 'successful',
    customer: { email: ' Example@Example.com ' }, id: 1, created_at: '2026-10-08T10:00:00Z',
  } }));
  amount = '12.99';
  let verified = await gateway.verify(payment.reference);
  assert.doesNotThrow(() => validatePaidTransaction(payment, verified));
  for (amount of ['12.98', '12.989', '12.990', '1.299e1', null]) {
    verified = await gateway.verify(payment.reference);
    assert.throws(() => validatePaidTransaction(payment, verified), /do not match/);
  }
});

test('Flutterwave receives checkout expiration and can disable a hosted link after activation', async () => {
  const requests = [];
  const link = 'https://checkout.flutterwave.com/v3/hosted/pay/example';
  const gateway = createFlutterwave('test', async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return Response.json({ status: 'success', data: url.endsWith('/disable') ? null : { link } });
  });
  const expiresAt = '2026-11-18T12:30:00.000Z';
  await gateway.initialise({ reference:'ref', amount:500000, currency:'NGN', email:'example@example.com', expiresAt, sessionMinutes:30 });
  await gateway.disableCheckout(link);
  assert.equal(requests[0].body.link_expiration, expiresAt);
  assert.equal(requests[0].body.configuration.session_duration, 30);
  assert.deepEqual(requests[1], { url:'https://api.flutterwave.com/v3/payments/link/disable', body:{ link } });
});
