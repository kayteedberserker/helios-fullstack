import crypto from 'node:crypto';
import { readConfig } from '../config.js';
import { createPaystack } from '../lib/payments.js';

const config = readConfig();
if (!config.paystackSecret.startsWith('sk_test_')) {
  console.error('This diagnostic only accepts sk_test_ secret keys. It will not create a live checkout.');
  process.exitCode = 1;
} else {
  try {
    await createPaystack(config.paystackSecret).initialise({ email: 'payments-test@example.com', amount: 5000, currency: 'NGN', reference: `nooky_check_${crypto.randomBytes(12).toString('hex')}`, channels: ['card'] });
    console.log('Paystack accepted a NGN 50.00 test checkout. No payment was taken. The key and NGN initialization work.');
  } catch (error) {
    console.error(error.status ? error.message : 'The test checkout could not be initialized. Check network access to api.paystack.co.');
    process.exitCode = 1;
  }
}
