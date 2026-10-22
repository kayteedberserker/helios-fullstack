import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { signupSchema, email, password, tokenSchema, HttpError, hashPassword, comparePassword, issueSession, cookieOptions, randomToken, hashToken } from '../lib/security.js';
import { sendResetEmail } from '../services/mail.js';

export function authRoutes({ models, config, auth }) {
  const router = Router();
  router.post('/signup', async (req, res) => {
    const data = signupSchema.parse(req.body);
    const passwordHash = await hashPassword(data.password);
    const user = await mongoose.connection.transaction(async session => {
      const [user] = await models.User.create([{ name: data.name, email: data.email, passwordHash, role: 'user' }], { session });
      const plan = await models.Plan.findOne({ code: 'free' }).session(session);
      if (!plan) throw new HttpError(503, 'Plans are not ready yet. Please run the seed command.');
      await models.Subscription.create([{ userId: user._id, planId: plan._id, planCode: plan.code, planName: plan.name, responseLimit: plan.responseLimit, period: 'monthly' }], { session });
      await models.Activity.create([{ userId: user._id, kind: 'account', text: 'Your Helios workspace is ready.' }], { session });
      return user;
    });
    res.status(201).json(issueSession(res, user, config));
  });
  router.post('/admin/signup', async (req, res) => {
    const data = z.object({ ...signupSchema.shape, token: tokenSchema }).strict().parse(req.body);
    const passwordHash = await hashPassword(data.password);
    const user = await mongoose.connection.transaction(async session => {
      const invite = await models.AdminInvite.findOneAndUpdate({ tokenHash: hashToken(data.token), email: data.email, usedAt: { $exists: false }, expiresAt: { $gt: new Date() } }, { $set: { usedAt: new Date() } }, { new: true, session });
      if (!invite) throw new HttpError(403, 'This admin invitation is invalid, expired, or has already been used.');
      const [user] = await models.User.create([{ name: data.name, email: data.email, passwordHash, role: 'admin' }], { session });
      await models.Activity.create([{ userId: user._id, actorId: invite.invitedBy, kind: 'admin', text: 'An administrator joined Helios.' }], { session });
      return user;
    });
    res.status(201).json(issueSession(res, user, config));
  });
  const login = role => async (req, res) => {
    const data = z.object({ email, password: z.string().min(1).max(200) }).strict().parse(req.body);
    const user = await models.User.findOne({ email: data.email }).select('+passwordHash');
    // Run a password comparison even when the account does not exist.
    const dummy = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6Ttxqb.yN.gh.jwEq/S6bwbqRk3fu';
    const valid = await comparePassword(data.password, user?.passwordHash || dummy);
    if (!user || !valid || user.role !== role) throw new HttpError(401, 'The email or password is incorrect.');
    if (user.status !== 'active') throw new HttpError(403, 'Your account is suspended. Contact the Helios team.');
    res.json(issueSession(res, user, config));
  };
  router.post('/login', login('user'));
  router.post('/admin/login', login('admin'));
  router.get('/me', auth, (req, res) => res.json({ user: { _id: String(req.user._id), name: req.user.name, email: req.user.email, role: req.user.role, status: req.user.status, timezone: req.user.timezone, createdAt: req.user.createdAt }, csrf: req.csrf }));
  router.post('/logout', auth, (req, res) => { res.clearCookie(config.cookieName, cookieOptions(config)); res.json({ message: 'Signed out.' }); });
  router.post('/forgot-password', async (req, res) => {
    const data = z.object({ email }).strict().parse(req.body);
    if (!config.smtp.host || !config.smtp.from) throw new HttpError(503, 'Password reset email is not configured. Contact the Helios team.');
    const user = await models.User.findOne({ email: data.email, status: 'active' });
    if (user) {
      const token = randomToken();
      await models.PasswordReset.findOneAndUpdate({ userId: user._id }, { tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 30 * 60000) }, { upsert: true });
      try { await sendResetEmail(config, data.email, token); }
      catch { console.error('Password reset email delivery failed.'); }
    }
    res.json({ message: 'If an active account uses that email, a reset link will be sent shortly.' });
  });
  router.post('/reset-password', async (req, res) => {
    const data = z.object({ token: tokenSchema, password }).strict().parse(req.body);
    const passwordHash = await hashPassword(data.password);
    await mongoose.connection.transaction(async session => {
      const reset = await models.PasswordReset.findOneAndDelete({ tokenHash: hashToken(data.token), expiresAt: { $gt: new Date() } }, { session });
      if (!reset) throw new HttpError(400, 'This reset link is invalid or has expired.');
      const user = await models.User.findOneAndUpdate({ _id: reset.userId, status: 'active' }, { $set: { passwordHash }, $inc: { sessionVersion: 1 } }, { session });
      if (!user) throw new HttpError(400, 'This reset link is no longer available.');
    });
    res.clearCookie(config.cookieName, cookieOptions(config));
    res.json({ message: 'Password updated. You can sign in now.' });
  });
  return router;
}
