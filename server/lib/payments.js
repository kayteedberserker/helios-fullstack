import crypto from 'node:crypto';
import { HttpError } from './security.js';

export function validWebhookSignature(rawBody, signature, secret) {
  if (!secret || !Buffer.isBuffer(rawBody) || !/^[a-f\d]{128}$/i.test(signature || '')) return false;
  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

const normalizeEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const safeCurrency = value => typeof value === 'string' && /^[A-Z]{3}$/.test(value) ? value : null;
const safeAmount = value => Number.isSafeInteger(value) ? value : null;

function paymentMismatches(payment, transaction) {
  // Flutterwave's merchant-verified reference identifies the saved purchase;
  // its checkout email is payer contact information, not Nooky account ownership.
  const expectedEmail = normalizeEmail(payment.email);
  const reportedEmail = normalizeEmail(transaction.customer?.email);
  const emailMismatch = payment.provider !== 'flutterwave' && (!expectedEmail || reportedEmail !== expectedEmail);
  return [
    transaction.reference !== payment.reference && 'reference',
    !Number.isSafeInteger(transaction.amount) || transaction.amount !== payment.amount ? 'amount' : false,
    transaction.currency !== payment.currency && 'currency',
    emailMismatch && 'customer_email',
  ].filter(Boolean);
}

export function validatePaidTransaction(payment, transaction) {
  if (!transaction || transaction.status !== 'success') throw new HttpError(409, 'Payment has not been completed yet. You can check again shortly.');
  const fields = paymentMismatches(payment, transaction);
  if (fields.length) {
    console.warn('[PAYMENT] verification mismatch', {
      provider: payment.provider === 'flutterwave' ? 'flutterwave' : 'paystack',
      fields,
      ...(fields.includes('amount') ? { expectedMinor: safeAmount(payment.amount), reportedMinor: safeAmount(transaction.amount) } : {}),
      ...(fields.includes('currency') ? { expectedCurrency: safeCurrency(payment.currency), reportedCurrency: safeCurrency(transaction.currency) } : {}),
      ...(fields.includes('customer_email') ? { customerEmailPresent: !!normalizeEmail(transaction.customer?.email) } : {}),
    });
    throw new HttpError(409, 'Payment details do not match this purchase. Contact support.');
  }
  if (!transaction.id || !transaction.paid_at || !Number.isFinite(new Date(transaction.paid_at).getTime())) throw new HttpError(409, 'The payment provider returned incomplete payment details.');
}

export { subscriptionPeriod } from '../../shared/billing.js';

export async function settlePayment(reference, { verify, store }) {
  const payment = await store.find(reference);
  if (!payment) throw new HttpError(404, 'Payment not found.');
  if (payment.appliedAt || payment.reviewReason) return payment;
  const transaction = await verify(reference);
  if (['failed', 'abandoned'].includes(transaction?.status) && paymentMismatches(payment, transaction).length === 0) {
    await store.recordFailure(reference);
    throw new HttpError(409, 'This payment was not completed. Return to your dashboard to start a new checkout.');
  }
  validatePaidTransaction(payment, transaction);
  // The store must atomically update the payment AND entitlement. Its transaction
  // rechecks appliedAt so concurrent callbacks and webhook retries are harmless.
  return store.apply(reference, transaction);
}

export function paystackFailure(status, message = '') {
  if (/currency|\bngn\b/i.test(message) && /support|allow|enable|invalid|merchant/i.test(message)) return { code: 'PAYSTACK_CURRENCY', message: 'Paystack rejected NGN checkout for this merchant/key. Confirm this is the correct Nigerian merchant account and secret key.' };
  if (status === 401 || status === 403 || /invalid.*key|invalid.*secret|unauthori[sz]ed/i.test(message)) return { code: 'PAYSTACK_AUTH', message: 'Paystack rejected the secret key. Set PAYSTACK_SECRET_KEY to the merchant secret key (sk_test_... for testing), then redeploy.' };
  if (/amount|minimum/i.test(message)) return { code: 'PAYSTACK_AMOUNT', message: 'Paystack rejected this amount. Ask the administrator to check the plan price and the merchant currency minimum.' };
  if (status === 429) return { code: 'PAYSTACK_RATE_LIMIT', message: 'Paystack is receiving too many requests. Please wait and try again.' };
  return { code: 'PAYSTACK_MERCHANT', message: 'Paystack rejected checkout. Ask the administrator to run npm run payments:check with the test secret key and confirm NGN is enabled for this merchant.' };
}

export function createPaystack(secret) {
  async function request(path, body) {
    if (!secret) throw new HttpError(503, 'Payments are not configured yet. Please contact the Nooky team.');
    if (!/^sk_(test|live)_/.test(secret)) throw new HttpError(503, 'PAYSTACK_SECRET_KEY must be a secret key beginning sk_test_ or sk_live_, not a public key.');
    let response;
    try {
      response = await fetch(`https://api.paystack.co${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
    } catch { throw new HttpError(502, 'The payment provider is unavailable. Please try again.'); }
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.status || !result.data) {
      const failure = paystackFailure(response.status, typeof result?.message === 'string' ? result.message : '');
      console.warn('[PAYSTACK]', failure.code, 'HTTP', response.status);
      const error = new HttpError(502, failure.message); error.code = failure.code; throw error;
    }
    return result.data;
  }
  return { initialise: body => request('/transaction/initialize', body), verify: reference => request(`/transaction/verify/${encodeURIComponent(reference)}`) };
}
