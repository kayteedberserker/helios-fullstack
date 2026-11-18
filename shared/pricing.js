export const currencies = ['USD', 'NGN', 'GBP', 'EUR'];
export const pricePeriods = ['monthly', 'yearly'];
export const minimumPrice = currency => currency === 'NGN' ? 5000 : 1;
export const maximumPrice = 100000000;
export const isPrice = (amount, currency) => Number.isSafeInteger(amount) && amount >= minimumPrice(currency);

export const selectAmount = (plan, currency, period) =>
  plan.prices?.[currency]?.[period] ?? (currency === 'NGN' && plan.currency === 'NGN' && !plan.pricingNeedsReview ? plan[period === 'yearly' ? 'yearlyPrice' : 'monthlyPrice'] : undefined);

export function resolvePlanPrices(plan, envPrices = {}) {
  const prices = plan.prices ?? envPrices[plan.code] ?? {};
  if (plan.prices != null || prices.NGN || plan.currency !== 'NGN' || plan.pricingNeedsReview) return prices;
  if (!isPrice(plan.monthlyPrice, 'NGN') && !isPrice(plan.yearlyPrice, 'NGN')) return prices;
  return { ...prices, NGN: { monthly: plan.monthlyPrice, yearly: plan.yearlyPrice } };
}

// Keep legacy NGN fields in sync while an explicit currency map controls availability.
export function planPriceChanges(prices) {
  return { prices, currency: 'NGN', monthlyPrice: prices.NGN?.monthly ?? 0, yearlyPrice: prices.NGN?.yearly ?? 0, pricingNeedsReview: false };
}
