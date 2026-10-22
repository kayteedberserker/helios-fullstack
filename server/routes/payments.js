import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { objectId, HttpError, requireUser } from '../lib/security.js';
import { settlePayment } from '../lib/payments.js';
const referenceSchema = z.string().regex(/^helios_[a-f\d]{32}$/, 'Invalid payment reference.');

export function paymentRoutes({ models, config, auth, gateway, settlementStore }) {
  const router = Router();
  router.use(auth, requireUser);
  router.post('/checkout', async (req, res) => {
    const data = z.object({ planId: objectId, period: z.enum(['monthly', 'yearly']) }).strict().parse(req.body);
    if (!config.paystackSecret) throw new HttpError(503, 'Payments are not configured yet. Contact the Helios team.');
    const plan = await models.Plan.findOne({ _id: data.planId, published: true });
    if (!plan || plan.code === 'free') throw new HttpError(400, 'Choose an available paid plan.');
    const amount = data.period === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice;
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new HttpError(400, 'This plan does not have a valid price.');
    const reference = `helios_${crypto.randomBytes(16).toString('hex')}`;
    const payment = await models.Payment.create({ userId: req.user._id, email: req.user.email, planId: plan._id, planCode: plan.code, planName: plan.name, responseLimit: plan.responseLimit, period: data.period, amount, currency: 'USD', reference });
    const checkout = await gateway.initialise({ email: req.user.email, amount, currency: 'USD', reference, channels: ['card'], callback_url: `${config.clientUrl}/payment/callback`, metadata: { userId: String(req.user._id), planCode: plan.code, period: data.period } });
    const url = new URL(checkout.authorization_url);
    if (url.protocol !== 'https:' || (url.hostname !== 'checkout.paystack.com' && !url.hostname.endsWith('.paystack.com'))) throw new HttpError(502, 'The payment provider returned an unexpected checkout URL.');
    res.status(201).json({ checkoutUrl: url.href, reference: payment.reference });
  });
  router.post('/verify', async (req, res) => {
    const { reference } = z.object({ reference: referenceSchema }).strict().parse(req.body);
    if (!await models.Payment.exists({ reference, userId: req.user._id })) throw new HttpError(404, 'Payment not found.');
    const payment = await settlePayment(reference, { verify: gateway.verify, store: settlementStore });
    res.json({ payment: { reference: payment.reference, status: payment.status, amount: payment.amount, currency: payment.currency, planName: payment.planName, period: payment.period, paidAt: payment.paidAt } });
  });
  return router;
}
