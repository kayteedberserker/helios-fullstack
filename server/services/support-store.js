import mongoose from 'mongoose';
import { HttpError } from '../lib/security.js';
import { supportMessageView, supportThreadView } from '../../shared/support.js';

const pageSize = 20, historySize = 50;
const customerFields = 'name email status';
const escaped = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function checkReplay(message, user, content) {
  if (String(message.senderId) !== String(user._id) || message.content !== content) throw new HttpError(409, 'This message identifier was already used. Refresh and try again.');
  return message;
}

export function mongoSupportStore(models, transaction = work => mongoose.connection.transaction(work)) {
  const { SupportThread: Thread, SupportMessage: Message, User } = models;
  const findCustomerThread = userId => Thread.findOne({ userId }).lean();
  const findAdminThread = threadId => Thread.findById(threadId).populate('userId', customerFields).lean();
  async function ensureThread(userId) {
    try { return await Thread.findOneAndUpdate({ userId }, { $setOnInsert: { userId } }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean(); }
    catch (error) { if (error.code !== 11000) throw error; return findCustomerThread(userId); }
  }
  async function history(thread, role, before) {
    if (!thread) return { thread: null, messages: [], hasOlder: false };
    const messages = await Message.find({ threadId: thread._id, ...(before ? { sequence: { $lt: before } } : {}) }).sort({ sequence: -1 }).limit(historySize + 1).lean();
    return { thread: supportThreadView(thread, role), messages: messages.slice(0, historySize).reverse().map(supportMessageView), hasOlder: messages.length > historySize };
  }
  async function send(thread, user, input) {
    let message;
    try {
      await transaction(async session => {
        const existing = await Message.findOne({ threadId: thread._id, clientId: input.clientId }).session(session).lean();
        if (existing) { message = checkReplay(existing, user, input.content); return; }
        const counter = user.role === 'admin' ? 'adminMessageCount' : 'userMessageCount';
        const updated = await Thread.findOneAndUpdate({ _id: thread._id }, {
          $inc: { sequence: 1, [counter]: 1 },
          $set: { status: 'open', lastSenderRole: user.role, lastMessageText: input.content.slice(0, 160), lastMessageAt: new Date() },
        }, { new: true, session }).lean();
        if (!updated) throw new HttpError(404, 'Support conversation not found.');
        [message] = await Message.create([{ threadId: thread._id, senderId: user._id, senderName: user.name, senderRole: user.role,
          sequence: updated.sequence, senderCount: updated[counter], content: input.content, clientId: input.clientId }], { session, ordered: true });
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      const existing = await Message.findOne({ threadId: thread._id, clientId: input.clientId }).lean();
      if (!existing) throw error;
      message = checkReplay(existing, user, input.content);
    }
    const current = user.role === 'admin' ? await findAdminThread(thread._id) : await findCustomerThread(user._id);
    return { message: supportMessageView(message), thread: supportThreadView(current, user.role) };
  }
  async function markRead(thread, role, through) {
    if (!thread) return { thread: null };
    const marker = role === 'admin' ? 'adminReadUserCount' : 'userReadAdminCount';
    const counter = role === 'admin' ? 'userMessageCount' : 'adminMessageCount';
    // Never move backwards or acknowledge messages beyond the current sender count.
    const updated = await Thread.findOneAndUpdate({ _id: thread._id }, [{ $set: { [marker]: { $max: [`$${marker}`, { $min: [through, `$${counter}`] }] } } }], { new: true }).lean();
    return { thread: supportThreadView(updated, role) };
  }
  async function stats() {
    const [result] = await Thread.aggregate([{ $match: { sequence: { $gt: 0 } } }, { $group: { _id: null,
      open: { $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] } },
      resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
      waiting: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'open'] }, { $eq: ['$lastSenderRole', 'user'] }] }, 1, 0] } },
      unread: { $sum: { $cond: [{ $gt: ['$userMessageCount', '$adminReadUserCount'] }, 1, 0] } },
      attention: { $sum: { $cond: [{ $or: [{ $gt: ['$userMessageCount', '$adminReadUserCount'] }, { $and: [{ $eq: ['$status', 'open'] }, { $eq: ['$lastSenderRole', 'user'] }] }] }, 1, 0] } },
    } }]);
    return result ? { open: result.open, resolved: result.resolved, waiting: result.waiting, unread: result.unread, attention: result.attention } : { open: 0, resolved: 0, waiting: 0, unread: 0, attention: 0 };
  }
  async function adminHistory(threadId, before) {
    const thread = await findAdminThread(threadId);
    if (!thread) throw new HttpError(404, 'Support conversation not found.');
    return history(thread, 'admin', before);
  }
  return {
    async summary(userId) { return { thread: supportThreadView(await findCustomerThread(userId), 'user') }; },
    async customerHistory(userId, before) { return history(await findCustomerThread(userId), 'user', before); },
    async customerSend(user, input) { return send(await ensureThread(user._id), user, input); },
    async customerRead(userId, through) { return markRead(await findCustomerThread(userId), 'user', through); },
    stats, adminHistory,
    async inbox({ status, search, page, selected }) {
      const filter = { sequence: { $gt: 0 } };
      if (status === 'waiting') Object.assign(filter, { status: 'open', lastSenderRole: 'user' });
      if (status === 'unread') filter.$expr = { $gt: ['$userMessageCount', '$adminReadUserCount'] };
      if (status === 'resolved') filter.status = 'resolved';
      if (search) filter.userId = { $in: await User.find({ role: 'user', $or: [{ name: new RegExp(escaped(search), 'i') }, { email: new RegExp(escaped(search), 'i') }] }).distinct('_id') };
      const [threads, total, summary, conversation] = await Promise.all([
        Thread.find(filter).sort({ lastMessageAt: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize).populate('userId', customerFields).lean(),
        Thread.countDocuments(filter), stats(), selected ? adminHistory(selected) : null,
      ]);
      return { threads: threads.map(t => supportThreadView(t, 'admin')), total, page, pages: Math.max(1, Math.ceil(total / pageSize)), summary, conversation };
    },
    async adminSend(threadId, user, input) {
      const thread = await findAdminThread(threadId); if (!thread) throw new HttpError(404, 'Support conversation not found.');
      return send(thread, user, input);
    },
    async adminRead(threadId, through) {
      const thread = await findAdminThread(threadId); if (!thread) throw new HttpError(404, 'Support conversation not found.');
      return markRead(thread, 'admin', through);
    },
    async setStatus(threadId, { status, expectedSequence }) {
      const thread = await Thread.findOneAndUpdate({ _id: threadId, sequence: expectedSequence }, { $set: { status } }, { new: true }).populate('userId', customerFields).lean();
      if (!thread) {
        if (!await Thread.exists({ _id: threadId })) throw new HttpError(404, 'Support conversation not found.');
        throw new HttpError(409, 'A new message arrived. Review it before changing the conversation status.');
      }
      return { thread: supportThreadView(thread, 'admin') };
    },
  };
}
