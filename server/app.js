import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { models as defaultModels } from './models/index.js';
import { createPaystack, settlePayment, validWebhookSignature } from './lib/payments.js';
import { createAI } from './services/ai.js';
import { mongoSettlementStore } from './services/settlement-store.js';
import { HttpError, requireAuth, clientRequestGuard, errorHandler } from './lib/security.js';
import { authRoutes } from './routes/auth.js';
import { accountRoutes } from './routes/account.js';
import { agentRoutes } from './routes/agents.js';
import { paymentRoutes } from './routes/payments.js';
import { adminRoutes } from './routes/admin.js';
import { supportRoutes, adminSupportRoutes } from './routes/support.js';
import { mongoSupportStore } from './services/support-store.js';

export function createApp({ config, serveStatic = config.production, models = defaultModels, gateway = createPaystack(config.paystackSecret), ai = createAI(config), settlementStore = mongoSettlementStore(models), supportStore = mongoSupportStore(models) }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(helmet({ contentSecurityPolicy: { directives: { 'script-src': ["'self'"], 'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], 'font-src': ["'self'", 'https://fonts.gstatic.com'], 'img-src': ["'self'", 'data:'] } } }));
  app.use(cors({ origin: config.clientUrl, credentials: true, allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Helios-Client'] }));
  app.use(cookieParser());
  app.get('/api/health', (req, res) => res.status(mongoose.connection.readyState === 1 ? 200 : 503).json({ status: mongoose.connection.readyState === 1 ? 'ok' : 'not_ready' }));

  // Raw bytes are required for Paystack's HMAC. This route comes BEFORE JSON
  // parsing, browser CSRF checks, and the browser rate limiter.
  app.post('/api/payments/webhook', express.raw({ type: 'application/json', limit: '256kb' }), async (req, res) => {
    if (!config.paystackSecret) throw new HttpError(503, 'Payments are not configured.');
    if (!validWebhookSignature(req.body, req.get('x-paystack-signature'), config.paystackSecret)) throw new HttpError(401, 'Invalid signature.');
    let event;
    try { event = JSON.parse(req.body.toString('utf8')); } catch { throw new HttpError(400, 'Invalid webhook JSON.'); }
    if (event.event === 'charge.success' && /^helios_[a-f\d]{32}$/.test(event.data?.reference || '')) {
      const exists = await settlementStore.find(event.data.reference);
      if (exists) await settlePayment(event.data.reference, { verify: gateway.verify, store: settlementStore });
    }
    // Acknowledge only after durable processing; failures are retried by Paystack.
    res.sendStatus(200);
  });
  app.use('/api', rateLimit({ windowMs: 15 * 60000, limit: 300, skip: req => req.method === 'GET' && /^\/(?:admin\/)?support(?:\/|$)/.test(req.path), standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Too many requests. Please try again shortly.' } }));
  app.use('/api', express.json({ limit: '32kb' }), clientRequestGuard(config));
  const auth = requireAuth({ config, models });
  const chatLimit = rateLimit({ windowMs: 60000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Give your agent a moment. Try again shortly.' } });
  const dependencies = { config, models, auth, gateway, ai, settlementStore, chatLimit, supportStore };
  app.get('/api/catalog', async (req, res) => {
    const [plans, templates] = await Promise.all([models.Plan.find({ published: true }).sort({ monthlyPrice: 1 }).lean(), models.AgentTemplate.find({ published: true }).sort({ createdAt: 1 }).lean()]);
    res.json({ plans, templates });
  });
  app.use('/api/auth', rateLimit({ windowMs: 15 * 60000, limit: 35, skip: req => req.path === '/me' || req.path === '/logout', standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Too many account requests. Please try again in 15 minutes.' } }), authRoutes(dependencies));
  app.use('/api/account', accountRoutes(dependencies));
  app.use('/api/agent', agentRoutes(dependencies));
  app.use('/api/payments', paymentRoutes(dependencies));
  app.use('/api/support', supportRoutes(dependencies));
  app.use('/api/admin/support', adminSupportRoutes(dependencies));
  app.use('/api/admin', adminRoutes(dependencies));
  app.use('/api', (req, res) => res.status(404).json({ message: 'API route not found.' }));
  if (serveStatic) {
    const dist = fileURLToPath(new URL('../dist/', import.meta.url));
    app.use(express.static(dist));
    // Express 5 uses a named wildcard. This also serves direct React Router URLs.
    app.get('/{*path}', (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use(errorHandler);
  return app;
}
