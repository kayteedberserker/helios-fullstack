import test from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import { buildResetMail, RESET_LINK_MINUTES } from '../services/mail.js';
import { LOGO_CID, renderResetEmail } from '../services/mail-template.js';

test('password-reset messages include branded HTML, plain text, and an embedded logo', async () => {
  const config = { clientUrl: 'https://nooky.io', smtp: { from: 'Nooky <hello@nooky.io>' } };
  const token = 'one-use&quote"';
  const mail = await buildResetMail(config, 'user@example.com', token);
  const href = mail.html.match(/href="([^"]+reset-password[^"]+)"/)?.[1];
  assert.equal(new URL(href).searchParams.get('token'), token);
  assert.equal(new URL(href).origin, config.clientUrl);
  assert.match(mail.text, new RegExp(RESET_LINK_MINUTES + ' minutes'));
  assert.ok(mail.text.includes(href));
  assert.ok(mail.html.includes(`cid:${LOGO_CID}`));
  assert.equal(mail.attachments[0].content.subarray(1, 4).toString(), 'PNG');
  assert.doesNotMatch(mail.html, /<script|<img[^>]+src="https?:/);
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const mime = (await transport.sendMail(mail)).message.toString();
  assert.match(mime, /Content-Type: multipart\/alternative/i);
  assert.match(mime, /Content-Type: text\/html/i);
  assert.match(mime, /Content-Type: text\/plain/i);
  assert.ok(mime.includes(`Content-ID: <${LOGO_CID}>`));
  assert.match(mime, /Content-Disposition: inline/i);
});
test('email links are escaped inside HTML and still legible in plain text', () => {
  const link = 'https://nooky.io/reset-password?a=1&b=2';
  const mail = renderResetEmail({ link, privacyUrl: 'https://nooky.io/privacy' });
  assert.ok(mail.html.includes('reset-password?a=1&amp;b=2'));
  assert.ok(mail.text.includes(link));
});
