# Nooky update: identity, Google sign-in and Paystack

This is the complete updated project. Extract it into a new folder, copy your working .env from the previous project, add the two Google values below, then run npm install and npm run dev. For Vercel, push the complete source and redeploy after updating the project environment variables. The Vite preset, API routing and corrected string glob configuration are included.

## Identity and existing records

The site, pages, emails, AI-facing copy, customer support and exports use Nooky. Continue using your existing MONGODB_URI and JWT_SECRET. Do not rename or reset the database: users, agents, subscriptions and support history remain in the existing collections. Internal session cookie names, JWT issuers, historical payment references and browser demo storage retain their older technical identifiers for compatibility. Those identifiers do not appear as the site's public brand.

## Sign in with Google

1. In Google Cloud / Google Auth Platform, create or select a project. Configure Branding with the Nooky app name, your support email and the required app/domain information. Configure the audience; when using Testing, add the Google accounts that will test sign-in.
2. Create an OAuth client of type **Web application**. Add these exact **Authorized redirect URIs**, replacing the production example with the actual origin used in CLIENT_URL:

```text
http://localhost:4173/api/auth/google/callback
https://YOUR-PRODUCTION-DOMAIN/api/auth/google/callback
```

3. Copy the OAuth client ID and client secret into your local .env and Vercel's server environment variables:

```dotenv
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

Keep the actual client secret private. Neither value needs a VITE_ prefix. For this same-origin deployment, the callback is derived from CLIENT_URL; there is no separate redirect variable. Use CLIENT_URL=http://localhost:4173 locally and your actual HTTPS origin in Vercel. Keep COOKIE_SAME_SITE=lax. Restart local development and redeploy Vercel after changes.

4. With VITE_DEMO_MODE=false, customers see **Continue with Google** on signup and sign-in once both keys are configured. They choose a Google account, Google verifies them, and Nooky creates or opens their customer workspace. New Google accounts receive Free access; they do not receive admin privileges. The demo deliberately does not pretend to authenticate with Google.
5. Existing email/password users first sign in normally, then open **Profile → Google sign-in → Connect Google sign-in**. Choose the Google account with the same email. Future logins can use Continue with Google. Administrators must first create their account with an invitation and password. After signing in, open Admin Profile → Google sign-in → Connect Google sign-in and choose the matching Google email. They can then use Continue with Google on /admin/login. Google cannot create an administrator account or elevate a customer account.

Nooky checks signed browser state, nonce, PKCE and Google's verified ID token, audience and email before issuing its existing HttpOnly session. Linking requires the same active customer session at both ends of the flow. Google-created accounts use Google to sign in; to add a known password, use the password-reset email flow after SMTP is configured. No Google access or refresh token is stored, and this login feature does not grant Gmail or Drive access.

## Payments

New checkout uses Flutterwave. Keep the Paystack secret only if you still need to settle checkouts started before the switch. No exchange-rate API is required.

On startup, legacy USD plan prices are archived under legacyPricing and the paid plans are unpublished with pricingNeedsReview=true. Free stays available. This prevents old dollar amounts from being treated as naira or charging an invented exchange rate. Existing payments and purchased subscriptions keep their original records and access.

After redeploying, sign in as admin → Agents & plans → Edit plan. Enter 30-day and 365-day prices for one or more currencies (USD, NGN, GBP, EUR), turn on Available for new purchases, and save. Do this for Pro and Max. Keep both fields blank in currencies you do not want to offer. Use your actual business prices, with a minimum of ₦50 per paid period in NGN. See [Flutterwave setup](FLUTTERWAVE-SETUP.md).

For the legacy Paystack integration only, run `npm run payments:check` locally with your Paystack test key. It initializes a ₦50 test checkout without taking payment or modifying the application database, and refuses live keys.

Keep NODEJS_HELPERS=0 in Vercel for original Paystack webhook bytes. Webhook URL remains https://YOUR-PRODUCTION-DOMAIN/api/payments/webhook. Account/Google settings remain the same. Payment history and dashboard revenue use the saved currency for each transaction.

Official setup references:
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/identity/openid-connect/openid-connect
- https://support.paystack.com/en/articles/2129794
- https://support.paystack.com/en/articles/2130690

## Verification

Automated API, authentication, payment, support, OAuth state/linking and deployment checks are included. The test suite uses injected Google/Paystack responses and database repositories. No real Google account, live merchant key, Atlas transaction, browser session or Vercel deployment was used for these checks. Complete a real Google login/link and Paystack test checkout after adding your credentials.


## Admin Google sign-in update

1. Create the administrator account through the existing invitation link and choose a password.
2. Sign in with that password at /admin/login.
3. Open Profile → Google sign-in → Connect Google sign-in.
4. Choose the Google account matching the admin account email.
5. Sign out. On /admin/login, Continue with Google now opens that linked administrator account.

The admin signup page has no Google signup button. An unknown/unlinked Google account on the admin login path is rejected and creates no account. The signed OAuth state binds the selected login portal; linking additionally binds the current user ID, role and session version. Customer Google signup stays available only through the customer flow. Active status and existing stored role are rechecked before session issuance.

Use the same GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and registered /api/auth/google/callback as before. No new environment variables, database migration or Google redirect URI is needed. Deploy the complete updated source. The code passed 69 automated tests and the real-API production build. Live Google consent/login still needs testing with your credentials.


## Public Privacy Policy and Terms of Service

Public pages are /privacy and /terms (with aliases /privacy-policy and /terms-of-service). The homepage, authentication screens and dashboard footers link to them. They are not protected routes. npm run build generates standalone dist/privacy.html and dist/terms.html in addition to the React pages, and Vercel routes serve these before the SPA fallback. Verification crawlers can read their content without JavaScript, Google login or a running API.

Before public production use, review the drafts in shared/legal.js against your actual business, AI and hosting providers, retention/deletion practices, refund handling and applicable law. These are implementation-aligned drafts, not a guarantee of legal compliance or Google approval. In particular, confirm the operator identity, public privacy contact, international processing and how requests will be fulfilled. The app has no automatic account-deletion workflow; requests are handled through support and must be acted on operationally.

Fill these public build variables in your local .env and Vercel (use the actual operator name and support/privacy email that people can reach):

```dotenv
VITE_SUPPORT_EMAIL=
VITE_LEGAL_ENTITY=Nooky
```

The supplied operator name is the app brand, not an assertion of a particular registered legal entity. Replace it with your correct legal operator name. Both values are intentionally public. Redeploy after changing them so the React and static policy pages both show the updated details. When testing locally, restart Vite after environment changes.

In Google Auth Platform → Branding, set:
- Application home page: https://YOUR-DOMAIN/
- Privacy policy: https://YOUR-DOMAIN/privacy
- Terms of service: https://YOUR-DOMAIN/terms

Use the same real domain as CLIENT_URL and the OAuth callback. Complete Google's authorized-domain/ownership verification and the applicable branding/audience production steps shown in your console. Adding pages alone does not guarantee approval. If the deployment is access-protected, allow public access to the homepage and legal pages before submitting them; otherwise Google cannot inspect them.

Check the URLs in an incognito window while signed out. For the production build, also check them with JavaScript disabled. Review the contact and operator details in the resulting pages. Google sign-in still requests only openid email profile; adding policies does not require additional Google API scopes.

References:
- https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance
- https://support.google.com/cloud/answer/15549049

73 automated tests and the real-API production build passed. Browser and live Google/Vercel verification were not performed here.
