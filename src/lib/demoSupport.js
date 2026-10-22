import { needsReply, supportMessageInput, supportMessageView, supportReadInput, supportStats, supportStatusInput, supportThreadView, unreadCount } from '../../shared/support.js';

const makeId = () => crypto.randomUUID().replaceAll('-', '').slice(0, 24);
const fail = (message, status = 400) => { const error = new Error(message); error.status = status; throw error; };
export function demoSupportRequest(state, user, url, method, body) {
  const route = url.pathname, admin = route.startsWith('/admin/');
  if (user.role !== (admin ? 'admin' : 'user')) fail(admin ? 'Administrator access required.' : 'Use a customer account to contact support.', 403);
  const threads = state.supportThreads, messages = state.supportMessages;
  const view = thread => supportThreadView(admin && thread ? { ...thread, userId: state.users.find(u => u._id === thread.userId) } : thread, user.role);
  const history = (thread, before) => {
    if (!thread) return { thread: null, messages: [], hasOlder: false };
    const list = messages.filter(m => m.threadId === thread._id && (!before || m.sequence < before)).sort((a, b) => b.sequence - a.sequence);
    return { thread: view(thread), messages: list.slice(0, 50).reverse().map(supportMessageView), hasOlder: list.length > 50 };
  };
  const before = Number(url.searchParams.get('before') || 0);
  if (!Number.isSafeInteger(before) || before < 0) fail('Invalid message cursor.');
  if (route === '/admin/support/summary' && method === 'GET') return { summary: supportStats(threads) };
  if (route === '/admin/support' && method === 'GET') {
    const status = url.searchParams.get('status') || 'all', search = (url.searchParams.get('search') || '').trim().toLowerCase();
    const page = Number(url.searchParams.get('page') || 1), selected = url.searchParams.get('selected');
    if (!['all', 'waiting', 'unread', 'resolved'].includes(status) || !Number.isInteger(page) || page < 1 || search.length > 80) fail('Invalid inbox filter.');
    const list = threads.filter(t => {
      const customer = state.users.find(u => u._id === t.userId);
      return t.sequence && (!search || `${customer?.name} ${customer?.email}`.toLowerCase().includes(search)) &&
        (status === 'all' || (status === 'waiting' && needsReply(t)) || (status === 'unread' && unreadCount(t, 'admin') > 0) || (status === 'resolved' && t.status === 'resolved'));
    }).sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt) || b._id.localeCompare(a._id));
    const thread = selected ? threads.find(t => t._id === selected) : null;
    if (selected && !thread) fail('Support conversation not found.', 404);
    return { threads: list.slice((page - 1) * 20, page * 20).map(view), total: list.length, page, pages: Math.max(1, Math.ceil(list.length / 20)), summary: supportStats(threads), conversation: thread ? history(thread) : null };
  }
  let thread = admin ? threads.find(t => t._id === route.split('/')[3]) : threads.find(t => t.userId === user._id);
  if (admin && !thread) fail('Support conversation not found.', 404);
  if (route === '/support/summary' && method === 'GET') return { thread: view(thread) };
  if ((route === '/support/thread' || /^\/admin\/support\/[a-f\d]{24}\/messages$/.test(route)) && method === 'GET') return history(thread, before);
  if (route.endsWith('/read') && method === 'POST') {
    const { through } = supportReadInput.parse(body);
    if (thread) {
      const marker = admin ? 'adminReadUserCount' : 'userReadAdminCount', counter = admin ? 'userMessageCount' : 'adminMessageCount';
      thread[marker] = Math.max(thread[marker], Math.min(through, thread[counter]));
    }
    return { thread: view(thread) };
  }
  if (route.endsWith('/messages') && method === 'POST') {
    const input = supportMessageInput.parse(body);
    if (!thread) {
      thread = { _id: makeId(), userId: user._id, status: 'open', sequence: 0, userMessageCount: 0, adminMessageCount: 0, userReadAdminCount: 0, adminReadUserCount: 0, lastMessageText: '', createdAt: new Date().toISOString() };
      threads.push(thread);
    }
    const existing = messages.find(m => m.threadId === thread._id && m.clientId === input.clientId);
    if (existing) {
      if (existing.senderId !== user._id || existing.content !== input.content) fail('This message identifier was already used.', 409);
      return { message: supportMessageView(existing), thread: view(thread) };
    }
    const timestamp = new Date().toISOString(), counter = admin ? 'adminMessageCount' : 'userMessageCount';
    thread.sequence++; thread[counter]++;
    Object.assign(thread, { status: 'open', lastSenderRole: user.role, lastMessageText: input.content.slice(0, 160), lastMessageAt: timestamp, updatedAt: timestamp });
    const message = { _id: makeId(), threadId: thread._id, senderId: user._id, senderRole: user.role, senderName: user.name, senderCount: thread[counter], sequence: thread.sequence, ...input, createdAt: timestamp };
    messages.push(message); return { message: supportMessageView(message), thread: view(thread) };
  }
  if (admin && /^\/admin\/support\/[a-f\d]{24}$/.test(route) && method === 'PATCH') {
    const input = supportStatusInput.parse(body);
    if (thread.sequence !== input.expectedSequence) fail('A new message arrived. Review it before changing the conversation status.', 409);
    thread.status = input.status; thread.updatedAt = new Date().toISOString(); return { thread: view(thread) };
  }
  fail('Support action not found.', 404);
}
