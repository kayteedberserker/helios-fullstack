import test from 'node:test';
import assert from 'node:assert/strict';
import { demoRequest } from '../../src/lib/demo.js';
import { toCsv } from '../../src/lib/exportCsv.js';

const storage = () => { const values = new Map(); return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) }; };
globalThis.localStorage = storage(); globalThis.sessionStorage = storage(); globalThis.location = { origin: 'https://helios.example.com' };
test('the demo supports a fresh account, agent creation, chat, personalisation, and preview billing', async () => {
  const password = 'never-store-this-secret';
  const signup = await demoRequest('/auth/signup', { method: 'POST', body: { name: 'Alex Demo', email: 'alex@example.com', password } }); assert.equal(signup.user.role, 'user');
  const catalog = await demoRequest('/catalog'); assert.equal(catalog.templates.length, 3);
  await demoRequest('/agent', { method: 'POST', body: { templateId: catalog.templates[0]._id, name: 'Sunny', tone: 'friendly', instructions: 'Be concise.' } });
  const chat = await demoRequest('/agent/messages', { method: 'POST', body: { content: 'Help me plan my day.' } }); assert.equal(chat.messages.length, 2); assert.match(chat.messages[1].content, /sample demo response/);
  await demoRequest('/account/profile', { method: 'PATCH', body: { name: 'Alex Updated', timezone: 'Africa/Lagos' } }); assert.equal((await demoRequest('/auth/me')).user.name, 'Alex Updated');
  const billing = await demoRequest('/payments/checkout', { method: 'POST', body: { planId: catalog.plans[1]._id, period: 'monthly' } }); assert.equal(billing.demo, true);
  const dashboard = await demoRequest('/account/dashboard'); assert.equal(dashboard.plan.code, 'pro'); assert.equal(dashboard.usage.responses, 1); assert.equal(dashboard.payments.length, 0);
  assert.equal(localStorage.getItem('helios-preview-v2').includes(password), false);
  await demoRequest('/auth/logout', { method: 'POST' }); await assert.rejects(demoRequest('/account/dashboard'));
});
test('a customer preview cannot read admin data; admin catalog edits update the preview', async () => {
  await demoRequest('/auth/demo', { method: 'POST', body: { role: 'user' } }); await assert.rejects(demoRequest('/admin/users'));
  await demoRequest('/auth/demo', { method: 'POST', body: { role: 'admin' } });
  const catalog = await demoRequest('/admin/catalog'); const template = catalog.templates[0];
  await demoRequest(`/admin/templates/${template._id}`, { method: 'PATCH', body: { name: 'Updated speciality' } });
  assert.equal((await demoRequest('/admin/catalog')).templates[0].name, 'Updated speciality');
  const filtered = await demoRequest('/admin/payments?status=success&page=1'); assert.ok(filtered.payments.every(p => p.status === 'success'));
});
test('CSV exports preserve commas and line breaks and neutralise spreadsheet formulas', () => {
  const csv = toCsv([['Name', 'Note'], ['=HYPERLINK("x")', 'hello,\nworld']]);
  assert.match(csv, /'=/); assert.match(csv, /hello,\nworld/); assert.match(csv, /""x""/);
});
