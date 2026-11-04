import { OAuth2Client } from 'google-auth-library';
import { HttpError, hashPassword, randomToken } from '../lib/security.js';
import mongoose from 'mongoose';

export const googleReady = config => Boolean(config.googleClientId && config.googleClientSecret);
export const googleCallback = config => `${config.clientUrl}/api/auth/google/callback`;
export function googleProvider(config, client = new OAuth2Client(config.googleClientId, config.googleClientSecret, googleCallback(config))) {
  return {
    async exchange(code, verifier, nonce) {
      const { tokens } = await client.getToken({ code, codeVerifier: verifier, redirect_uri: googleCallback(config) });
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: config.googleClientId });
      const profile = ticket.getPayload();
      if (!profile || profile.nonce !== nonce || !profile.email_verified || !profile.sub || !profile.email) throw new HttpError(401, 'Google did not verify this sign-in.');
      return { sub: profile.sub, email: profile.email.toLowerCase(), name: (profile.name || profile.email.split('@')[0]).slice(0, 80) };
    },
  };
}

export async function googleAccount(models, profile, linkingUser, transaction = work => mongoose.connection.transaction(work)) {
  if (linkingUser) {
    if (linkingUser.role !== 'user' || linkingUser.status !== 'active' || profile.email !== linkingUser.email) throw new HttpError(403, 'Choose the Google account matching your customer email.');
    const user = await models.User.findOneAndUpdate({ _id: linkingUser._id, status: 'active', role: 'user', $or: [{ googleId: { $exists: false } }, { googleId: profile.sub }] }, { $set: { googleId: profile.sub } }, { new: true });
    if (!user) throw new HttpError(409, 'This account already has a different Google sign-in.');
    return user;
  }
  let user = await models.User.findOne({ googleId: profile.sub });
  if (user) {
    if (user.role !== 'user' || user.status !== 'active') throw new HttpError(403, 'This account is unavailable.');
    return user;
  }
  // Do not silently link a password account just because the emails match.
  if (await models.User.exists({ email: profile.email })) throw new HttpError(409, 'Sign in with your password, then connect Google from Profile.');
  const passwordHash = await hashPassword(randomToken());
  try {
    return await transaction(async session => {
      const plan = await models.Plan.findOne({ code: 'free' }).session(session);
      if (!plan) throw new HttpError(503, 'Plans are not ready.');
      const [created] = await models.User.create([{ name: profile.name, email: profile.email, googleId: profile.sub, passwordHash, role: 'user' }], { session });
      await models.Subscription.create([{ userId: created._id, planId: plan._id, planCode: plan.code, planName: plan.name, responseLimit: plan.responseLimit, period: 'monthly' }], { session });
      await models.Activity.create([{ userId: created._id, kind: 'account', text: 'Your Nooky workspace is ready.' }], { session });
      return created;
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    user = await models.User.findOne({ googleId: profile.sub, role: 'user', status: 'active' });
    if (user) return user;
    throw new HttpError(409, 'Sign in with your password, then connect Google from Profile.');
  }
}
