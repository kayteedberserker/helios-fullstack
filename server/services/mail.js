import { readFile } from 'node:fs/promises';
import nodemailer from 'nodemailer';
import { HttpError } from '../lib/security.js';
import { LOGO_CID, renderResetEmail } from './mail-template.js';

export { RESET_LINK_MINUTES } from './mail-template.js';

export async function buildResetMail(config, email, token) {
  const link = new URL('/reset-password', config.clientUrl);
  link.searchParams.set('token', token);
  const privacyUrl = new URL('/privacy', config.clientUrl).href;
  return {
    from: config.smtp.from, to: email, ...renderResetEmail({ link: link.href, privacyUrl }),
    attachments: [{
      filename: 'nooky-mark.png', content: await readFile(new URL('../assets/nooky-email-mark.png', import.meta.url)),
      cid: LOGO_CID, contentType: 'image/png', contentDisposition: 'inline',
    }],
  };
}

export async function sendResetEmail(config, email, token) {
  if (!config.smtp.host || !config.smtp.from) throw new HttpError(503, 'Password reset email is not configured. Contact the Nooky team.');
  const transport = nodemailer.createTransport({ host: config.smtp.host, port: config.smtp.port, secure: config.smtp.secure, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000, auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined });
  await transport.sendMail(await buildResetMail(config, email, token));
}
