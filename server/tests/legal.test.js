import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderLegalHtml } from '../../shared/render-legal.js';

test('privacy and terms are standalone documents with readable content and public links', () => {
  for (const kind of ['privacy', 'terms']) {
    const html = renderLegalHtml(kind, { email: 'support@example.com', operator: 'Example Limited' });
    assert.match(html, /^<!doctype html>/); assert.match(html, /<h1>/); assert.match(html, /mailto:support@example.com/);
    assert.match(html, /href="\/privacy"/); assert.match(html, /href="\/terms"/); assert.match(html, /Example Limited/);
    assert.doesNotMatch(html, /<script/); assert.doesNotMatch(html, /type="password"/);
  }
});
test('legal pages escape configured operator and contact values', () => {
  const html = renderLegalHtml('privacy', { email: '" onclick="evil@example.com', operator: '<script>alert(1)</script>' });
  assert.doesNotMatch(html, /<script>|" onclick="/); assert.match(html, /&lt;script&gt;/);
});
test('privacy identifies Google login permissions, AI processing, payment and rights practices', () => {
  const html = renderLegalHtml('privacy');
  for (const term of ['openid, email and profile', 'Google API Services User Data Policy', 'AI provider', 'Paystack', 'cookies', 'retention', 'Nigeria Data Protection Commission']) assert.ok(html.toLowerCase().includes(term.toLowerCase()), term);
});
test('Vercel serves public legal HTML before the SPA fallback while preserving API priority', async () => {
  const config = JSON.parse(await readFile(new URL('../../vercel.json', import.meta.url)));
  assert.equal(config.routes[0].dest, '/api/index.js');
  for (const [path, destination] of [['/', '/home.html'], ['/privacy', '/privacy.html'], ['/privacy-policy', '/privacy.html'], ['/terms', '/terms.html'], ['/terms-of-service', '/terms.html']]) {
    const route = config.routes.find(r => r.src && new RegExp(`^${r.src}$`).test(path));
    assert.equal(route.dest, destination);
  }
});
