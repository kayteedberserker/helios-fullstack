import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { loadEnv } from 'vite';
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
