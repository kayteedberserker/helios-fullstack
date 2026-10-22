import { Router } from 'express';
import mongoose from 'mongoose';
import crypto from 'node:crypto';
import { z } from 'zod';
import { objectId, HttpError, requireUser } from '../lib/security.js';
import { activity, entitlement, usageBucket } from '../services/catalog.js';

const agentSettings = { name: z.string().trim().min(2).max(60), instructions: z.string().max(3000), tone: z.enum(['balanced', 'friendly', 'professional']), templateId: objectId };
export function agentRoutes({ models, config, auth, ai, chatLimit }) {
  const router = Router();
  router.use(auth, requireUser);
  router.get('/', async (req, res) => {
    const agent = await models.AgentInstance.findOne({ userId: req.user._id }).populate('templateId').lean();
    const conversation = agent && await models.Conversation.findOne({ userId: req.user._id, agentId: agent._id });
    const messages = conversation ? await models.Message.find({ conversationId: conversation._id, userId: req.user._id }).sort({ createdAt: -1, _id: -1 }).limit(100).lean() : [];
    res.json({ agent, messages: messages.reverse(), aiReady: !!config.aiKey });
  });
  router.post('/', async (req, res) => {
    const data = z.object({ ...agentSettings, instructions: agentSettings.instructions.default(''), tone: agentSettings.tone.default('balanced') }).strict().parse(req.body);
    const template = await models.AgentTemplate.findOne({ _id: data.templateId, published: true });
    if (!template) throw new HttpError(404, 'This agent is not available.');
    if (await models.AgentInstance.exists({ userId: req.user._id })) throw new HttpError(409, 'You already have an agent. You can change its speciality in settings.');
    const agent = await models.AgentInstance.create({ ...data, userId: req.user._id });
    await activity(models, req.user._id, 'agent', `${data.name} joined your workspace.`);
    res.status(201).json({ agent: await agent.populate('templateId') });
  });
  router.patch('/', async (req, res) => {
    const data = z.object({ ...agentSettings, status: z.enum(['active', 'paused']) }).partial().strict().parse(req.body);
    const current = await models.AgentInstance.findOne({ userId: req.user._id });
    if (!current) throw new HttpError(404, 'Create an agent first.');
    if (data.templateId && String(current.templateId) !== data.templateId && !await models.AgentTemplate.exists({ _id: data.templateId, published: true })) throw new HttpError(404, 'This speciality is not available.');
    const agent = await models.AgentInstance.findOneAndUpdate({ userId: req.user._id, $or: [{ leaseUntil: null }, { leaseUntil: { $lte: new Date() } }] }, { $set: data }, { new: true, runValidators: true }).populate('templateId');
    if (!agent) throw new HttpError(409, 'Your agent is unavailable or answering a message. Try again shortly.');
    await activity(models, req.user._id, 'agent', 'Your agent settings were updated.');
    res.json({ agent });
  });
  router.post('/messages', chatLimit, async (req, res) => {
    const { content } = z.object({ content: z.string().trim().min(1).max(4000) }).strict().parse(req.body);
    if (!config.aiKey) throw new HttpError(503, 'Your AI service is not configured yet. Contact the Helios team.');
    const userId = req.user._id;
    const leaseToken = crypto.randomUUID();
    const agent = await models.AgentInstance.findOneAndUpdate({ userId, status: 'active', $or: [{ leaseUntil: null }, { leaseUntil: { $lte: new Date() } }] }, { $set: { leaseToken, leaseUntil: new Date(Date.now() + 120000) } }, { new: true });
    if (!agent) throw new HttpError(409, 'Create or resume your agent, or wait for its current answer.');
    let reserved = false;
    const bucket = usageBucket();
    try {
      const access = await entitlement(userId, models);
      await models.Usage.updateOne({ userId, bucket }, { $setOnInsert: { responses: 0 } }, { upsert: true });
      const usage = await models.Usage.findOneAndUpdate({ userId, bucket, responses: { $lt: access.plan.responseLimit } }, { $inc: { responses: 1 } }, { new: true });
      if (!usage) throw new HttpError(402, 'You have used your monthly responses. Choose a larger plan or wait for next month.');
      reserved = true;
      const template = await models.AgentTemplate.findById(agent.templateId).select('+systemPrompt');
      if (!template) throw new HttpError(503, 'This agent speciality is unavailable.');
      const conversation = await models.Conversation.findOneAndUpdate({ userId, agentId: agent._id }, { $setOnInsert: { userId, agentId: agent._id } }, { upsert: true, new: true });
      const previous = await models.Message.find({ conversationId: conversation._id, userId }).sort({ createdAt: -1, _id: -1 }).limit(12).lean();
      // Keep provider context bounded, even with long conversations.
      const messages = previous.reverse().map(message => ({ role: message.role, content: message.content.slice(0, 2000) }));
      const answer = await ai({ template, agent, messages, prompt: content });
      const saved = await mongoose.connection.transaction(async session => {
        return models.Message.create([{ conversationId: conversation._id, userId, role: 'user', content }, { conversationId: conversation._id, userId, role: 'assistant', content: answer }], { session, ordered: true });
      });
      reserved = false; // The successful response keeps the reserved usage.
      await activity(models, userId, 'conversation', `You worked with ${agent.name}.`).catch(() => {});
      res.json({ messages: saved, responses: usage.responses });
    } finally {
      if (reserved) await models.Usage.updateOne({ userId, bucket, responses: { $gt: 0 } }, { $inc: { responses: -1 } });
      await models.AgentInstance.updateOne({ _id: agent._id, leaseToken }, { $set: { leaseUntil: null }, $unset: { leaseToken: 1 } });
    }
  });
  router.delete('/messages', async (req, res) => {
    const leaseToken = crypto.randomUUID();
    const agent = await models.AgentInstance.findOneAndUpdate({ userId: req.user._id, $or: [{ leaseUntil: null }, { leaseUntil: { $lte: new Date() } }] }, { $set: { leaseToken, leaseUntil: new Date(Date.now() + 30000) } }, { new: true });
    if (!agent) throw new HttpError(409, 'Wait for your agent to finish answering before clearing the conversation.');
    try {
      const conversation = await models.Conversation.findOne({ userId: req.user._id, agentId: agent._id });
      if (conversation) await models.Message.deleteMany({ conversationId: conversation._id, userId: req.user._id });
      res.json({ message: 'Conversation cleared. Your monthly usage stays the same.' });
    } finally { await models.AgentInstance.updateOne({ _id: agent._id, leaseToken }, { $set: { leaseUntil: null }, $unset: { leaseToken: 1 } }); }
  });
  return router;
}
