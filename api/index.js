import { initializeApi } from '../server/services/vercel-runtime.js';
import { createServerlessHandler } from '../server/lib/serverless-handler.js';

// Vite serves the frontend; Vercel invokes this handler for /api/**.
// NODEJS_HELPERS=0 must be set on Vercel to preserve raw Paystack bytes.
export default createServerlessHandler(initializeApi);
