import mongoose from 'mongoose';
import { subscriptionPeriod, validatePaidTransaction } from '../lib/payments.js';
import { HttpError } from '../lib/security.js';

export function mongoSettlementStore(models) {
  return {
    find: reference => models.Payment.findOne({ reference }).select('+email').lean(),
    recordFailure: reference => models.Payment.updateOne({ reference, appliedAt: null }, { $set: { status: 'failed' } }),
    async apply(reference, transaction) {
      return mongoose.connection.transaction(async session => {
        const payment = await models.Payment.findOne({ reference }).select('+email').session(session);
        if (!payment) throw new HttpError(404, 'Payment not found.');
        if (payment.appliedAt) return payment.toObject();
        validatePaidTransaction(payment, transaction);
        const current = await models.Subscription.findOne({ userId: payment.userId }).session(session).lean();
        const now = new Date();
        await models.Subscription.findOneAndUpdate({ userId: payment.userId }, { $set: {
          planId: payment.planId, planCode: payment.planCode, planName: payment.planName,
          responseLimit: payment.responseLimit, period: payment.period, lastPaymentId: payment._id,
          ...subscriptionPeriod(current, payment, now),
        } }, { upsert: true, new: true, session, runValidators: true });
        payment.status = 'success'; payment.providerId = String(transaction.id);
        payment.paidAt = new Date(transaction.paid_at); payment.appliedAt = now;
        await payment.save({ session });
        await models.Activity.create([{ userId: payment.userId, kind: 'payment', text: `${payment.planName} plan activated (${payment.period}).` }], { session });
        return payment.toObject();
      });
    },
  };
}
