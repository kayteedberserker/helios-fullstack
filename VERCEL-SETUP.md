# Deploy the complete Helios app on Vercel

This version keeps the Vite preset. `api/index.js` runs Express as a Vercel Node function. `vercel.json` sends /api requests to that function, serves built assets, and then serves index.html for React Router URLs. It does not run a persistent localhost:4000 server on Vercel.

## 1. Deploy this complete folder

Replace the old project source with this complete folder, keeping your working local .env. Push the updated files to the repository connected to Vercel. In particular, commit `api/index.js`, `vercel.json`, and the updated server and src files. A redeploy of the old source will not add the API function.

The Vercel Root Directory must be the folder containing package.json, vercel.json, api/, server/, and src/. Keep Framework Preset = Vite, Build Command = npm run build, Output Directory = dist, and Node.js 22 or later. Remove any earlier catch-all rewrite that overrides this supplied configuration.

## 2. Set Vercel project environment variables

Add these under Settings → Environment Variables for Production. Use your real values, not the text in angle brackets:

```dotenv
VITE_DEMO_MODE=false
VITE_API_URL=/api
NODE_ENV=production
CLIENT_URL=https://<your-production-domain>
MONGODB_URI=<your-working-MongoDB-connection-string>
JWT_SECRET=<your-existing-random-secret-of-at-least-32-characters>
COOKIE_SAME_SITE=lax
TRUST_PROXY=1
NODEJS_HELPERS=0
```

CLIENT_URL must be the exact HTTPS origin you open in the browser, without a path. If you use a custom domain, use that domain consistently for sign-in. Keep CLIENT_URL=http://localhost:4173 and TRUST_PROXY=0 only in your local .env, not in Vercel's Production variables. This setup uses one trusted reverse-proxy hop for Vercel; if you add another proxy, verify the chain before changing that count.

NODEJS_HELPERS=0 disables Vercel's automatic request parsing, allowing Express to parse JSON and verify the original Paystack webhook bytes. Express provides its own request/response helpers. Do not remove this setting when enabling payments.

API_PORT and PORT are not needed for the Vercel function. AI, Paystack, and SMTP keys remain optional until their related features are used. Never give server secrets a VITE_ prefix. Configure a separate Preview CLIENT_URL if you test a preview domain; this app deliberately permits only its configured browser origin for authenticated writes.

MongoDB Atlas must allow connections from your hosted function, not just your laptop. Keep the database user and replica-set configuration you already use. No database reset is needed.

## 3. Redeploy and check the API

Deploy the updated source after saving the variables. Open:

```text
https://<your-production-domain>/api/health
```

Expected HTTP 200 JSON: `{"status":"ok"}`. Then open /api/catalog and try signup/sign-in and support messaging.

- HTML or a frontend page at /api/health: the new API routing/function is missing or the wrong project root was deployed.
- A platform 404: check the deployment's Functions list for api/index.js and confirm the new source was deployed.
- JSON HTTP 503 with API_CONFIG: check CLIENT_URL, JWT_SECRET, and the server variables.
- JSON HTTP 503 with DB_*: follow the safe database diagnosis returned by the API; inspect Atlas access and credentials.
- HTTP 401 on /api/auth/me while signed out is expected.

## 4. Find logs

In Vercel's Logs view, select the correct project, Production environment, deployment, and recent time range. Clear restrictive filters and open /api/health again. Requests produce `[API] request`, `[API] response`, and first-invocation initialization logs. Startup failures produce `[API] startup failed` with a safe error category. Request bodies, cookies, secrets and query strings are excluded from these logs. Errors in the browser UI itself appear in the browser console.

## Verification and limits

49 automated tests and the real-API production build passed locally. Tests cover startup sharing and recovery, safe logs, raw webhook signatures, JSON errors, and API route priority as well as the existing application features. No authenticated Vercel deployment, browser QA or live Atlas transaction was run here; use /api/health and your deployment logs to validate the hosted environment.

Express rate limits currently use per-process memory. Vercel instances do not share those counters; use a shared rate-limit store before relying on them as a global production traffic limit. In the default deployment, support uses polling rather than persistent sockets.
