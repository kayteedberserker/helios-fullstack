import { CHECKOUT_MINUTES, planChange, RENEWAL_WINDOW_DAYS } from '../../shared/billing.js';
import { closeCheckoutLinks } from '../services/settlement-store.js';
import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { objectId, HttpError, requireUser } from '../lib/security.js';
import { settlePayment } from '../lib/payments.js';
import { inspectCheckoutLink, isFlutterwaveTestKey } from '../lib/flutterwave.js';
import { currencies, isPrice, resolvePlanPrices } from '../../shared/pricing.js';
const referenceSchema = z.string().regex(/^(?:helios|nooky_flw)_[a-f\d]{32}$/, 'Invalid payment reference.');

export function paymentRoutes({ models, config, auth, gateway, flutterwave, settlementStore }) {
  const router = Router();
  router.use(auth, requireUser);
  router.post('/checkout', async (req, res) => {
    const data = z.object({ planId: objectId, period: z.enum(['monthly', 'yearly']), currency: z.enum(currencies).default('USD') }).strict().parse(req.body);
    if (!config.flutterwaveSecret) throw new HttpError(503, 'Payments are not configured yet. Contact the Nooky team.');
    const plan = await models.Plan.findOne({ _id: data.planId, published: true });
    if (!plan || plan.code === 'free') throw new HttpError(400, 'Choose an available paid plan.');
    const currency = data.currency;
    const amount = resolvePlanPrices(plan, config.planPrices)[currency]?.[data.period];
    if (!isPrice(amount, currency)) throw new HttpError(400, 'This plan is not available in the selected currency.');
    const subscription = await models.Subscription.findOne({ userId: req.user._id }).lean();
    const change = planChange(subscription, plan.code);
    if (!change.allowed) throw new HttpError(409, change.kind === 'renew'
      ? `You can renew in the last ${RENEWAL_WINDOW_DAYS} days of your access.`
      : 'Your current plan must expire before you can buy a lower tier.');
    const expiresAt = new Date(Date.now() + CHECKOUT_MINUTES * 60000).toISOString();
    const reference = `nooky_flw_${crypto.randomBytes(16).toString('hex')}`;
    const payment = await models.Payment.create({ userId: req.user._id, email: req.user.email, planId: plan._id, planCode: plan.code, planName: plan.name, responseLimit: plan.responseLimit, period: data.period, amount, currency, reference, provider: 'flutterwave', checkoutExpiresAt: expiresAt, basePaymentId: subscription?.lastPaymentId ?? null, baseCancelledAt: subscription?.cancelledAt ?? null });
    const checkout = await flutterwave.initialise({ email: req.user.email, amount, currency, reference, expiresAt, sessionMinutes: CHECKOUT_MINUTES, redirectUrl: `${config.clientUrl}/payment/callback?reference=${reference}` });
    const { checkoutUrl, reason, hostname } = inspectCheckoutLink(checkout?.link, { testMode: isFlutterwaveTestKey(config.flutterwaveSecret) });
    if (!checkoutUrl) {
      console.warn('[FLUTTERWAVE] checkout link rejected', { reason, hostname, currency });
      const error = new HttpError(502, 'The payment provider returned an unexpected checkout URL.');
      error.code = 'FLUTTERWAVE_CHECKOUT_LINK_REJECTED';
      throw error;
    }
    const saved = await models.Payment.updateOne({ reference, status: 'pending', supersededAt: null }, { $set: { checkoutUrl } });
    if (!saved.matchedCount) {
      await closeCheckoutLinks([checkoutUrl], flutterwave.disableCheckout);
      throw new HttpError(409, 'Your plan changed before checkout was ready. Return to your dashboard to try again.');
    }
    res.status(201).json({ checkoutUrl, reference: payment.reference });
  });
  router.post('/verify', async (req, res) => {
    const { reference } = z.object({ reference: referenceSchema }).strict().parse(req.body);
    if (!await models.Payment.exists({ reference, userId: req.user._id })) throw new HttpError(404, 'Payment not found.');
    const payment = await settlePayment(reference, { verify: reference.startsWith('nooky_flw_') ? flutterwave.verify : gateway.verify, store: settlementStore });
    res.json({ payment: { reference: payment.reference, status: payment.status, amount: payment.amount, currency: payment.currency, planName: payment.planName, period: payment.period, paidAt: payment.paidAt, reviewReason: payment.reviewReason } });
  });
  return router;
}
