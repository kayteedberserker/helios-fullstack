import { defaultPlans, defaultTemplates } from '../../shared/catalog.js';
import { demoSupportRequest } from './demoSupport.js';

const STORAGE = 'helios-preview-v2';
const SESSION = 'helios-preview-session';
const id = n => n.toString(16).padStart(24, '0');
const now = () => new Date().toISOString();
const dayAgo = n => new Date(Date.now() - n * 86400000).toISOString();
const makeId = () => crypto.randomUUID().replaceAll('-', '').slice(0, 24);
export function demoSeed() {
  const plans = defaultPlans.map((p, i) => ({ ...p, _id: id(i + 1), currency: 'USD', published: true }));
  const templates = defaultTemplates.map((t, i) => ({ ...t, _id: id(i + 11), published: true, systemPrompt: `You are a helpful ${t.name.toLowerCase()}. Ask for context and give useful, practical responses.` }));
  const users = [
    { _id: id(21), name: 'Maya Thompson', email: 'maya@example.com', role: 'user', status: 'active', timezone: 'UTC', createdAt: dayAgo(25) },
    { _id: id(22), name: 'Helios Admin', email: 'admin@example.com', role: 'admin', status: 'active', timezone: 'UTC', createdAt: dayAgo(30) },
    { _id: id(23), name: 'Amara Okafor', email: 'amara@example.com', role: 'user', status: 'active', timezone: 'Africa/Lagos', createdAt: dayAgo(8) },
    { _id: id(24), name: 'Daniel Chen', email: 'daniel@example.com', role: 'user', status: 'active', timezone: 'UTC', createdAt: dayAgo(4) },
  ];
  return { plans, templates, users,
    supportThreads: [
      { _id: id(71), userId: id(21), status: 'open', sequence: 2, userMessageCount: 1, adminMessageCount: 1, userReadAdminCount: 0, adminReadUserCount: 1, lastSenderRole: 'admin', lastMessageText: 'Hi Maya! You can change Sunny’s name and instructions from My Agent → Edit settings. Happy to help with anything else.', lastMessageAt: dayAgo(0), updatedAt: dayAgo(0) },
      { _id: id(72), userId: id(23), status: 'open', sequence: 1, userMessageCount: 1, adminMessageCount: 0, userReadAdminCount: 0, adminReadUserCount: 0, lastSenderRole: 'user', lastMessageText: 'Hello! Can you help me choose an agent for my small business?', lastMessageAt: dayAgo(0), updatedAt: dayAgo(0) },
    ],
    supportMessages: [
      { _id: id(81), threadId: id(71), senderId: id(21), senderRole: 'user', senderName: 'Maya Thompson', sequence: 1, senderCount: 1, content: 'Hi! Where can I personalise Sunny?', clientId: '00000000-0000-4000-8000-000000000081', createdAt: dayAgo(1) },
      { _id: id(82), threadId: id(71), senderId: id(22), senderRole: 'admin', senderName: 'Helios Admin', sequence: 2, senderCount: 1, content: 'Hi Maya! You can change Sunny’s name and instructions from My Agent → Edit settings. Happy to help with anything else.', clientId: '00000000-0000-4000-8000-000000000082', createdAt: dayAgo(0) },
      { _id: id(83), threadId: id(72), senderId: id(23), senderRole: 'user', senderName: 'Amara Okafor', sequence: 1, senderCount: 1, content: 'Hello! Can you help me choose an agent for my small business?', clientId: '00000000-0000-4000-8000-000000000083', createdAt: dayAgo(0) },
    ],
    agents: [{ _id: id(31), userId: id(21), templateId: id(11), name: 'Sunny', instructions: 'Keep things practical. I run a small creative business and like clear next steps.', tone: 'friendly', status: 'active', createdAt: dayAgo(24) }],
    subscriptions: [{ userId: id(21), planCode: 'pro', planName: 'Pro', responseLimit: 1000, period: 'monthly', startsAt: dayAgo(20), endsAt: new Date(Date.now() + 10 * 86400000).toISOString() }],
    usage: { [id(21)]: 127 },
    messages: { [id(21)]: [{ _id: id(41), role: 'assistant', content: 'Hello Maya! I’m Sunny, your everyday assistant. What would you like to make a little easier today? This is a sample conversation for the demo.', createdAt: dayAgo(1) }] },
    activity: [{ _id: id(51), userId: id(21), kind: 'conversation', text: 'You worked with Sunny.', createdAt: dayAgo(0) }, { _id: id(52), userId: id(21), kind: 'agent', text: 'You personalised Sunny’s instructions.', createdAt: dayAgo(1) }, { _id: id(53), userId: id(21), kind: 'payment', text: 'Sample Pro plan activated. No payment was taken.', createdAt: dayAgo(20) }],
    payments: [{ _id: id(61), userId: id(21), planName: 'Pro', period: 'monthly', amount: 2500, currency: 'USD', reference: 'demo_helios_001', status: 'success', paidAt: dayAgo(20), createdAt: dayAgo(20), demo: true }, { _id: id(62), userId: id(23), planName: 'Max', period: 'monthly', amount: 10000, currency: 'USD', reference: 'demo_helios_002', status: 'success', paidAt: dayAgo(2), createdAt: dayAgo(2), demo: true }, { _id: id(63), userId: id(24), planName: 'Pro', period: 'monthly', amount: 2500, currency: 'USD', reference: 'demo_helios_003', status: 'pending', createdAt: dayAgo(1), demo: true }],
  };
}
function read() { try { const state = JSON.parse(localStorage.getItem(STORAGE)) || demoSeed(); if (!state.supportThreads) { const seed = demoSeed(); state.supportThreads = seed.supportThreads; state.supportMessages = seed.supportMessages; } return state; } catch { return demoSeed(); } }
function save(state) { localStorage.setItem(STORAGE, JSON.stringify(state)); }
function fail(message, status = 400) { const error = new Error(message); error.status = status; throw error; }
function event(state, userId, kind, text) { state.activity.unshift({ _id: makeId(), userId, kind, text, createdAt: now() }); }
function access(state, user) {
  const subscription = state.subscriptions.find(s => s.userId === user._id);
  const plan = state.plans.find(p => p.code === (subscription?.planCode || 'free'));
  return { plan, subscription: subscription || null, usage: { responses: state.usage[user._id] || 0, limit: plan.responseLimit, bucket: now().slice(0, 7) } };
}

export async function demoRequest(path, { method = 'GET', body } = {}) {
  const state = read();
  const parsed = new URL(path, 'https://demo.local');
  const route = parsed.pathname;
  let user = state.users.find(u => u._id === sessionStorage.getItem(SESSION));
  const agent = () => { const value = state.agents.find(a => a.userId === user._id); return value ? { ...value, templateId: state.templates.find(t => t._id === value.templateId) } : null; };
  let result;
  if (route === '/catalog') result = { plans: state.plans.filter(p => p.published), templates: state.templates.filter(t => t.published).map(({ systemPrompt, ...t }) => t) };
  else if (['/auth/login', '/auth/admin/login', '/auth/demo'].includes(route)) {
    const role = route.includes('/admin/') || body?.role === 'admin' ? 'admin' : 'user';
    user = state.users.find(u => u.role === role && u.status === 'active');
    sessionStorage.setItem(SESSION, user._id); result = { user, csrf: 'preview-only' };
  } else if (route === '/auth/signup') {
    if (state.users.some(u => u.email === body.email.toLowerCase())) fail('That demo email already exists. Open the demo workspace or use a different address.');
    user = { _id: makeId(), name: body.name, email: body.email.toLowerCase(), timezone: 'UTC', role: 'user', status: 'active', createdAt: now() };
    // Demo passwords are intentionally never saved or transmitted.
    state.users.push(user); sessionStorage.setItem(SESSION, user._id);
    event(state, user._id, 'account', 'Your demo workspace is ready.'); result = { user, csrf: 'preview-only' };
  } else if (route === '/auth/forgot-password' || route === '/auth/reset-password' || route === '/auth/admin/signup') fail('This preview does not send email or create administrator accounts. Use the demo workspace button to explore.');
  else {
    if (!user) fail('Please sign in to continue.', 401);
    if (route === '/auth/me') result = { user, csrf: 'preview-only' };
    else if (route === '/auth/logout') { sessionStorage.removeItem(SESSION); result = { message: 'Signed out.' }; }
    else if (route === '/account/profile') { Object.assign(user, { name: body.name, timezone: body.timezone }); result = { user }; event(state, user._id, 'profile', 'Your demo profile was updated.'); }
    else if (route === '/account/password') result = { user, csrf: 'preview-only', message: 'Preview only: no password was stored or changed.' };
    else if (route === '/account/dashboard') result = { ...access(state, user), agent: agent(), activity: state.activity.filter(e => e.userId === user._id).slice(0, 6), payments: state.payments.filter(p => p.userId === user._id), capabilities: { ai: true, payments: false } };
    else if (route === '/agent' && method === 'GET') result = { agent: agent(), messages: state.messages[user._id] || [], aiReady: false };
    else if (route === '/agent' && method === 'POST') {
      if (agent()) fail('You already have an agent.');
      const value = { ...body, _id: makeId(), userId: user._id, status: 'active', createdAt: now() }; state.agents.push(value); result = { agent: agent() }; event(state, user._id, 'agent', `${value.name} joined your demo workspace.`);
    } else if (route === '/agent' && method === 'PATCH') { const value = state.agents.find(a => a.userId === user._id); Object.assign(value, body); result = { agent: agent() }; event(state, user._id, 'agent', 'Your demo agent settings were updated.'); }
    else if (route === '/agent/messages' && method === 'DELETE') { state.messages[user._id] = []; result = { message: 'Demo conversation cleared.' }; }
    else if (route === '/agent/messages' && method === 'POST') {
      if (agent()?.status !== 'active') fail('Resume your agent to start a conversation.');
      if ((state.usage[user._id] || 0) >= access(state, user).plan.responseLimit) fail('Your demo response limit has been reached. Preview a larger plan from the dashboard.', 402);
      const messages = [{ _id: makeId(), role: 'user', content: body.content, createdAt: now() }, { _id: makeId(), role: 'assistant', content: 'Here’s a useful place to start:\n\n1. Choose the one outcome that would make today feel successful.\n2. Break it into three small, concrete steps.\n3. Give the first step a time on your calendar and leave some breathing room.\n\nShare a little more context and we can shape the plan together.\n\nThis is a sample demo response. The real app uses your configured AI service.', createdAt: now() }];
      (state.messages[user._id] ||= []).push(...messages); state.usage[user._id] = (state.usage[user._id] || 0) + 1; result = { messages, responses: state.usage[user._id] }; event(state, user._id, 'conversation', `You worked with ${agent().name}.`);
    } else if (route === '/payments/checkout') {
      const plan = state.plans.find(p => p._id === body.planId);
      state.subscriptions = state.subscriptions.filter(s => s.userId !== user._id);
      state.subscriptions.push({ userId: user._id, planCode: plan.code, planName: plan.name, responseLimit: plan.responseLimit, period: body.period, startsAt: now(), endsAt: new Date(Date.now() + (body.period === 'yearly' ? 365 : 30) * 86400000).toISOString() });
      result = { demo: true, message: `Preview switched to ${plan.name}. No payment was processed.` }; event(state, user._id, 'plan', `You previewed the ${plan.name} plan. No payment was processed.`);
    } else if (route.startsWith('/support/') || route === '/admin/support' || route.startsWith('/admin/support/')) {
      result = demoSupportRequest(state, user, parsed, method, body);
    } else if (route.startsWith('/admin/')) {
      if (user.role !== 'admin') fail('Administrator access required.', 403);
      if (route === '/admin/dashboard') result = { stats: { users: state.users.filter(u => u.role === 'user').length, agents: state.agents.filter(a => a.status === 'active').length, revenue: state.payments.filter(p => p.status === 'success' && p.paidAt.slice(0, 7) === now().slice(0, 7)).reduce((total, p) => total + p.amount, 0), responses: Object.values(state.usage).reduce((a, b) => a + b, 0), payments: state.payments.filter(p => p.status === 'success').length }, recentPayments: state.payments.filter(p => p.status === 'success').map(p => ({ ...p, userId: state.users.find(u => u._id === p.userId) })), activity: state.activity.slice(0, 6).map(e => ({ ...e, userId: state.users.find(u => u._id === e.userId) })), services: { database: false, payments: false, ai: false, mail: false } };
      else if (route === '/admin/users') {
        const search = parsed.searchParams.get('search')?.toLowerCase() || ''; const page = Number(parsed.searchParams.get('page') || 1);
        const users = state.users.filter(u => `${u.name} ${u.email}`.toLowerCase().includes(search)); result = { users: users.slice((page - 1) * 20, page * 20), total: users.length, page, pages: Math.max(1, Math.ceil(users.length / 20)) };
      } else if (route.startsWith('/admin/users/')) { const customer = state.users.find(u => u._id === route.split('/').at(-1)); customer.status = body.status; result = { user: customer }; }
      else if (route === '/admin/catalog') result = { templates: state.templates, plans: state.plans, agents: state.agents.length };
      else if (route === '/admin/templates' && method === 'POST') { const template = { ...body, _id: makeId() }; state.templates.push(template); result = { template }; }
      else if (route.startsWith('/admin/templates/')) { const template = state.templates.find(t => t._id === route.split('/').at(-1)); Object.assign(template, body); result = { template }; }
      else if (route.startsWith('/admin/plans/')) { const plan = state.plans.find(p => p._id === route.split('/').at(-1)); Object.assign(plan, body); result = { plan }; }
      else if (route === '/admin/payments') {
        const status = parsed.searchParams.get('status') || 'all'; const page = Number(parsed.searchParams.get('page') || 1);
        const payments = state.payments.filter(p => status === 'all' || p.status === status).map(p => ({ ...p, userId: state.users.find(u => u._id === p.userId) })); result = { payments: payments.slice((page - 1) * 20, page * 20), total: payments.length, page, pages: Math.max(1, Math.ceil(payments.length / 20)) };
      } else if (route === '/admin/invites') result = { url: `${location.origin}/admin/signup?email=${encodeURIComponent(body.email)}&token=preview-only-not-a-real-invite`, expiresAt: new Date(Date.now() + 48 * 3600000).toISOString() };
      else fail('Demo action not found.');
    } else fail('This action is not available in the demo.');
  }
  save(state);
  return structuredClone(result);
}
