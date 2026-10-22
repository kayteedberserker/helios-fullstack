# Start the complete updated Helios project

This folder already contains the landing page, authentication, customer and admin dashboards, payments and agent code, database diagnostics, and the new human-support chat. You do not need to merge any source files from the smaller support-update ZIP.

1. Stop the old project with Ctrl+C.
2. Extract this ZIP into a new folder. Keep your old folder until the new one works.
3. Open the extracted `helios-fullstack` folder, where `package.json` is located.
4. This ZIP preserves the `.env` included in your uploaded archive. If your working local project has different or newer values, copy that working `.env` into this new folder, replacing the included one. Keep `VITE_DEMO_MODE=false` to use the real Express API and your MongoDB database.
5. Run `npm install`, then `npm run dev`.
6. Open http://localhost:4173. Your existing accounts and saved records are still in your MongoDB database; use the same `MONGODB_URI` to access them. The API creates the new support models and indexes automatically.

## Try the new support feature

Sign in as a customer and click **Contact us** in the workspace header. Sign in as an admin in a different browser profile or an incognito window, then choose **Support** in the sidebar. Open the conversation and reply. Active chats poll every 5 seconds; badges on other pages refresh every 30 seconds. Resolve a thread, then send a new customer message to check that it reopens.

Support messages are saved in MongoDB and written by your admin team. No new API keys, npm packages, SMTP settings, or payment settings are needed for this feature. The cream, blue and white theme is retained.

## Included and verified

The folder includes every source file, package.json, package-lock.json, public assets, server models, routes, services, scripts, tests, shared files, README, and environment templates. Generated builds and node_modules are omitted; npm install regenerates dependencies.

Automated checks: 44 tests passed, and both real-API and demo frontend builds passed. Live MongoDB transactions and browser visual checks were not run in this environment. README contains the full configuration and deployment instructions.

The uploaded archive contains starter/demo environment settings. Copy the working `.env` from your current local project before starting the real app.
