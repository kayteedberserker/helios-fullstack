# Flutterwave setup

New purchases use Flutterwave Standard (v3 hosted checkout). Keep the old Paystack secret and webhook if payments initiated before the switch can still arrive. Existing payment records and subscriptions are preserved.

1. Confirm which charge currencies are enabled on your Flutterwave merchant account. Start with test credentials.
2. Set server variables FLUTTERWAVE_SECRET_KEY and FLUTTERWAVE_WEBHOOK_HASH in Vercel (and locally for testing). Set the same webhook secret hash on Flutterwave and use https://YOUR-DOMAIN/api/payments/flutterwave/webhook. Keep NODEJS_HELPERS=0 for raw webhook parsing and enable webhook retries.
3. In **Admin → Agents & plans → Edit plan**, use the USD, NGN, GBP, and EUR buttons to enter each plan’s 30-day and 365-day prices in regular currency units (for example, `25` for $25). Use currencies enabled for your merchant account. Leave both amounts blank to disable that currency for the plan, and set at least one currency before publishing a paid plan.

   Existing values in `FLUTTERWAVE_PLAN_PRICES` and confirmed legacy NGN prices prefill the editor. Once you save a plan, its dashboard prices take precedence over the environment variable, including any currencies you cleared. The landing page keeps all tiers visible. Checkout requires a published plan with a price for the selected currency. USD is the initial choice; the browser remembers later selections.
4. Deploy the updated source. Test an enabled currency end to end: price display, hosted checkout, return to Nooky, verified plan activation and signed webhook retry. Nooky verifies the successful payment, merchant reference, exact amount and currency with Flutterwave before activating access for the Nooky account that started checkout. The payer email does not determine which account receives access. Checkout still buys a fixed access period and does not auto-renew.

Nooky accepts `checkout-v2.dev-flutterwave.com` as a checkout host only with a Flutterwave test secret (`FLWSECK_TEST-`). No extra checkout key or environment variable is required.

If checkout says the provider returned an unexpected URL, retry once and check the API log for `[FLUTTERWAVE] checkout link rejected`. The log includes the reason and, when available, the hostname, but never the full checkout link. You can also run `npm run flutterwave:check -- NGN` locally with your Flutterwave test key. Replace NGN with the currency that failed. This initializes a sandbox link without taking payment or touching MongoDB.

If checkout completed but Nooky says the payment details do not match, open **Dashboard → Your billing** and choose **Check payment** under the pending status. This verifies the existing transaction without opening a new checkout. Use **Check again** on the result page if you need to retry. In the API logs, `[PAYMENT] verification mismatch` shows which fields differ. Amounts in that log are in minor units (100 kobo per naira, 100 cents per dollar/euro, 100 pence per pound). The log excludes emails, references, and card details. Compare the original purchase with the matching transaction in the Flutterwave dashboard's test or live mode before attempting a new payment.

Renewals are manual and open during the final seven days of access. Renewing before expiry adds the purchased 30 or 365 days to the existing expiry date. Buying after expiry starts a new term. Upgrades start a new term immediately; lower tiers can be purchased after the current term ends.

An activated purchase replaces other open checkouts on that account. New Flutterwave links expire after 30 minutes. Nooky attempts to disable replaced links that it has stored; older links issued before this update may not be available to disable. If a replaced checkout still receives a verified payment, Nooky records the charge without changing the subscription. Use **Admin → Payments → Needs review** to find the charge and reconcile it in the provider dashboard. Nooky does not automatically refund payments or reverse historical plan changes.

### Admin payment details

Open **Admin → Payments → View details** (also available from Recent payments). **Check with Flutterwave** fetches the gateway result and shows its transaction ID, reference, status, method, amounts and timestamps. Use those identifiers under **Transactions** in the Flutterwave dashboard for the provider's own record. The Nooky panel is a verification record, not an invoice or a tax receipt.

A matching successful check uses the normal settlement rules. A replaced checkout that was charged stays in review. **Mark checkout failed** closes a pending checkout locally, tries to disable the Flutterwave link if available, and records the administrator and reason. If the provider later confirms that charge, it is listed for review and does not activate access. **Cancel subscription** ends the customer's current paid access immediately, returns the account to Free, and closes pending checkouts. Both actions require confirmation and do not issue a refund.
