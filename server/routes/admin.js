import { Router } from 'express';
import { z } from 'zod';
import { currencies, isPrice, maximumPrice, minimumPrice, planPriceChanges, resolvePlanPrices } from '../../shared/pricing.js';
import { objectId, email, HttpError, publicUser, requireAdmin, randomToken, hashToken } from '../lib/security.js';
import { activity, usageBucket } from '../services/catalog.js';

const pageQuery = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1), search: z.string().max(80).default('') });
const templateSchema = z.object({
  key: z.string().regex(/^[a-z0-9-]{2,50}$/), name: z.string().trim().min(2).max(70), category: z.string().trim().min(2).max(30),
  description: z.string().trim().min(10).max(400), systemPrompt: z.string().trim().min(10).max(6000),
  icon: z.enum(['Sparkles', 'PenLine', 'BriefcaseBusiness', 'Bot', 'Brain', 'Compass']), color: z.enum(['blue', 'purple', 'gold']),
  features: z.array(z.string().trim().min(1).max(100)).max(6), prompts: z.array(z.string().trim().min(1).max(200)).max(4), published: z.boolean(),
}).strict();
const planSchema = z.object({
  name: z.string().trim().min(2).max(50), description: z.string().trim().min(5).max(200),
  responseLimit: z.number().int().min(1).max(100000),
  features: z.array(z.string().trim().min(1).max(100)).max(8), published: z.boolean(),
});
const pricesSchema = z.object(Object.fromEntries(currencies.map(code => {
  const amount = z.number().int().min(minimumPrice(code)).max(maximumPrice);
  return [code, z.object({ monthly: amount, yearly: amount }).strict().optional()];
}))).strict();
const legacyAmount = z.number().int().min(0).max(maximumPrice);
const planUpdateSchema = z.union([
  planSchema.extend({ prices: pricesSchema }).strict(),
  planSchema.extend({ monthlyPrice: legacyAmount, yearlyPrice: legacyAmount }).strict(),
]);
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function adminRoutes({ models, config, auth, adminBilling }) {
  const router = Router();
  router.use(auth, requireAdmin);
  router.get('/dashboard', async (req, res) => {
    const month = new Date(`${usageBucket()}-01T00:00:00.000Z`);
    const [users, agents, revenue, responses, recentPayments, events] = await Promise.all([
      models.User.countDocuments({ role: 'user' }), models.AgentInstance.countDocuments({ status: 'active' }),
      models.Payment.aggregate([{ $match: { status: 'success', paidAt: { $gte: month } } }, { $group: { _id: '$currency', total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
      models.Usage.aggregate([{ $match: { bucket: usageBucket() } }, { $group: { _id: null, total: { $sum: '$responses' } } }]),
      models.Payment.find({ status: 'success' }).populate('userId', 'name email').sort({ paidAt: -1 }).limit(5).lean(),
      models.Activity.find().populate('userId', 'name').sort({ createdAt: -1 }).limit(6).lean(),
    ]);
    res.json({ stats: { users, agents, revenue: revenue.find(row => row._id === 'NGN')?.total || 0, revenueByCurrency: Object.fromEntries(revenue.map(row => [row._id, row.total])), responses: responses[0]?.total || 0, payments: revenue.reduce((total, row) => total + row.count, 0) }, recentPayments, activity: events, services: { database: true, payments: !!config.flutterwaveSecret, ai: !!config.aiKey, mail: !!config.smtp.host && !!config.smtp.from } });
  });
  router.get('/users', async (req, res) => {
    const { page, search } = pageQuery.parse(req.query);
    const filter = search ? { $or: [{ name: { $regex: escapeRegex(search), $options: 'i' } }, { email: { $regex: escapeRegex(search), $options: 'i' } }] } : {};
    const [users, total] = await Promise.all([models.User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * 20).limit(20).lean(), models.User.countDocuments(filter)]);
    res.json({ users: users.map(publicUser), total, page, pages: Math.max(1, Math.ceil(total / 20)) });
  });
  router.patch('/users/:id', async (req, res) => {
    const id = objectId.parse(req.params.id);
    const { status } = z.object({ status: z.enum(['active', 'suspended']) }).strict().parse(req.body);
    const user = await models.User.findOneAndUpdate({ _id: id, role: 'user' }, { $set: { status }, $inc: { sessionVersion: 1 } }, { new: true });
    if (!user) throw new HttpError(404, 'Customer not found. Administrator accounts cannot be suspended here.');
    await activity(models, user._id, 'admin', `Account ${status === 'active' ? 'reactivated' : 'suspended'} by an administrator.`, req.user._id);
    res.json({ user: publicUser(user) });
  });
  router.post('/invites', async (req, res) => {
    const data = z.object({ email }).strict().parse(req.body);
    if (await models.User.exists({ email: data.email })) throw new HttpError(409, 'That email already has an account. Use another email for this admin invitation.');
    const token = randomToken();
    const expiresAt = new Date(Date.now() + 48 * 3600000);
    await models.AdminInvite.create({ email: data.email, tokenHash: hashToken(token), invitedBy: req.user._id, expiresAt });
    await activity(models, req.user._id, 'admin', 'An admin invitation was created.', req.user._id);
    res.status(201).json({ url: `${config.clientUrl}/admin/signup?token=${encodeURIComponent(token)}&email=${encodeURIComponent(data.email)}`, expiresAt });
  });
  router.get('/catalog', async (req, res) => {
    const [templates, plans, agents] = await Promise.all([
      models.AgentTemplate.find().select('+systemPrompt').sort({ createdAt: 1 }).lean(),
      models.Plan.find().sort({ monthlyPrice: 1 }).lean(),
      models.AgentInstance.countDocuments(),
    ]);
    res.json({ templates, plans: plans.map(plan => ({ ...plan, prices: resolvePlanPrices(plan, config.planPrices) })), agents });
  });
  router.post('/templates', async (req, res) => {
    const data = templateSchema.parse(req.body);
    const template = await models.AgentTemplate.create(data);
    await activity(models, req.user._id, 'admin', `Agent speciality “${data.name}” was created.`, req.user._id);
    res.status(201).json({ template });
  });
  router.patch('/templates/:id', async (req, res) => {
    const id = objectId.parse(req.params.id);
    const data = templateSchema.omit({ key: true }).partial().strict().parse(req.body);
    const template = await models.AgentTemplate.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }).select('+systemPrompt');
    if (!template) throw new HttpError(404, 'Agent speciality not found.');
    await activity(models, req.user._id, 'admin', `Agent speciality “${template.name}” was updated.`, req.user._id);
    res.json({ template });
  });
  router.patch('/plans/:id', async (req, res) => {
    const id = objectId.parse(req.params.id);
    const { prices: submitted, monthlyPrice, yearlyPrice, ...data } = planUpdateSchema.parse(req.body);
    const current = await models.Plan.findById(id);
    if (!current) throw new HttpError(404, 'Plan not found.');
    let prices = submitted;
    if (current.code === 'free') {
      if (!data.published || (submitted && Object.keys(submitted).length) || (submitted === undefined && (monthlyPrice !== 0 || yearlyPrice !== 0))) {
        throw new HttpError(400, 'The free plan must stay available with a zero price.');
      }
      prices = {};
    } else if (submitted === undefined) {
      if (!isPrice(monthlyPrice, 'NGN') || !isPrice(yearlyPrice, 'NGN')) throw new HttpError(400, 'Paid plans need NGN prices of at least ₦50.00 for each period.');
      prices = { ...resolvePlanPrices(current, config.planPrices), NGN: { monthly: monthlyPrice, yearly: yearlyPrice } };
    }
    if (current.code !== 'free' && data.published && !Object.keys(prices).length) throw new HttpError(400, 'Add prices in at least one currency before publishing this plan.');
    const plan = await models.Plan.findByIdAndUpdate(id, { $set: { ...data, ...planPriceChanges(prices) } }, { new: true, runValidators: true });
    if (!plan) throw new HttpError(404, 'Plan not found.');
    await activity(models, req.user._id, 'admin', `The ${plan.name} plan was updated.`, req.user._id);
    res.json({ plan });
  });
  router.get('/payments', async (req, res) => {
    const { page } = pageQuery.parse(req.query);
    const status = z.enum(['all', 'pending', 'success', 'failed', 'review']).default('all').parse(req.query.status);
    const filter = status === 'all' ? {} : status === 'review'
      ? { status: 'success', reviewReason: { $ne: null } }
      : { status, ...(status === 'pending' ? { supersededAt: null } : {}), ...(status === 'success' ? { reviewReason: null } : {}) };
    const [payments, total] = await Promise.all([models.Payment.find(filter).populate('userId', 'name email').sort({ createdAt: -1 }).skip((page - 1) * 20).limit(20).lean(), models.Payment.countDocuments(filter)]);
    res.json({ payments, total, page, pages: Math.max(1, Math.ceil(total / 20)) });
  });
  const reason = z.string().trim().min(5).max(240);
  router.get('/payments/:id', async (req, res) => res.json(await adminBilling.read(objectId.parse(req.params.id))));
  router.post('/payments/:id/verify', async (req, res) => {
    z.object({}).strict().parse(req.body ?? {});
    res.json(await adminBilling.verify(objectId.parse(req.params.id)));
  });
  router.post('/payments/:id/fail', async (req, res) => {
    const data = z.object({ reason }).strict().parse(req.body);
    res.json(await adminBilling.markFailed(objectId.parse(req.params.id), data, req.user._id));
  });
  router.post('/payments/:id/cancel-subscription', async (req, res) => {
    const data = z.object({ reason, revision: z.iso.datetime() }).strict().parse(req.body);
    res.json(await adminBilling.cancelSubscription(objectId.parse(req.params.id), data, req.user._id));
  });
  return router;
}
