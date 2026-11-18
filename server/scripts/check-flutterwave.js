import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { currencies } from '../../shared/pricing.js';
import { createFlutterwave, inspectCheckoutLink, isFlutterwaveTestKey } from '../lib/flutterwave.js';

const secret = process.env.FLUTTERWAVE_SECRET_KEY?.trim();
const currency = (process.argv[2] || 'NGN').toUpperCase();
const redirect = URL.parse(process.env.CLIENT_URL || 'https://example.com');
if (!isFlutterwaveTestKey(secret)) {
  console.error('Set a Flutterwave test secret in .env. This command will not create a live checkout.');
  process.exitCode = 1;
} else if (!currencies.includes(currency) || !redirect || !['http:', 'https:'].includes(redirect.protocol)) {
  console.error('Use NGN, USD, GBP or EUR and check that CLIENT_URL is a website origin.');
  process.exitCode = 1;
} else {
  try {
    const checkout = await createFlutterwave(secret).initialise({
      email: 'payments-test@example.com', amount: currency === 'NGN' ? 100000 : 1000, currency,
      reference: `nooky_check_${randomBytes(16).toString('hex')}`,
      redirectUrl: new URL('/payment/callback', redirect.origin).href,
    });
    const { checkoutUrl, reason, hostname } = inspectCheckoutLink(checkout?.link, { testMode: true });
    if (checkoutUrl) {
      console.log(`[FLUTTERWAVE] Accepted ${currency} test checkout on ${new URL(checkoutUrl).hostname}. No payment was taken.`);
    } else {
      console.error('[FLUTTERWAVE] checkout link rejected', { reason, hostname, currency });
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error.status ? error.message : 'The test checkout could not be initialized.');
    process.exitCode = 1;
  }
}
