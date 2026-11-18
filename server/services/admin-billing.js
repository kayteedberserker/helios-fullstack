import mongoose from 'mongoose';
import { settlePayment } from '../lib/payments.js';
import { HttpError } from '../lib/security.js';
import { closeCheckoutLinks, lockBillingAccount, supersedePendingCheckouts } from './settlement-store.js';

const isoDate = value => (value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null);
const safeToken = value => typeof value === 'string' && /^[a-z\d_:. -]{1,120}$/i.test(value) ? value : null;
const amount = value => Number.isSafeInteger(value) && value >= 0 ? value : null;

export function providerPaymentDetails(transaction) {
  const id = typeof transaction.id === 'number' && Number.isSafeInteger(transaction.id) ? String(transaction.id) : safeToken(transaction.id);
  return {
    checkedAt: new Date(), status: safeToken(transaction.providerStatus ?? transaction.status) || 'unknown',
    transactionId: id, providerReference: safeToken(transaction.providerReference), reference: safeToken(transaction.reference),
    amount: amount(transaction.amount), chargedAmount: amount(transaction.chargedAmount),
    currency: typeof transaction.currency === 'string' && /^[A-Z]{3}$/.test(transaction.currency) ? transaction.currency : null,
    method: safeToken(transaction.method ?? transaction.channel), transactionDate: isoDate(transaction.paid_at),
  };
}

export function mongoAdminBilling(models, { settlementStore, flutterwave, gateway, transact = run => mongoose.connection.transaction(run) }) {
  async function getPayment(id) {
    const payment = await models.Payment.findById(id).select('+providerCheck').lean();
    if (!payment) throw new HttpError(404, 'Payment not found.');
    return payment;
  }
  const read = async id => {
    const payment = await getPayment(id);
    const [customer, subscription, history] = await Promise.all([
      models.User.findById(payment.userId).select('name email').lean(),
      models.Subscription.findOne({ userId: payment.userId }).lean(),
      models.Activity.find({ billingPaymentId: id }).select('text createdAt actorId +billingNote')
        .populate('actorId', 'name').sort({ createdAt: -1 }).limit(12).lean(),
    ]);
    const active = !!subscription && subscription.planCode !== 'free' && !subscription.cancelledAt
      && (!subscription.endsAt || new Date(subscription.endsAt) > new Date());
    return {
      payment, customer,
      subscription: subscription && { ...subscription, active, revision: isoDate(subscription.updatedAt) },
      history,
    };
  };
  return {
    read,
    async verify(id) {
      const payment = await getPayment(id);
      const verify = payment.provider === 'flutterwave' ? flutterwave.verify : gateway.verify;
      let transaction;
      try { transaction = await verify(payment.reference); }
      catch (error) {
        if (error.status === 502) throw new HttpError(502, 'The provider could not verify this reference. Check whether the payment was attempted and whether the provider key is in the correct test or live mode.');
        throw error;
      }
      if (!transaction || typeof transaction !== 'object') throw new HttpError(502, 'Provider did not return a transaction.');
      const providerCheck = providerPaymentDetails(transaction);
      const matchesReference = transaction.reference === payment.reference;
      let notice;
      if (!matchesReference) {
        notice = 'The provider returned a different reference. No access was granted.';
      } else if (transaction.status === 'success' && !payment.appliedAt && !payment.reviewReason) {
        try {
          await settlePayment(payment.reference, { verify: async () => transaction, store: settlementStore });
        } catch (error) {
          if (error.status !== 409) throw error;
          notice = error.message;
        }
      } else if (['failed', 'abandoned'].includes(transaction.status)) {
        if (transaction.amount !== payment.amount || transaction.currency !== payment.currency) {
          notice = 'The provider reported a failed attempt with a different amount or currency. The purchase was left unchanged.';
        } else {
          // A later provider update does not rewrite historical paid records.
          await models.Payment.updateOne({ _id: id, status: 'pending', appliedAt: null, reviewReason: null }, { $set: { status: 'failed' } });
        }
      } else if (!payment.appliedAt && !payment.reviewReason) {
        notice = 'The provider has not confirmed a successful charge.';
      }
      // An earlier request must not replace a newer provider check.
      await models.Payment.updateOne({ _id: id, $or: [
        { 'providerCheck.checkedAt': { $exists: false } }, { 'providerCheck.checkedAt': { $lte: providerCheck.checkedAt } },
      ] }, { $set: { providerCheck } });
      return { ...await read(id), notice };
    },
    async markFailed(id, { reason }, actorId) {
      const payment = await getPayment(id);
      const checkoutUrl = await transact(async session => {
        await lockBillingAccount(models, payment.userId, session);
        const current = await models.Payment.findById(id).select('+checkoutUrl +providerCheck').session(session).lean();
        if (!current || current.status !== 'pending' || current.appliedAt || current.reviewReason
          || ['success', 'successful'].includes(current.providerCheck?.status)) {
          throw new HttpError(409, 'Only pending checkouts without a confirmed charge can be marked failed.');
        }
        await models.Payment.updateOne({ _id: id, status: 'pending' },
          { $set: { status: 'failed', supersededAt: new Date() }, $unset: { checkoutUrl: 1 } }, { session });
        await models.Activity.create([{ userId: payment.userId, actorId, kind: 'payment', billingPaymentId: id,
          text: 'An administrator closed this pending checkout.', billingNote: reason }], { session });
        return current.provider === 'flutterwave' ? current.checkoutUrl : null;
      });
      if (checkoutUrl) await closeCheckoutLinks([checkoutUrl], flutterwave.disableCheckout);
      return read(id);
    },
    async cancelSubscription(id, { reason, revision }, actorId) {
      const payment = await getPayment(id);
      const links = await transact(async session => {
        await lockBillingAccount(models, payment.userId, session);
        const subscription = await models.Subscription.findOne({ userId: payment.userId }).session(session).lean();
        const now = new Date();
        if (!subscription || subscription.planCode === 'free' || subscription.cancelledAt || (subscription.endsAt && new Date(subscription.endsAt) <= now)) {
          throw new HttpError(409, 'This customer has no active paid subscription.');
        }
        if (!revision || revision !== isoDate(subscription.updatedAt)) {
          throw new HttpError(409, 'The subscription changed. Reload its details before cancelling.');
        }
        await models.Subscription.updateOne({ _id: subscription._id }, { $set: { cancelledAt: now, endsAt: now } }, { session });
        const links = await supersedePendingCheckouts(models, payment.userId, now, session, { collectLinks: !!flutterwave.disableCheckout });
        await models.Activity.create([{ userId: payment.userId, actorId, kind: 'payment', billingPaymentId: id,
          text: `An administrator ended your ${subscription.planName || subscription.planCode} access.`, billingNote: reason }], { session });
        return links;
      });
      await closeCheckoutLinks(links, flutterwave.disableCheckout);
      return read(id);
    },
  };
}
