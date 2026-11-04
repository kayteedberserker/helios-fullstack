import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Router } from 'express';
import { z } from 'zod';
import { randomToken, equalSecret, issueSession } from '../lib/security.js';
import { googleReady, googleCallback, googleProvider, googleAccount } from '../services/google.js';

const cookie = 'nooky_google_flow';
const flowOptions = config => ({ httpOnly: true, secure: config.production, sameSite: 'lax', path: '/api/auth/google', maxAge: 10 * 60000 });
const jwtOptions = { algorithms: ['HS256'], issuer: 'nooky-google', audience: 'nooky-oauth' };
export function googleRoutes({ config, models, auth, provider = googleProvider(config), resolveAccount = googleAccount }) {
  const router = Router();
  router.get('/providers', (req, res) => res.set('Cache-Control', 'no-store').json({ google: googleReady(config) }));
  router.get('/google/start', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    let role = z.enum(['user', 'admin']).default('user').parse(req.query.role);
    const loginPath = () => role === 'admin' ? '/admin/login' : '/login';
    if (!googleReady(config)) return res.redirect(`${config.clientUrl}${loginPath()}?google_error=not_configured`);
    const linking = req.query.mode === 'link';
    if (linking) {
      await auth(req, res, () => {});
      if (!['user', 'admin'].includes(req.user.role)) return res.redirect(`${config.clientUrl}${loginPath()}?google_error=account_unavailable`);
      role = req.user.role;
    }
    const state = randomToken(), nonce = randomToken(), verifier = crypto.randomBytes(48).toString('base64url');
    const flow = { state, nonce, verifier, role, ...(linking ? { userId: String(req.user._id), version: req.user.sessionVersion } : {}) };
    res.cookie(cookie, jwt.sign(flow, config.jwtSecret, { algorithm: 'HS256', issuer: 'nooky-google', audience: 'nooky-oauth', expiresIn: '10m' }), flowOptions(config));
    const query = new URLSearchParams({ client_id: config.googleClientId, redirect_uri: googleCallback(config), response_type: 'code', scope: 'openid email profile', state, nonce, code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', prompt: 'select_account' });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${query}`);
  });
  router.get('/google/callback', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const token = req.cookies[cookie]; res.clearCookie(cookie, flowOptions(config));
    let flow;
    try {
      if (!googleReady(config)) throw new Error('Not configured');
      flow = jwt.verify(token, config.jwtSecret, jwtOptions);
      const state = z.string().max(100).parse(req.query.state);
      if (!equalSecret(state, flow.state)) throw new Error('Invalid state');
    } catch { return res.redirect(`${config.clientUrl}/login?google_error=expired`); }
    const role = z.enum(['user', 'admin']).parse(flow.role || 'user');
    const home = role === 'admin' ? '/admin' : '/app';
    const destination = flow.userId ? `${home}/profile` : role === 'admin' ? '/admin/login' : '/login';
    if (req.query.error) return res.redirect(`${config.clientUrl}${destination}?google_error=cancelled`);
    try {
      const code = z.string().min(1).max(4096).parse(req.query.code);
      if (flow.userId) {
        await auth(req, res, () => {});
        if (String(req.user._id) !== flow.userId || req.user.sessionVersion !== flow.version || req.user.role !== role) throw new Error('Session changed');
      }
      const profile = await provider.exchange(code, flow.verifier, flow.nonce);
      const user = await resolveAccount(models, profile, flow.userId ? req.user : null, undefined, role);
      if (user.role !== role || user.status !== 'active') { const error = new Error('Account unavailable'); error.status = 403; throw error; }
      issueSession(res, user, config);
      return res.redirect(`${config.clientUrl}${flow.userId ? `${home}/profile?google=linked` : `${home}/dashboard`}`);
    } catch (error) {
      // Only a fixed category is logged: OAuth errors may contain tokens or URLs.
      console.warn('[AUTH] Google sign-in failed', error.status === 409 ? 'account_conflict' : 'verification_failed');
      const reason = error.code === 'GOOGLE_ADMIN_UNLINKED' ? 'admin_unlinked' : error.status === 409 ? 'account_exists' : error.status === 403 ? 'account_unavailable' : 'failed';
      return res.redirect(`${config.clientUrl}${destination}?google_error=${reason}`);
    }
  });
  return router;
}
