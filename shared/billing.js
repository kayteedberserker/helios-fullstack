export const DAY_MS = 86400000;
export const RENEWAL_WINDOW_DAYS = 7;
export const CHECKOUT_MINUTES = 30;
const tier = { free: 0, pro: 1, max: 2 };

export function planChange(subscription, planCode, now = new Date()) {
  if (!subscription || subscription.planCode === 'free') return { kind: 'start', allowed: true };
  const endsAt = subscription.endsAt ? new Date(subscription.endsAt) : null;
  if (endsAt && endsAt <= now) return { kind: 'start', allowed: true };
  if (subscription.planCode === planCode) {
    const renewsAt = endsAt && new Date(endsAt.getTime() - RENEWAL_WINDOW_DAYS * DAY_MS);
    return { kind: 'renew', allowed: !!renewsAt && renewsAt <= now, renewsAt };
  }
  return (tier[planCode] ?? -1) > (tier[subscription.planCode] ?? -1)
    ? { kind: 'upgrade', allowed: true }
    : { kind: 'downgrade', allowed: false, endsAt };
}

export function subscriptionPeriod(current, payment, now = new Date()) {
  const end = current?.endsAt && new Date(current.endsAt);
  const renew = current?.planCode === payment.planCode && end > now;
  const start = renew ? end : now;
  return { startsAt: renew ? current.startsAt : now, endsAt: new Date(start.getTime() + (payment.period === 'yearly' ? 365 : 30) * DAY_MS) };
}

export function paymentPresentation(payment) {
  if (payment.reviewReason) return { label: 'Paid · review needed', badge: 'pending' };
  if (payment.status === 'success') return { label: 'Paid', badge: 'active' };
  if (payment.status === 'failed') return { label: 'Failed', badge: 'suspended' };
  if (payment.supersededAt) return { label: 'Checkout replaced', badge: 'neutral' };
  if (payment.checkoutExpiresAt && new Date(payment.checkoutExpiresAt) <= new Date()) return { label: 'Checkout expired', badge: 'neutral' };
  return { label: 'Pending', badge: 'pending' };
}
