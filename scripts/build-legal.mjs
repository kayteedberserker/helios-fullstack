import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { loadEnv } from 'vite';
import { site } from '../src/data/content.js';
import { renderLegalHtml } from '../shared/render-legal.js';

const env = { ...loadEnv('production', process.cwd(), 'VITE_'), ...process.env };
const css = await readFile(new URL('../src/legal.css', import.meta.url), 'utf8');
await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
for (const kind of ['privacy', 'terms']) {
  const html = renderLegalHtml(kind, { email: env.VITE_SUPPORT_EMAIL || '', operator: env.VITE_LEGAL_ENTITY || 'Nooky', css });
  await writeFile(new URL(`../dist/${kind}.html`, import.meta.url), html);
}
if (!env.VITE_SUPPORT_EMAIL) console.warn('Legal pages built. Set VITE_SUPPORT_EMAIL to your public support/privacy email before OAuth production review.');
console.log('Public privacy and terms pages generated.');

// Only the public root gets real HTML before React takes over. App routes
// continue to use the normal Vite shell, and the legal pages stand alone.
const escapeHtml = value => value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const output = new URL('../dist/', import.meta.url);
const shell = await readFile(new URL('index.html', output), 'utf8');
const root = '<div id="root"></div>';
if (!shell.includes(root)) throw new Error('Cannot find the React root for the public homepage.');
const home = `<div id="root">
  <header class="public-home-header">
    <div class="container">
      <a class="brand" href="/" aria-label="${escapeHtml(site.name)} home"><span class="brand-mark" aria-hidden="true">${Array.from({ length: 8 }, (_, i) => `<span style="--i:${i}"></span>`).join('')}</span>${escapeHtml(site.name)}<span class="brand-period">.</span></a>
    </div>
  </header>
  <main class="container public-home-summary">
    <p class="eyebrow">${escapeHtml(site.tagline)}</p>
    <h1>Meet your own Nooky AI agent.</h1>
    <p>${escapeHtml(site.hero.description)}</p>
    <a href="/signup" class="button">Create an account</a> <a href="/login">Sign in</a>
    <p>Google Sign-In uses your name, email address, and Google account ID to create, link, or sign in to your Nooky account.</p>
    <nav aria-label="Legal"><a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a></nav>
  </main>
</div>`;
await writeFile(new URL('home.html', output), shell.replace(root, () => home));
console.log('Public homepage HTML generated.');
