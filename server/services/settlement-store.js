import mongoose from 'mongoose';
import { planChange, subscriptionPeriod } from '../../shared/billing.js';
import { validatePaidTransaction } from '../lib/payments.js';
import { HttpError } from '../lib/security.js';

export function settlementReviewReason(payment, current, now) {
  const currentPayment = current?.lastPaymentId;
  if (payment.supersededAt || (current?.cancelledAt && (!payment.createdAt || new Date(payment.createdAt) <= new Date(current.cancelledAt)))) {
    return 'checkout_replaced';
  }
  if (payment.baseCancelledAt !== undefined
    && String(payment.baseCancelledAt ?? '') !== String(current?.cancelledAt ?? '')) return 'checkout_replaced';
  if (payment.basePaymentId !== undefined) {
    if (String(payment.basePaymentId ?? '') !== String(currentPayment ?? '')) return 'checkout_replaced';
  } else if (currentPayment) {
    // Legacy checkouts did not record the subscription they were created against.
    const appliedAt = current.updatedAt ?? current.startsAt;
    if (!appliedAt || !payment.createdAt || new Date(payment.createdAt) <= new Date(appliedAt)) return 'checkout_replaced';
  }
  const change = planChange(current, payment.planCode, now);
  if (!change.allowed) return change.kind === 'renew' ? 'renewal_too_early' : 'active_higher_plan';
  return null;
}

export async function closeCheckoutLinks(links, disableCheckout) {
  if (!disableCheckout || !links.length) return;
  const results = await Promise.allSettled(links.map(async link => disableCheckout(link)));
  const failures = results.filter(result => result.status === 'rejected').length;
  if (failures) console.warn('[BILLING] could not disable replaced Flutterwave checkout links', { count: failures });
}

export async function lockBillingAccount(models, userId, session) {
  const account = await models.User.updateOne({ _id: userId }, { $inc: { billingRevision: 1 } }, { session, timestamps: false });
  if (!account.matchedCount) throw new HttpError(404, 'Payment account not found.');
}

export async function supersedePendingCheckouts(models, userId, now, session, { excludePaymentId, collectLinks = false } = {}) {
  const stale = { userId, status: 'pending', supersededAt: null, createdAt: { $lte: now },
    ...(excludePaymentId ? { _id: { $ne: excludePaymentId } } : {}) };
  const links = collectLinks ? await models.Payment.find({ ...stale, provider: 'flutterwave', checkoutUrl: { $type: 'string' } })
    .select('+checkoutUrl').sort({ createdAt: -1 }).limit(12).session(session).lean() : [];
  await models.Payment.updateMany(stale, { $set: { supersededAt: now }, $unset: { checkoutUrl: 1 } }, { session });
  return links.map(row => row.checkoutUrl);
}

export function mongoSettlementStore(models, { disableCheckout, transact = run => mongoose.connection.transaction(run) } = {}) {
  return {
    find: reference => models.Payment.findOne({ reference }).select('+email').lean(),
    recordFailure: reference => models.Payment.updateOne({ reference, appliedAt: null, reviewReason: null }, { $set: { status: 'failed' } }),
    async apply(reference, transaction) {
      const result = await transact(async session => {
        const payment = await models.Payment.findOne({ reference }).select('+email +basePaymentId +baseCancelledAt +checkoutUrl').session(session);
        if (!payment) throw new HttpError(404, 'Payment not found.');
        if (payment.appliedAt || payment.reviewReason) return { payment: payment.toObject(), links: [] };
        validatePaidTransaction(payment, transaction);
        // Write the account row before touching the subscription. Concurrent
        // settlements on one account conflict and retry on a fresh snapshot.
        await lockBillingAccount(models, payment.userId, session);
        const current = await models.Subscription.findOne({ userId: payment.userId }).session(session).lean();
        const now = new Date();
        const reason = settlementReviewReason(payment, current, now);
        payment.status = 'success';
        payment.providerId = String(transaction.id);
        payment.paidAt = new Date(transaction.paid_at);
        payment.checkoutUrl = undefined;
        if (reason) {
          payment.reviewReason = reason;
          await payment.save({ session });
          await models.Activity.create([{ userId: payment.userId, kind: 'payment', text: `Your ${payment.planName} payment needs a billing review. Your plan was not changed.` }], { session });
          return { payment: payment.toObject(), links: [] };
        }

        await models.Subscription.findOneAndUpdate({ userId: payment.userId }, { $set: {
          planId: payment.planId, planCode: payment.planCode, planName: payment.planName,
          responseLimit: payment.responseLimit, period: payment.period, lastPaymentId: payment._id,
          ...subscriptionPeriod(current, payment, now),
        }, $unset: { cancelledAt: 1 } }, { upsert: true, new: true, session, runValidators: true });
        payment.appliedAt = now;
        await payment.save({ session });
        const links = await supersedePendingCheckouts(models, payment.userId, now, session, {
          excludePaymentId: payment._id, collectLinks: !!disableCheckout,
        });
        await models.Activity.create([{ userId: payment.userId, kind: 'payment', text: `${payment.planName} plan activated (${payment.period}).` }], { session });
        return { payment: payment.toObject(), links };
      });
      await closeCheckoutLinks(result.links, disableCheckout);
      return result.payment;
    },
  };
}
