# Flutterwave setup

New purchases use Flutterwave Standard (v3 hosted checkout). Keep the old Paystack secret and webhook if payments initiated before the switch can still arrive. Existing payment records and subscriptions are preserved.

1. Confirm which charge currencies are enabled on your Flutterwave merchant account. Start with test credentials.
2. Set server variables FLUTTERWAVE_SECRET_KEY and FLUTTERWAVE_WEBHOOK_HASH in Vercel (and locally for testing). Set the same webhook secret hash on Flutterwave and use https://YOUR-DOMAIN/api/payments/flutterwave/webhook. Keep NODEJS_HELPERS=0 for raw webhook parsing and enable webhook retries.
3. In **Admin → Agents & plans → Edit plan**, use the USD, NGN, GBP, and EUR buttons to enter each plan’s 30-day and 365-day prices in regular currency units (for example, `25` for $25). Use currencies enabled for your merchant account. Leave both amounts blank to disable that currency for the plan, and set at least one currency before publishing a paid plan.

   Existing values in `FLUTTERWAVE_PLAN_PRICES` and confirmed legacy NGN prices prefill the editor. Once you save a plan, its dashboard prices take precedence over the environment variable, including any currencies you cleared. The landing page keeps all tiers visible. Checkout requires a published plan with a price for the selected currency. USD is the initial choice; the browser remembers later selections.
4. Deploy the updated source. Test an enabled currency end to end: price display, hosted checkout, return to Nooky, verified plan activation and signed webhook retry. Nooky compares the provider reference, exact amount, currency and customer email before activating access. Checkout still buys a fixed access period and does not auto-renew.
