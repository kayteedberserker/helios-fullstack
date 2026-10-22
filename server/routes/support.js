import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { objectId, requireAdmin, requireUser } from '../lib/security.js';
import { supportMessageInput, supportReadInput, supportStatusInput } from '../../shared/support.js';

const historyQuery = z.object({ before: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional() }).strict();
const inboxQuery = z.object({ status: z.enum(['all', 'waiting', 'unread', 'resolved']).default('all'), search: z.string().trim().max(80).default(''),
  page: z.coerce.number().int().min(1).max(100000).default(1), selected: objectId.optional() }).strict();
// Polling has its own budget so people sharing an IP can use the inbox together.
const pollingIpLimit = () => rateLimit({ windowMs: 15 * 60000, limit: 1200, skip: req => req.method !== 'GET', standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Support updates are busy. Please try again shortly.' } });
const pollingAccountLimit = () => rateLimit({ windowMs: 15 * 60000, limit: 600, keyGenerator: req => String(req.user._id), skip: req => req.method !== 'GET', standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Too many support updates. Please close extra tabs and try again shortly.' } });
const sendLimit = () => rateLimit({ windowMs: 60000, limit: 20, keyGenerator: req => String(req.user._id), standardHeaders: 'draft-8', legacyHeaders: false,
  message: { message: 'Please wait a moment before sending more support messages.' } });

export function supportRoutes({ auth, supportStore }) {
  const router = Router(); router.use(pollingIpLimit(), auth, requireUser, pollingAccountLimit());
  router.get('/summary', async (req, res) => { res.set('Cache-Control', 'no-store').json(await supportStore.summary(req.user._id)); });
  router.get('/thread', async (req, res) => { const { before } = historyQuery.parse(req.query); res.set('Cache-Control', 'no-store').json(await supportStore.customerHistory(req.user._id, before)); });
  router.post('/messages', sendLimit(), async (req, res) => { res.json(await supportStore.customerSend(req.user, supportMessageInput.parse(req.body))); });
  router.post('/read', async (req, res) => { const { through } = supportReadInput.parse(req.body); res.json(await supportStore.customerRead(req.user._id, through)); });
  return router;
}
export function adminSupportRoutes({ auth, supportStore }) {
  const router = Router(); router.use(pollingIpLimit(), auth, requireAdmin, pollingAccountLimit());
  router.get('/summary', async (req, res) => { res.set('Cache-Control', 'no-store').json({ summary: await supportStore.stats() }); });
  router.get('/', async (req, res) => { res.set('Cache-Control', 'no-store').json(await supportStore.inbox(inboxQuery.parse(req.query))); });
  router.get('/:id/messages', async (req, res) => { const { before } = historyQuery.parse(req.query); res.set('Cache-Control', 'no-store').json(await supportStore.adminHistory(objectId.parse(req.params.id), before)); });
  router.post('/:id/messages', sendLimit(), async (req, res) => { res.json(await supportStore.adminSend(objectId.parse(req.params.id), req.user, supportMessageInput.parse(req.body))); });
  router.post('/:id/read', async (req, res) => { const { through } = supportReadInput.parse(req.body); res.json(await supportStore.adminRead(objectId.parse(req.params.id), through)); });
  router.patch('/:id', async (req, res) => { res.json(await supportStore.setStatus(objectId.parse(req.params.id), supportStatusInput.parse(req.body))); });
  return router;
}
