import { Router } from 'express';
import { z } from 'zod';
import { password, HttpError, comparePassword, hashPassword, issueSession, publicUser, requireUser } from '../lib/security.js';
import { entitlement, activity, usageBucket } from '../services/catalog.js';

export function accountRoutes({ models, config, auth }) {
  const router = Router();
  router.use(auth);
  router.patch('/profile', async (req, res) => {
    const data = z.object({ name: z.string().trim().min(2).max(80), timezone: z.string().max(100).refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }, 'Choose a valid time zone.') }).strict().parse(req.body);
    const user = await models.User.findByIdAndUpdate(req.user._id, { $set: data }, { new: true, runValidators: true });
    await activity(models, req.user._id, 'profile', 'Your profile was updated.');
    res.json({ user: publicUser(user) });
  });
  router.patch('/password', async (req, res) => {
    const data = z.object({ currentPassword: z.string().min(1).max(200), password }).strict().parse(req.body);
    const user = await models.User.findById(req.user._id).select('+passwordHash');
    if (!await comparePassword(data.currentPassword, user.passwordHash)) throw new HttpError(400, 'Your current password is incorrect.');
    user.passwordHash = await hashPassword(data.password); user.sessionVersion += 1;
    await user.save();
    // Invalidate other sessions and reissue the current one.
    res.json({ ...issueSession(res, user, config), message: 'Password updated. Other sessions have been signed out.' });
  });
  router.get('/dashboard', requireUser, async (req, res) => {
    const userId = req.user._id;
    const [access, usage, agent, events, payments] = await Promise.all([
      entitlement(userId, models), models.Usage.findOne({ userId, bucket: usageBucket() }).lean(),
      models.AgentInstance.findOne({ userId }).populate('templateId').lean(),
      models.Activity.find({ userId }).sort({ createdAt: -1 }).limit(6).lean(),
      models.Payment.find({ userId }).sort({ createdAt: -1 }).limit(20).lean(),
    ]);
    res.json({ ...access, usage: { responses: usage?.responses || 0, limit: access.plan.responseLimit, bucket: usageBucket() }, agent, activity: events, payments, capabilities: { ai: !!config.aiKey, payments: !!config.paystackSecret } });
  });
  return router;
}
