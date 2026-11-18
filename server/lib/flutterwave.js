import { HttpError } from './security.js';

export const isFlutterwaveTestKey = secret => typeof secret === 'string' && secret.startsWith('FLWSECK_TEST-');

// Validate the redirect returned by the v3 hosted checkout API. Diagnostic
// metadata never includes the payment link, query, credentials or API key.
export function inspectCheckoutLink(link, { testMode = false } = {}) {
  if (typeof link !== 'string' || !link.trim()) return { reason: 'missing_link' };
  const url = URL.parse(link);
  if (!url) return { reason: 'invalid_url' };
  if (url.protocol !== 'https:') return { reason: 'not_https' };
  if (url.username || url.password) return { reason: 'embedded_credentials' };
  const hostname = /^[a-z0-9.-]{1,253}$/.test(url.hostname) ? url.hostname : undefined;
  if (url.port) return { reason: 'unexpected_port', hostname };
  const trustedHost = hostname === 'checkout.flutterwave.com' ||
    (testMode && hostname === 'checkout-v2.dev-flutterwave.com');
  if (!trustedHost) return { reason: 'unexpected_hostname', hostname };
  return { checkoutUrl: url.href };
}

// Accept numeric amounts and plain decimal strings without rounding away
// extra precision, interpreting fee-inclusive amounts, or coercing other inputs.
function toMinorUnits(value) {
  if (typeof value === 'string') {
    if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return NaN;
    const [major, fraction = ''] = value.split('.');
    const minor = Number(major + fraction.padEnd(2, '0'));
    return Number.isSafeInteger(minor) ? minor : NaN;
  }
  if (typeof value !== 'number' || value < 0) return NaN;
  const scaled = value * 100;
  const minor = Math.round(scaled);
  return Number.isSafeInteger(minor) && Math.abs(scaled - minor) < 0.000001 ? minor : NaN;
}

export function createFlutterwave(secret, fetcher = fetch) {
  async function request(path, body, { timeout = 12000, allowEmpty = false } = {}) {
    if (!secret) throw new HttpError(503, 'Flutterwave is not configured.');
    let response;
    try {
      response = await fetcher('https://api.flutterwave.com/v3/' + path, {
        method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeout),
      });
    } catch { throw new HttpError(502, 'Flutterwave is temporarily unavailable. Try again shortly.'); }
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.status !== 'success' || (!allowEmpty && !result.data)) {
      console.warn('[FLUTTERWAVE] request rejected', response.status, path === 'payments/link/disable' ? 'disable checkout' : body ? 'checkout' : 'verification');
      throw new HttpError(502, 'Flutterwave could not complete the request. Check your merchant currency settings or try again.');
    }
    return result.data;
  }
  return {
    initialise: ({ reference, amount, currency, email, redirectUrl, expiresAt, sessionMinutes }) => request('payments', {
      tx_ref: reference, amount: amount / 100, currency, customer: { email }, redirect_url: redirectUrl, customizations: { title: 'Nooky' },
      ...(expiresAt ? { link_expiration: expiresAt } : {}),
      ...(sessionMinutes ? { configuration: { session_duration: sessionMinutes } } : {}),
    }),
    disableCheckout: link => request('payments/link/disable', { link }, { timeout: 2500, allowEmpty: true }),
    async verify(reference) {
      const data = await request('transactions/verify_by_reference?tx_ref=' + encodeURIComponent(reference));
      return { reference: data.tx_ref, amount: toMinorUnits(data.amount),
        currency: data.currency, customer: data.customer, id: data.id, paid_at: data.created_at,
        providerReference: data.flw_ref, method: data.payment_type, chargedAmount: toMinorUnits(data.charged_amount),
        status: data.status === 'successful' ? 'success' : data.status === 'failed' ? 'failed' : 'pending',
        providerStatus: data.status };
    },
  };
}
