import 'dotenv/config';
import mongoose from 'mongoose';
import { models } from '../models/index.js';
import { email, randomToken, hashToken } from '../lib/security.js';
try {
  if (!process.env.MONGODB_URI) throw new Error('Fill MONGODB_URI in .env first.');
  const address = email.parse(process.argv[2] || process.env.INITIAL_ADMIN_EMAIL);
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  if (await models.User.exists({ email: address })) throw new Error('This email already has an account. Use a different email.');
  await models.AdminInvite.init();
  const token = randomToken();
  await models.AdminInvite.create({ email: address, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 48 * 3600000) });
  const origin = (process.env.CLIENT_URL || 'http://localhost:4173').replace(/\/$/, '');
  console.log(`Admin invitation (valid for 48 hours):\n${origin}/admin/signup?token=${encodeURIComponent(token)}&email=${encodeURIComponent(address)}\n\nKeep this link private. Open it to choose your admin password.`);
} catch (error) { console.error(error.name === 'Error' ? error.message : 'Admin invitation failed. Check the email and database connection.'); process.exitCode = 1; }
finally { await mongoose.disconnect(); }
