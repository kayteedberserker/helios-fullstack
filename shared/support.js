import { z } from 'zod';

export const supportMessageInput = z.object({ content: z.string().trim().min(1, 'Write a message first.').max(4000), clientId: z.uuid() }).strict();
export const supportReadInput = z.object({ through: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) }).strict();
export const supportStatusInput = z.object({ status: z.enum(['open', 'resolved']), expectedSequence: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) }).strict();
export const needsReply = thread => thread.status === 'open' && thread.lastSenderRole === 'user';
export const unreadCount = (thread, role) => Math.max(0, role === 'admin'
  ? thread.userMessageCount - thread.adminReadUserCount : thread.adminMessageCount - thread.userReadAdminCount);
export function supportThreadView(thread, role) {
  if (!thread) return null;
  const result = { _id: String(thread._id), status: thread.status, sequence: thread.sequence,
    unread: unreadCount(thread, role), needsReply: needsReply(thread), lastSenderRole: thread.lastSenderRole,
    lastMessageAt: thread.lastMessageAt, lastMessageText: thread.lastMessageText, updatedAt: thread.updatedAt };
  if (role === 'admin' && thread.userId?.name) result.customer = { _id: String(thread.userId._id), name: thread.userId.name, email: thread.userId.email, status: thread.userId.status };
  return result;
}
export function supportMessageView(message) {
  return { _id: String(message._id), sequence: message.sequence, senderCount: message.senderCount,
    senderRole: message.senderRole, senderName: message.senderRole === 'admin' ? 'Helios support' : message.senderName,
    content: message.content, clientId: message.clientId, createdAt: message.createdAt };
}
export function supportStats(threads) {
  return threads.reduce((stats, thread) => {
    if (!thread.sequence) return stats;
    stats[thread.status]++; if (needsReply(thread)) stats.waiting++; if (unreadCount(thread, 'admin')) stats.unread++;
    if (needsReply(thread) || unreadCount(thread, 'admin')) stats.attention++;
    return stats;
  }, { open: 0, resolved: 0, waiting: 0, unread: 0, attention: 0 });
}
