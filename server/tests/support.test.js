import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../app.js';
import { readConfig } from '../config.js';
import { mongoSupportStore } from '../services/support-store.js';
import { supportStats } from '../../shared/support.js';
import { demoRequest } from '../../src/lib/demo.js';
import { mergeSupportMessages, mergeSupportPage } from '../../shared/support-history.js';

const id = n => n.toString(16).padStart(24, '0');
const users = [
  { _id: id(21), role: 'user', name: 'Maya', email: 'maya@example.com', status: 'active', sessionVersion: 0 },
  { _id: id(23), role: 'user', name: 'Amara', email: 'amara@example.com', status: 'active', sessionVersion: 0 },
  { _id: id(22), role: 'admin', name: 'Admin', email: 'admin@example.com', status: 'active', sessionVersion: 0 },
];
const config = readConfig({ JWT_SECRET: 's'.repeat(40), CLIENT_URL: 'http://localhost:4173' });
const input = content => ({ content, clientId: crypto.randomUUID() });
const defaults = { status: 'open', sequence: 0, userMessageCount: 0, adminMessageCount: 0, userReadAdminCount: 0, adminReadUserCount: 0, lastMessageText: '' };

// A transactional repository double exercises the production store, without a
// live database. Rollback, ownership filters, cursors and session usage matter here.
function fixture() {
  let threads = [], messages = [], serial = 100, failCreate = false;
  const session = { testSession: true };
  const matches = (row, filter) => Object.entries(filter).every(([key, value]) => {
    if (key === '$expr') return row.userMessageCount > row.adminReadUserCount;
    if (value && typeof value === 'object') return Object.entries(value).every(([operator, bound]) => operator === '$gt' ? row[key] > bound : operator === '$lt' ? row[key] < bound : operator === '$in' ? bound.includes(row[key]) : false);
    return String(row[key]) === String(value);
  });
  function query(get) {
    let populated = false, sort, skip = 0, limit = Infinity;
    const resolve = () => {
      let value = structuredClone(get());
      const populate = row => row ? { ...row, userId: users.find(u => u._id === row.userId) || row.userId } : row;
      if (Array.isArray(value)) {
        if (sort) value.sort((a, b) => { for (const [key, direction] of Object.entries(sort)) { if (a[key] < b[key]) return -direction; if (a[key] > b[key]) return direction; } return 0; });
        value = value.slice(skip, skip + limit); if (populated) value = value.map(populate);
      } else if (populated) value = populate(value);
      return value;
    };
    const q = { session: value => { assert.equal(value, session); return q; }, populate: () => { populated = true; return q; },
      sort: value => { sort = value; return q; }, skip: value => { skip = value; return q; }, limit: value => { limit = value; return q; },
      lean: async () => resolve(), then: (ok, bad) => Promise.resolve().then(resolve).then(ok, bad) };
    return q;
  }
  const models = {
    User: {
      findById: async value => users.find(u => u._id === value),
      find: filter => ({ distinct: async () => users.filter(u => u.role === filter.role && filter.$or.some(part => Object.entries(part).some(([key, regex]) => regex.test(u[key])))).map(u => u._id) }),
    },
    SupportThread: {
      findOne: filter => query(() => threads.find(t => matches(t, filter)) || null),
      findById: value => query(() => threads.find(t => t._id === String(value)) || null),
      find: filter => query(() => threads.filter(t => matches(t, filter))),
      exists: async filter => threads.some(t => matches(t, filter)),
      countDocuments: async filter => threads.filter(t => matches(t, filter)).length,
      aggregate: async () => [{ _id: null, ...supportStats(threads) }],
      findOneAndUpdate: (filter, update, options) => query(() => {
        let thread = threads.find(t => matches(t, filter));
        if (!thread && options?.upsert) { thread = { _id: id(serial++), ...defaults, ...update.$setOnInsert }; threads.push(thread); }
        if (!thread) return null;
        if (Array.isArray(update)) {
          const [marker, expression] = Object.entries(update[0].$set)[0];
          thread[marker] = Math.max(thread[marker], Math.min(expression.$max[1].$min[0], thread[expression.$max[1].$min[1].slice(1)]));
        } else {
          if (update.$inc) { assert.equal(options.session, session); for (const [key, increment] of Object.entries(update.$inc)) thread[key] += increment; }
          Object.assign(thread, update.$set);
        }
        thread.updatedAt = new Date().toISOString(); return thread;
      }),
    },
    SupportMessage: {
      find: filter => query(() => messages.filter(m => matches(m, filter))),
      findOne: filter => query(() => messages.find(m => matches(m, filter)) || null),
      create: async (values, options) => {
        assert.equal(options.session, session); assert.equal(options.ordered, true);
        if (failCreate) { failCreate = false; throw new Error('Simulated insert failure'); }
        const created = values.map(value => ({ ...value, _id: id(serial++), createdAt: new Date().toISOString() })); messages.push(...created); return created;
      },
    },
  };
  const transaction = async work => {
    const snapshot = structuredClone({ threads, messages });
    try { return await work(session); } catch (error) { threads = snapshot.threads; messages = snapshot.messages; throw error; }
  };
  const store = mongoSupportStore(models, transaction);
  const app = createApp({ config, models, supportStore: store });
  const headers = (req, user = users[0]) => req.set('Cookie', `helios_session=${jwt.sign({ ver: 0, csrf: 'test-csrf' }, config.jwtSecret, { subject: user._id, issuer: 'helios-api', audience: 'helios-web' })}`)
    .set('X-CSRF-Token', 'test-csrf').set('X-Helios-Client', '1').set('Origin', config.clientUrl);
  return { app, headers, store, failInsert: () => { failCreate = true; } };
}

test('support is private and customers cannot use admin endpoints or inject thread/sender ownership', async () => {
  const { app, headers } = fixture();
  for (const path of ['/api/support/summary', '/api/support/thread', '/api/admin/support', '/api/admin/support/summary']) assert.equal((await request(app).get(path)).status, 401);
  assert.equal((await headers(request(app).get('/api/admin/support'))).status, 403);
  assert.equal((await headers(request(app).get('/api/support/thread'), users[2])).status, 403);
  for (const injected of [{ userId: users[1]._id }, { senderRole: 'admin' }, { threadId: id(90) }, { senderName: 'Admin' }]) {
    assert.equal((await headers(request(app).post('/api/support/messages')).send({ ...input('Hello'), ...injected })).status, 400);
  }
  assert.equal((await headers(request(app).get(`/api/support/thread?userId=${users[1]._id}`))).status, 400);
});
test('two customer conversations are isolated; administrators can read and reply without AI or payment keys', async () => {
  const { app, headers } = fixture();
  const first = await headers(request(app).post('/api/support/messages')).send(input('Hello from Maya'));
  const other = await headers(request(app).post('/api/support/messages'), users[1]).send(input('Hello from Amara'));
  assert.equal(first.status, 200); assert.notEqual(first.body.thread._id, other.body.thread._id);
  const history = await headers(request(app).get('/api/support/thread'));
  assert.deepEqual(history.body.messages.map(m => m.content), ['Hello from Maya']);
  assert.equal('senderId' in history.body.messages[0], false); assert.equal('customer' in history.body.thread, false);
  const threadId = first.body.thread._id;
  assert.equal((await headers(request(app).post(`/api/admin/support/${threadId}/messages`)).send(input('Forged reply'))).status, 403);
  const inbox = await headers(request(app).get(`/api/admin/support?selected=${threadId}`), users[2]);
  assert.equal(inbox.status, 200); assert.equal(inbox.body.summary.waiting, 2); assert.equal(inbox.body.conversation.thread.customer.email, users[0].email);
  const reply = await headers(request(app).post(`/api/admin/support/${threadId}/messages`), users[2]).send(input('Happy to help'));
  assert.equal(reply.body.message.senderRole, 'admin'); assert.equal(reply.body.message.senderName, 'Helios support');
  assert.equal(reply.body.thread.needsReply, false);
  assert.equal((await headers(request(app).get('/api/support/summary'))).body.thread.unread, 1);
});
test('support mutations enforce CSRF, origins, input limits and query validation', async () => {
  const { app, headers } = fixture();
  assert.equal((await headers(request(app).post('/api/support/messages')).set('X-CSRF-Token', 'wrong').send(input('Hello'))).status, 403);
  assert.equal((await headers(request(app).post('/api/support/messages')).set('Origin', 'https://other.example').send(input('Hello'))).status, 403);
  for (const content of ['', '   ', 'x'.repeat(4001)]) assert.equal((await headers(request(app).post('/api/support/messages')).send(input(content))).status, 400);
  assert.equal((await headers(request(app).post('/api/support/messages')).send({ content: 'Hello', clientId: 'bad' })).status, 400);
  for (const query of ['page=0', 'page=1.5', 'status=bad', `search=${'a'.repeat(81)}`, 'selected=invalid']) assert.equal((await headers(request(app).get(`/api/admin/support?${query}`), users[2])).status, 400);
  assert.equal((await headers(request(app).get('/api/support/thread?before=-1'))).status, 400);
  assert.equal((await headers(request(app).post('/api/support/read')).send({ through: -1 })).status, 400);
  assert.equal((await headers(request(app).get(`/api/admin/support/${id(99)}/messages`), users[2])).status, 404);
});
test('repeated send retries commit only once; identifier reuse cannot change a message or impersonate another sender', async () => {
  const { store } = fixture(); const body = input('Please help');
  const first = await store.customerSend(users[0], body), again = await store.customerSend(users[0], body);
  assert.equal(first.message._id, again.message._id); assert.equal(again.thread.sequence, 1);
  assert.equal((await store.customerHistory(users[0]._id)).messages.length, 1);
  await assert.rejects(store.customerSend(users[0], { ...body, content: 'Changed' }), error => error.status === 409);
  await assert.rejects(store.adminSend(first.thread._id, users[2], body), error => error.status === 409);
});
test('message insertion failure rolls back counters, preview and pending state', async () => {
  const { store, failInsert } = fixture();
  await store.customerSend(users[0], input('Original'));
  const before = await store.summary(users[0]._id); failInsert();
  await assert.rejects(store.customerSend(users[0], input('Must roll back')), /Simulated insert failure/);
  const after = await store.summary(users[0]._id);
  assert.equal(after.thread.sequence, before.thread.sequence); assert.equal(after.thread.lastMessageText, 'Original');
  assert.equal((await store.customerHistory(users[0]._id)).messages.length, 1);
});
test('read cursors never move backwards and messages arriving after the displayed snapshot remain unread', async () => {
  const { store } = fixture(); const first = await store.customerSend(users[0], input('One'));
  await store.customerSend(users[0], input('Two'));
  assert.equal((await store.adminRead(first.thread._id, 1)).thread.unread, 1);
  assert.equal((await store.adminRead(first.thread._id, 0)).thread.unread, 1);
  assert.equal((await store.adminRead(first.thread._id, 99999)).thread.unread, 0);
  assert.equal((await store.stats()).waiting, 1, 'reading is not replying');
  await store.customerSend(users[0], input('New after read'));
  assert.equal((await store.adminRead(first.thread._id, 2)).thread.unread, 1);
  await store.adminSend(first.thread._id, users[2], input('Reply one')); await store.adminSend(first.thread._id, users[2], input('Reply two'));
  assert.equal((await store.customerRead(users[0]._id, 1)).thread.unread, 1);
  assert.equal((await store.customerRead(users[0]._id, 0)).thread.unread, 1);
});
test('resolving a stale view rejects concurrent new messages; a new message reopens a resolved thread', async () => {
  const { store } = fixture(); const sent = await store.customerSend(users[0], input('Question'));
  await store.customerSend(users[0], input('Another question'));
  await assert.rejects(store.setStatus(sent.thread._id, { status: 'resolved', expectedSequence: 1 }), error => error.status === 409);
  const resolved = await store.setStatus(sent.thread._id, { status: 'resolved', expectedSequence: 2 }); assert.equal(resolved.thread.status, 'resolved');
  assert.equal((await store.stats()).waiting, 0);
  const reopened = await store.customerSend(users[0], input('Follow-up')); assert.equal(reopened.thread.status, 'open'); assert.equal(reopened.thread.needsReply, true);
});
test('history is bounded and cursor pages preserve sequence order; inbox search treats regex text literally', async () => {
  const { store } = fixture(); let sent;
  for (let n = 1; n <= 57; n++) sent = await store.customerSend(users[0], input(`Message ${n}`));
  const latest = await store.customerHistory(users[0]._id); assert.equal(latest.messages.length, 50); assert.equal(latest.hasOlder, true);
  assert.deepEqual([latest.messages[0].sequence, latest.messages.at(-1).sequence], [8, 57]);
  const older = await store.adminHistory(sent.thread._id, 8); assert.equal(older.hasOlder, false); assert.equal(older.messages.length, 7);
  assert.equal((await store.inbox({ status: 'all', search: '.*', page: 1 })).total, 0);
  assert.equal((await store.inbox({ status: 'waiting', search: 'Maya', page: 1 })).total, 1);
  assert.equal((await store.inbox({ status: 'resolved', search: '', page: 1 })).total, 0);
});

test('preview supports customer→admin→customer messages, unread badges, retries and resolved follow-ups', async () => {
  const storage = () => { const values = new Map(); return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) }; };
  globalThis.localStorage = storage(); globalThis.sessionStorage = storage(); globalThis.location = { origin: 'https://helios.example' };
  await demoRequest('/auth/demo', { method: 'POST', body: { role: 'user' } });
  const body = input('I need help with my plan'); const sent = await demoRequest('/support/messages', { method: 'POST', body });
  assert.equal((await demoRequest('/support/messages', { method: 'POST', body })).thread.sequence, sent.thread.sequence);
  await assert.rejects(demoRequest('/admin/support'), error => error.status === 403);
  await demoRequest('/auth/demo', { method: 'POST', body: { role: 'admin' } });
  const path = `/admin/support/${sent.thread._id}`;
  assert.equal((await demoRequest('/admin/support?status=waiting')).threads.some(t => t._id === sent.thread._id), true);
  await demoRequest(`${path}/read`, { method: 'POST', body: { through: 2 } });
  const reply = await demoRequest(`${path}/messages`, { method: 'POST', body: input('Of course, what do you need?') });
  await demoRequest(path, { method: 'PATCH', body: { status: 'resolved', expectedSequence: reply.thread.sequence } });
  await demoRequest('/auth/demo', { method: 'POST', body: { role: 'user' } });
  assert.equal((await demoRequest('/support/summary')).thread.unread, 2);
  const history = await demoRequest('/support/thread'); assert.equal(history.messages.at(-1).senderRole, 'admin');
  await demoRequest('/support/read', { method: 'POST', body: { through: 2 } }); assert.equal((await demoRequest('/support/summary')).thread.unread, 0);
  const followUp = await demoRequest('/support/messages', { method: 'POST', body: input('One more question') }); assert.equal(followUp.thread.status, 'open');
  await demoRequest('/auth/signup', { method: 'POST', body: { name: 'New customer', email: 'new@example.com', password: 'unrecorded-password' } });
  assert.deepEqual((await demoRequest('/support/thread')).messages, []);
});

test('polled history deduplicates send acknowledgements and preserves loaded older messages', () => {
  const message = sequence => ({ _id: id(sequence), sequence, content: `Message ${sequence}` });
  const history = [1, 2, 3, 4].map(message);
  const sent = mergeSupportMessages(history, [message(5)]);
  const page = mergeSupportPage(sent, [3, 4, 5, 6].map(message));
  assert.equal(page.reset, false); assert.deepEqual(page.messages.map(m => m.sequence), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(mergeSupportMessages(page.messages, [message(1)]).map(m => m.sequence), [1, 2, 3, 4, 5, 6]);
});
test('resuming after a long polling gap keeps an earlier-message cursor that can recover all missed history', () => {
  const message = sequence => ({ _id: id(sequence), sequence });
  const result = mergeSupportPage([1, 2, 3].map(message), [20, 21, 22].map(message));
  assert.equal(result.reset, true); assert.deepEqual(result.messages.map(m => m.sequence), [20, 21, 22]);
  const earlier = mergeSupportMessages(result.messages, [17, 18, 19].map(message));
  assert.deepEqual(earlier.map(m => m.sequence), [17, 18, 19, 20, 21, 22]);
});
