import crypto from 'node:crypto';
import { HttpError } from './security.js';

export function validWebhookSignature(rawBody, signature, secret) {
  if (!secret || !Buffer.isBuffer(rawBody) || !/^[a-f\d]{128}$/i.test(signature || '')) return false;
  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

export function validatePaidTransaction(payment, transaction) {
  if (!transaction || transaction.status !== 'success') throw new HttpError(409, 'Payment has not been completed yet. You can check again shortly.');
  if (transaction.reference !== payment.reference || transaction.amount !== payment.amount || transaction.currency !== payment.currency || transaction.customer?.email?.toLowerCase() !== payment.email.toLowerCase()) {
    throw new HttpError(409, 'Payment details do not match this purchase. Contact support.');
  }
  if (!transaction.id || !Number.isFinite(new Date(transaction.paid_at).getTime())) throw new HttpError(409, 'The payment provider returned incomplete payment details.');
}

export function subscriptionPeriod(current, payment, now = new Date()) {
  const end = current?.endsAt && new Date(current.endsAt);
  const renew = current?.planCode === payment.planCode && end > now;
  const start = renew ? end : now;
  return { startsAt: renew ? current.startsAt : now, endsAt: new Date(start.getTime() + (payment.period === 'yearly' ? 365 : 30) * 86400000) };
}

export async function settlePayment(reference, { verify, store }) {
  const payment = await store.find(reference);
  if (!payment) throw new HttpError(404, 'Payment not found.');
  if (payment.appliedAt) return payment;
  const transaction = await verify(reference);
  if (['failed', 'abandoned'].includes(transaction?.status) && transaction.reference === payment.reference && transaction.amount === payment.amount && transaction.currency === payment.currency && transaction.customer?.email?.toLowerCase() === payment.email.toLowerCase()) {
    await store.recordFailure(reference);
    throw new HttpError(409, 'This payment was not completed. Return to your dashboard to start a new checkout.');
  }
  validatePaidTransaction(payment, transaction);
  // The store must atomically update the payment AND entitlement. Its transaction
  // rechecks appliedAt so concurrent callbacks and webhook retries are harmless.
  return store.apply(reference, transaction);
}

export function createPaystack(secret) {
  async function request(path, body) {
    if (!secret) throw new HttpError(503, 'Payments are not configured yet. Please contact the Helios team.');
    let response;
    try {
      response = await fetch(`https://api.paystack.co${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
    } catch { throw new HttpError(502, 'The payment provider is unavailable. Please try again.'); }
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.status || !result.data) throw new HttpError(502, 'The payment provider could not process this request. Check your merchant configuration or try again later.');
    return result.data;
  }
  return { initialise: body => request('/transaction/initialize', body), verify: reference => request(`/transaction/verify/${encodeURIComponent(reference)}`) };
}
