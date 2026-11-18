import { HttpError } from './security.js';

export function createFlutterwave(secret, fetcher = fetch) {
  async function request(path, body) {
    if (!secret) throw new HttpError(503, 'Flutterwave is not configured.');
    let response;
    try {
      response = await fetcher('https://api.flutterwave.com/v3/' + path, {
        method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(12000),
      });
    } catch { throw new HttpError(502, 'Flutterwave is temporarily unavailable. Try again shortly.'); }
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.status !== 'success' || !result.data) {
      console.warn('[FLUTTERWAVE] request rejected', response.status, body ? 'checkout' : 'verification');
      throw new HttpError(502, 'Flutterwave could not complete the request. Check your merchant currency settings or try again.');
    }
    return result.data;
  }
  return {
    initialise: ({ reference, amount, currency, email, redirectUrl }) => request('payments', {
      tx_ref: reference, amount: amount / 100, currency, customer: { email }, redirect_url: redirectUrl, customizations: { title: 'Nooky' },
    }),
    async verify(reference) {
      const data = await request('transactions/verify_by_reference?tx_ref=' + encodeURIComponent(reference));
      const minor = typeof data.amount === 'number' && Number.isFinite(data.amount) ? Math.round(data.amount * 100) : NaN;
      return { reference: data.tx_ref, amount: Math.abs(data.amount * 100 - minor) < 0.000001 ? minor : NaN,
        currency: data.currency, customer: data.customer, id: data.id, paid_at: data.created_at,
        status: data.status === 'successful' ? 'success' : 'pending' };
    },
  };
}
