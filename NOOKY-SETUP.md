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
5. Existing email/password users first sign in normally, then open **Profile → Google sign-in → Connect Google sign-in**. Choose the Google account with the same email. Future logins can use Continue with Google. Administrators continue using the invitation/password flow.

Nooky checks signed browser state, nonce, PKCE and Google's verified ID token, audience and email before issuing its existing HttpOnly session. Linking requires the same active customer session at both ends of the flow. Google-created accounts use Google to sign in; to add a known password, use the password-reset email flow after SMTP is configured. No Google access or refresh token is stored, and this login feature does not grant Gmail or Drive access.

## Paystack — NGN only

New checkout uses NGN (naira), with integer kobo amounts. Use your sk_test_ secret key locally and in Vercel. No currency environment variable or exchange-rate API is required.

On startup, legacy USD plan prices are archived under legacyPricing and the paid plans are unpublished with pricingNeedsReview=true. Free stays available. This prevents old dollar amounts from being treated as naira or charging an invented exchange rate. Existing payments and purchased subscriptions keep their original records and access.

After redeploying, sign in as admin → Agents & plans → Edit plan. Enter your **monthly and yearly prices in naira**, turn on Available for new purchases, and save. Do this for Pro and Max. The server stores 100 kobo per naira and requires at least ₦50 for each paid period. This is not a new price recommendation; choose your actual business prices. Subsequent restarts preserve those confirmed NGN prices.

Run `npm run payments:check` locally with your test key. It initializes a ₦50 test checkout without taking payment or modifying the application database, and refuses live keys.

Keep NODEJS_HELPERS=0 in Vercel for original Paystack webhook bytes. Webhook URL remains https://YOUR-PRODUCTION-DOMAIN/api/payments/webhook. Account/Google settings remain the same. Historical USD records display their saved currency, and the dashboard revenue total includes only NGN so currencies are not added together.

Official setup references:
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/identity/openid-connect/openid-connect
- https://support.paystack.com/en/articles/2129794
- https://support.paystack.com/en/articles/2130690

## Verification

Automated API, authentication, payment, support, OAuth state/linking and deployment checks are included. The test suite uses injected Google/Paystack responses and database repositories. No real Google account, live merchant key, Atlas transaction, browser session or Vercel deployment was used for these checks. Complete a real Google login/link and Paystack test checkout after adding your credentials.
