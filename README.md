# Helios — React, Express & MongoDB

A complete first version of an AI-agent storefront and workspace. The existing cream, blue, and white landing page remains at `/`, with eight independent curved lines and the app hub graphic. Customer and administrator screens use sidebars. This is plain React + Vite, with React Router; it does not use Next.js.

The published private preview runs in **demo mode**. The downloadable project includes the real Express backend. Demo data and sample AI replies live only in the browser. There are no real accounts, emails, AI calls, or charges in the preview.

## What is included

- Public landing page with editable content arrays, pricing, FAQ, and signup/sign-in links.
- Customer signup/sign-in, invitation-only admin signup, and a separate admin sign-in page.
- Password reset through SMTP, password changes, HttpOnly cookie sessions, CSRF protection, role checks, suspension, and session invalidation.
- Customer Dashboard, My Agent, and Profile pages. Billing is accessible from Dashboard.
- Customer Contact us chat modal and admin Support inbox, with saved messages, unread badges, search, filters, and resolved conversations.
- One personal agent per customer: speciality selection, name, tone, custom instructions, pause/resume, saved chat, and monthly response quotas.
- An OpenAI-compatible chat-completions adapter. Provider secrets stay on the server.
- Admin overview, paginated/searchable users, suspend/reactivate controls, admin invitations, agent speciality creation/editing, plan editing, payment history, and CSV export of the current page.
- Paystack hosted USD checkout, server-side verification, signed raw-body webhooks, and transactional, idempotent access activation.
- MongoDB models, indexes, connection setup, repeatable seed command, initial admin invitation command, environment templates, and automated tests.

This release helps with plans, drafts, writing, and ideas inside Helios. Gmail, WhatsApp, Slack, calendar connections, background automations, and external actions are **planned**, not implemented. The landing page marks the app hub accordingly. Customer stories are labelled sample content and should be replaced before launch.

## Requirements

Node.js 22 or later and npm. For the real backend, use MongoDB Atlas or a MongoDB replica set, plus your own AI and Paystack credentials. SMTP is optional until password reset emails are needed.

## 1. Explore the frontend immediately

```bash
npm ci
npm run dev:web
```

Open `http://localhost:4173`. The supplied `.env` has `VITE_DEMO_MODE=true`. Click **Sign in → Open user demo workspace**, or visit `/admin/login` and open the admin demo. The banner lets you switch views. Demo signup creates a browser-only profile; passwords are never saved. Previewing a plan changes demo access without recording a payment.

If `.env` is missing:

```bash
cp .env.example .env
```

On Windows, copy `.env.example` to `.env` in Explorer or use `Copy-Item .env.example .env` in PowerShell.

## 2. Connect the real app

Edit `.env`:

```dotenv
VITE_DEMO_MODE=false
VITE_API_URL=/api
API_PORT=4000
CLIENT_URL=http://localhost:4173
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_random_secret_at_least_32_characters
PAYSTACK_SECRET_KEY=your_paystack_test_secret_key
AI_API_KEY=your_ai_provider_key
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4.1-mini
```

Generate a session secret locally with:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Paste that output into `JWT_SECRET`. Only variables beginning with `VITE_` are exposed to the browser. **Never give server secrets a `VITE_` prefix.** Keep `.env` private; all `.env*` files except `.env.example` are ignored by Git. The download contains a blank `.env` for you to fill.

For Atlas, create a database user, allow your API server's network access, and use your Atlas connection string with the database name `helios`. Atlas supports the transactions used for registration and payments.

Alternatively, start the included local MongoDB replica set:

```bash
docker compose up -d --wait
```

Then use:

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017/helios?replicaSet=rs0
```

MongoDB is bound to the local machine, and its data is kept in a Docker volume. A standalone MongoDB instance does not support the atomic transactions this app requires.

Start both apps:

```bash
npm run dev
```

Vite runs on port 4173, Express on port 4000. Vite proxies `/api` to Express, so cookies and frontend requests share the same browser origin. Keep `API_PORT=4000` for this default proxy, or update `vite.config.js` when changing it. Stop and restart Vite after changing frontend environment values.

The API connects to MongoDB, creates required indexes, and seeds the starting catalogue automatically. You can also run `npm run seed`. Seeding uses `$setOnInsert`, preserving existing admin edits. New accounts get Free access; they start without an agent and can choose one in My Agent.

## Troubleshoot MongoDB startup

If the API cannot start, test the database independently first:

```bash
npm run db:check
```

This reads the project-root `.env`, checks connection/authentication, replica-set support, and read access without writing data or printing credentials. No JWT, AI, payment, or email key is needed for this database check. Start the app afterwards to check index creation and catalogue writes. Startup now reports the failing stage and a safe category such as `DB_AUTH`, `DB_DNS`, `DB_NETWORK`, or `DB_PERMISSIONS`.

For Atlas, allow the current computer/server IP under Network Access, use a Database Access user's credentials (not the Atlas website login), and replace every username/password placeholder in the connection string. Percent-encode special characters in credentials and quote the complete URI in `.env`. Keep the cluster running. For the included local database, run `docker compose up -d --wait` and use `mongodb://127.0.0.1:27017/helios?replicaSet=rs0`. Restart `npm run dev` after changing `.env`; Node's watch process does not reliably restart for environment-file edits.

Vite `ECONNREFUSED 127.0.0.1:4000` errors are expected while the Express API is stopped. Resolve the earlier API startup error first. Leave `API_PORT=4000` and `PORT=` for the default local proxy.

## 3. Create your first administrator

From the project directory, with `MONGODB_URI` set:

```bash
npm run admin:invite -- you@example.com
```

Or fill `INITIAL_ADMIN_EMAIL` and run `npm run admin:invite`. The command prints a private invitation link, valid for 48 hours. Open it, choose your name and password, and create the administrator account. The link works only for its invited email and can be used once.

There are no default real admin credentials or public role-elevation endpoints. Existing admins can create further invitations under **Users → Invite administrator**. Invitations are not automatically emailed; share the generated link privately. Use a different email from an existing customer account.

## 4. Configure Paystack USD payments

The integration uses hosted checkout, so card details never enter your application. No Paystack public key is needed for this flow; the server uses `PAYSTACK_SECRET_KEY`.

USD support depends on merchant country and approval. Paystack currently supports USD collection/settlement for Nigerian and Kenyan businesses. Nigerian USD settlement requires an approved Zenith Bank USD domiciliary account. Enable international payments and USD before switching to live keys. A customer holding a USD card is not sufficient to enable USD prices on a merchant account.

Official references:

- https://support.paystack.com/en/articles/2130690
- https://paystack.com/docs/payments/accept-payments/
- https://paystack.com/docs/payments/verify-payments/
- https://paystack.com/docs/payments/webhooks/

Use test keys first. In the Paystack dashboard, set your webhook to:

```text
https://your-api-or-website-domain.com/api/payments/webhook
```

That endpoint needs public HTTPS access. A localhost callback can be tested in a browser; localhost webhooks require an HTTPS tunnel or a deployed test API. The callback URL is generated from `CLIENT_URL`:

```text
https://your-frontend-domain.com/payment/callback
```

Amounts are stored in cents, always taken from the server's Plan record. Checkout snapshots the plan name, price, currency, response allowance, customer, and period. Browser values cannot change the amount. Verification checks provider status, reference, amount, currency, and customer email. Webhooks authenticate the original bytes using HMAC-SHA512 and are independently verified with Paystack. Both callback and webhook use the same settlement service.

Payment success and subscription updates commit in one MongoDB transaction. A repeated callback or webhook cannot grant access twice. Verified failed or abandoned payments are recorded as failed. Provider timeouts and other incomplete payments remain pending and can be rechecked from the return page; admins cannot manually mark records paid. Refunds and disputes are handled in the merchant dashboard; automated refund/dispute entitlement changes and a refund API are not part of this first version.

Paid access is purchased for **30 or 365 days**, with **manual renewal**. There are no automatic recurring charges. Renewing the same active plan extends its expiry; switching plans starts a new period immediately, without proration. Expired paid access falls back to Free. Usage resets on the first day of the calendar month, UTC, independent of the purchase date. Existing purchases retain their saved response allowance when an admin edits a plan.

## 5. Configure AI and email

Fill `AI_API_KEY`, `AI_BASE_URL`, and `AI_MODEL` for your chosen OpenAI-compatible provider. The default URL is OpenAI's API; the model is editable. The server sends bounded conversation context and reserves quota before each request. Failed requests return the quota. A per-agent lease prevents overlapping answers. Only authenticated owners can access their agent and messages.

The first agent templates are Everyday assistant, Content companion, and Business copilot. Their starting public content lives in `shared/catalog.js`; base instructions live in `server/services/catalog.js`. Admins can edit them in Agents & plans. Prompts are instructions, not credentials: do not put passwords or private service keys in them.

Fill these email settings for password reset:

```dotenv
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
```

Use `SMTP_SECURE=true` with port 465 when required by your provider. Reset links expire in 30 minutes and are single-use. Resets and password changes invalidate previous sessions. Email addresses are shown read-only on Profile; email changes and email verification are not implemented in this version.

## Routes — React Router, not file-based routing

All routes are declared in `src/App.jsx`. Creating a file does not create a route; import the component and add a `<Route>`.

| Route | Screen |
| --- | --- |
| `/` | Public landing page |
| `/login`, `/signup` | Customer authentication |
| `/admin/login`, `/admin/signup` | Admin authentication; signup needs an invitation |
| `/forgot-password`, `/reset-password?token=...` | Password recovery |
| `/app/dashboard` | Customer summary, usage, and billing |
| `/app/agent` | Agent selection, settings, and chat |
| `/app/profile` | Profile and password |
| `/payment/callback?reference=...` | Server-verified payment return |
| `/admin/dashboard` | Admin overview |
| `/admin/users` | Customers, team, and invitations |
| `/admin/agents` | Agent specialities and plans |
| `/admin/payments` | Payment history and CSV export |
| `/admin/profile` | Administrator profile and password |
| `/admin/support` | Support inbox, customer conversations, replies and resolution |

`Protected` checks frontend session state for navigation. Express independently authenticates every private request and enforces role, ownership, suspension, and CSRF requirements. Frontend guards are not the security boundary.

Dashboards render within `<AppLayout>` using `<Outlet>`. Sidebar entries are arrays in `src/components/AppLayout.jsx`. Public page copy, FAQ, sample customer stories, and use cases are arrays in `src/data/content.js`. The landing page reads live pricing from `/api/catalog` in real mode, with seeded defaults available as fallback copy.

## Models and API organisation

Schemas and indexes are in `server/models/index.js`:

| Model | Purpose |
| --- | --- |
| User | Identity, hashed password, role, status, timezone, session version |
| Plan | USD prices, response limits, features, publication |
| AgentTemplate | Speciality, starter prompts, private system instructions |
| AgentInstance | One customer's agent, settings, state, conversation lease |
| Subscription | Current access period and saved allowance |
| Payment | Server-priced purchase and verified settlement |
| Conversation / Message | Owner-scoped saved chat |
| SupportThread / SupportMessage | One human-support thread per customer, ordered messages, shared admin read cursor and resolution |
| Usage | Unique user/calendar-month quota bucket |
| Activity | Workspace and administrative activity |
| AdminInvite | Email-bound, hashed, expiring invitation |
| PasswordReset | Hashed, expiring recovery token |

API groups: `/api/auth`, `/api/account`, `/api/agent`, `/api/payments`, `/api/support`, and `/api/admin` (including `/api/admin/support`). `/api/catalog` is public; `/api/health` reports database readiness. Browser mutations send `X-Helios-Client: 1`; authenticated mutations additionally send the CSRF token from login or `/auth/me`. Session JWTs live in HttpOnly cookies, not localStorage. Server secrets and full provider responses are not returned to the browser.

`src/lib/api.js` chooses the real API or the explicitly labelled preview adapter according to `VITE_DEMO_MODE` (demo by default; explicitly set `false` for the real API). `src/lib/demo.js` contains the fictional demo records and sample reply; it is not used for authentication or payments in real mode.

## Human support chat

Customers can use **Contact us** in the workspace header after signing in, including on mobile. The modal shows saved conversations with the Helios team, not AI replies. Support is available on every plan and does not consume AI response quotas. No new environment variables, email service, or dependencies are required.

Administrators use **Support** in the sidebar or header to open `/admin/support`. The inbox has name/email search, All / Awaiting reply / Unread / Resolved filters, pagination, message history, replies, and Resolve / Reopen controls. The sidebar/header badge counts conversations that are unread or awaiting a reply, without counting the same conversation twice. Users receive an unread badge when an admin replies.

Open conversations and the active admin inbox poll every **5 seconds**. Header badges on other pages poll every **30 seconds**. Polling pauses in hidden tabs, resumes on focus or reconnect, backs off on errors, cancels superseded requests, and keeps displayed messages during temporary failures. The active admin inbox fetches its list, counts, and selected chat together; it does not run several competing chat polls. Support reads have their own per-IP and per-account rate budgets.

Unread markers are shared by the admin team. A visible, focused conversation at the latest messages acknowledges only the sender count it actually loaded; older acknowledgements cannot undo newer ones. Reading clears an unread badge, while Awaiting reply remains until an admin replies or resolves the thread. A new message reopens a resolved conversation. Resolving a view whose message sequence has changed returns a conflict, so a new question is not silently resolved.

`SupportThread` is unique per customer and is created on the first message. `SupportMessage` has a unique sequence and client retry identifier per thread. Counters, last-message preview, reopened state, and the message insertion commit in one MongoDB transaction. Send retries with the same identifier return the original message. The existing Atlas/replica-set requirement still applies. Startup creates the new models' indexes automatically; no manual migration is needed.

Customer endpoints are `/api/support/summary`, `/api/support/thread?before=sequence`, `/api/support/messages`, and `/api/support/read`. They derive ownership from the authenticated user and accept no customer or thread override. Admin endpoints are `/api/admin/support`, `/api/admin/support/summary`, and `/api/admin/support/:id` with `/messages` and `/read` subroutes. Read-only responses use `Cache-Control: no-store`; mutations require CSRF and origin checks. Text is limited to 4,000 characters, history loads in pages of 50, and sends are limited to 20 per minute per account.

To try the real flow, sign in as a customer in a normal browser profile and an admin in an incognito window or another browser. Send a question from Contact us, open Support as the admin, reply, then check the customer's modal. Resolve the conversation and send a follow-up to check reopening. The private preview uses fictional local messages; switch between the user and admin demo views in the same browser to explore the flow. It does not connect real customers across computers.

## Build and deploy the real application

The simplest deployment is one Node.js service serving both the API and React build, with MongoDB Atlas:

1. Set `VITE_DEMO_MODE=false` before building.
2. Set `CLIENT_URL` to the final HTTPS origin, e.g. `https://helios.example.com`.
3. Keep `VITE_API_URL=/api` and `COOKIE_SAME_SITE=lax` for same-origin hosting.
4. Set server secrets in the host's environment, not in source control.
5. Run `npm ci && npm run build` as the build step.
6. Run `npm start` as the start command. It sets production mode and serves `dist/` plus `/api`.
7. Set `API_PORT` to the port your Node host expects. A host-supplied `PORT` value takes precedence automatically.
8. Set `TRUST_PROXY` to the exact number of trusted reverse proxies in front of Express, usually 1 on managed Node hosts.
9. Set Paystack's public HTTPS webhook URL and verify the merchant's USD configuration using test payments before using live keys.

Express serves `index.html` for frontend deep links using its Express 5 named wildcard, while unknown `/api` URLs remain JSON 404s. A `_redirects` file is also included for static hosts that support it. With another static host, configure its SPA fallback so refreshing `/app/agent` works.

Separate frontend/API hosts are also possible: set `VITE_API_URL=https://api.example.com/api` before building and `CLIENT_URL` to the exact frontend origin. Use related domains when possible. Truly cross-site cookies require `COOKIE_SAME_SITE=none`, HTTPS, and browser permission for third-party cookies; same-origin deployment avoids that dependency.

The existing published preview is a static Site. It cannot run this Node/Express server with a direct MongoDB connection. Its deployed build intentionally remains a demo. Deploy the complete repository to a Node-capable host when your environment values are ready.

## Validation

```bash
npm test
npm run build
```

The tests cover password hashing and byte limits, session cookies, role escalation prevention, session invalidation, CSRF/origin checks, payment ownership, server-sourced USD prices, email-bound single-use admin invitations, separate login roles, agent ownership, raw webhook authentication, amount/currency/customer mismatches, replay-safe settlement, renewal periods, demo account/agent/chat/admin flows, CSV formula escaping, support ownership and roles, reply flows, bounded read cursors, retry idempotency, transactional rollback, resolution conflicts, and history pagination.

Tests use injected repositories for API authorization, payment service, and support transaction checks; they do not claim to run a live MongoDB transaction or live gateway charge. With your credentials, additionally verify signup, a single-use admin invitation, password reset email, real AI chat, a Paystack test checkout, duplicate webhook delivery, and MongoDB settlement against a test database. Automated checks and builds are included; browser visual QA was unavailable in the build environment.

## Project layout

```text
src/
  App.jsx                  React Router declarations and role guards
  pages/                   Landing, authentication, customer, and admin screens
  components/              Sidebar, cards, modal, billing, and shared controls
  lib/                     API client, session context, demo data, and CSV helper
  data/content.js          Editable landing content arrays
  app.css, support.css     Cream/blue/white application and support styling
  styles.css, motion.css   Preserved landing and motion styling
shared/catalog.js          Starting plans and public agent specialities
shared/support.js          Support validation, public views, and counters
server/
  app.js, index.js          Express middleware, routes, and MongoDB startup
  config.js                Server environment parsing and validation
  models/                  MongoDB schemas and indexes
  routes/                  Auth, account, agents, payments, administration, support
  services/                AI, SMTP, seeding, transactional settlement, and support
  lib/                     Authentication and payment policies
  scripts/                 Seed and first-admin invitation commands
  tests/                   Automated checks
.env                       Blank server keys and demo frontend defaults
.env.example               Safe environment template
compose.yaml               Optional local MongoDB replica set
```
