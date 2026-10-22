import nodemailer from 'nodemailer';
import { HttpError } from '../lib/security.js';

export async function sendResetEmail(config, email, token) {
  if (!config.smtp.host || !config.smtp.from) throw new HttpError(503, 'Password reset email is not configured. Contact the Helios team.');
  const transport = nodemailer.createTransport({ host: config.smtp.host, port: config.smtp.port, secure: config.smtp.secure, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000, auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined });
  const link = `${config.clientUrl}/reset-password?token=${encodeURIComponent(token)}`;
  await transport.sendMail({ from: config.smtp.from, to: email, subject: 'Reset your Helios password', text: `You requested a password reset for Helios.\n\n${link}\n\nThis link expires in 30 minutes. If you did not request it, you can ignore this email.` });
}
