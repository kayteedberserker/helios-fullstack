import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ID.');
export const email = z.email().max(254).transform(value => value.toLowerCase());
export const password = z.string().min(10, 'Use at least 10 characters.').refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Use at most 72 bytes for your password.');
export const tokenSchema = z.string().regex(/^[a-zA-Z0-9_-]{40,100}$/, 'Invalid or expired link.');
export const signupSchema = z.object({ name: z.string().trim().min(2).max(80), email, password }).strict();
export const hashPassword = value => bcrypt.hash(value, 12);
export const comparePassword = (value, hash) => bcrypt.compare(value, hash);
export const randomToken = () => crypto.randomBytes(32).toString('base64url');
export const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');
export const equalSecret = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function publicUser(user) {
  return { _id: String(user._id), name: user.name, email: user.email, role: user.role, status: user.status, timezone: user.timezone || 'UTC', createdAt: user.createdAt };
}
export const cookieOptions = config => ({ httpOnly: true, secure: config.production, sameSite: config.sameSite, path: '/api' });
export function issueSession(res, user, config) {
  const csrf = randomToken();
  const token = jwt.sign({ ver: user.sessionVersion, csrf }, config.jwtSecret, { subject: String(user._id), algorithm: 'HS256', expiresIn: '7d', issuer: 'helios-api', audience: 'helios-web' });
  res.cookie(config.cookieName, token, { ...cookieOptions(config), maxAge: 7 * 86400000 });
  return { user: publicUser(user), csrf };
}
export function requireAuth({ config, models }) {
  return async (req, res, next) => {
    const token = req.cookies[config.cookieName];
    if (!token) throw new HttpError(401, 'Please sign in to continue.');
    let payload;
    try { payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], issuer: 'helios-api', audience: 'helios-web' }); }
    catch { throw new HttpError(401, 'Your session has expired. Please sign in again.'); }
    if (!objectId.safeParse(payload.sub).success) throw new HttpError(401, 'Invalid session.');
    const user = await models.User.findById(payload.sub);
    if (!user || user.sessionVersion !== payload.ver) throw new HttpError(401, 'Please sign in again.');
    if (user.status !== 'active') throw new HttpError(403, 'Your account is suspended. Contact the Helios team.');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !equalSecret(req.get('x-csrf-token'), payload.csrf)) throw new HttpError(403, 'Please refresh the page and try again.');
    req.user = user; req.csrf = payload.csrf; next();
  };
}
export function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') throw new HttpError(403, 'Administrator access is required.');
  next();
}
export function requireUser(req, res, next) {
  if (req.user.role !== 'user') throw new HttpError(403, 'Use a customer account for the agent workspace.');
  next();
}
export function clientRequestGuard(config) {
  return (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.get('x-helios-client') !== '1' || (req.get('origin') && req.get('origin') !== config.clientUrl)) throw new HttpError(403, 'Request origin is not allowed.');
    next();
  };
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error instanceof z.ZodError) return res.status(400).json({ message: error.issues.map(issue => `${issue.path.join('.') || 'Form'}: ${issue.message}`).join(' ') });
  if (error.code === 11000) return res.status(409).json({ message: 'That email or record already exists.' });
  if (error.name === 'CastError') return res.status(400).json({ message: 'Invalid record ID.' });
  if (error.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON.' });
  if (error.type === 'entity.too.large') return res.status(413).json({ message: 'This request is too large.' });
  const status = error.status || 500;
  if (status >= 500) console.error('API request failed:', req.method, req.path, error.name, error.code || 'internal_error');
  res.status(status).json({ message: status >= 500 && !(error instanceof HttpError) ? 'Something went wrong. Please try again shortly.' : error.message });
}
