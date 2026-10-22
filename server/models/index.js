import mongoose from 'mongoose';

const { Schema } = mongoose;
const options = { timestamps: true, versionKey: false };
const ref = name => ({ type: Schema.Types.ObjectId, ref: name, required: true });
const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

const userSchema = new Schema({
  name: { type: String, required: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  timezone: { type: String, default: 'UTC' },
  sessionVersion: { type: Number, default: 0 },
}, options);

const planSchema = new Schema({
  code: { type: String, required: true, unique: true }, name: { type: String, required: true },
  description: String, monthlyPrice: { type: Number, required: true, min: 0 }, yearlyPrice: { type: Number, required: true, min: 0 },
  responseLimit: { type: Number, required: true, min: 1 }, features: [String], featured: Boolean,
  currency: { type: String, enum: ['USD'], default: 'USD' }, published: { type: Boolean, default: true },
}, options);

const templateSchema = new Schema({
  key: { type: String, required: true, unique: true }, name: { type: String, required: true },
  category: String, description: String, icon: String, color: String, features: [String], prompts: [String],
  systemPrompt: { type: String, required: true, select: false }, published: { type: Boolean, default: true },
}, options);

const instanceSchema = new Schema({
  userId: { ...ref('User'), unique: true }, templateId: ref('AgentTemplate'), name: { type: String, required: true },
  instructions: { type: String, default: '', maxlength: 3000 }, tone: { type: String, enum: ['balanced', 'friendly', 'professional'], default: 'balanced' },
  status: { type: String, enum: ['active', 'paused'], default: 'active' },
  leaseUntil: { type: Date, default: null, select: false }, leaseToken: { type: String, select: false },
}, options);

const subscriptionSchema = new Schema({
  userId: { ...ref('User'), unique: true }, planId: ref('Plan'), planCode: String, planName: String,
  responseLimit: Number, period: { type: String, enum: ['monthly', 'yearly'] },
  startsAt: { type: Date, default: Date.now }, endsAt: { type: Date, default: null }, lastPaymentId: { type: Schema.Types.ObjectId, ref: 'Payment' },
}, options);

const paymentSchema = new Schema({
  userId: ref('User'), planId: ref('Plan'), planCode: String, planName: String, responseLimit: Number,
  period: { type: String, enum: ['monthly', 'yearly'], required: true },
  amount: { type: Number, required: true }, currency: { type: String, enum: ['USD'], required: true },
  email: { type: String, required: true, select: false }, reference: { type: String, unique: true, required: true },
  status: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending' },
  provider: { type: String, default: 'paystack' }, providerId: String, paidAt: Date, appliedAt: Date,
}, options);
paymentSchema.index({ userId: 1, createdAt: -1 });

const conversationSchema = new Schema({ userId: ref('User'), agentId: { ...ref('AgentInstance'), unique: true } }, options);
const messageSchema = new Schema({
  conversationId: ref('Conversation'), userId: ref('User'), role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true, maxlength: 12000 },
}, options);
messageSchema.index({ conversationId: 1, createdAt: -1 });

const supportThreadSchema = new Schema({
  userId: { ...ref('User'), unique: true },
  status: { type: String, enum: ['open', 'resolved'], default: 'open' },
  sequence: { type: Number, default: 0, min: 0 },
  userMessageCount: { type: Number, default: 0, min: 0 }, adminMessageCount: { type: Number, default: 0, min: 0 },
  userReadAdminCount: { type: Number, default: 0, min: 0 }, adminReadUserCount: { type: Number, default: 0, min: 0 },
  lastSenderRole: { type: String, enum: ['user', 'admin'] }, lastMessageAt: Date,
  lastMessageText: { type: String, maxlength: 160, default: '' },
}, options);
supportThreadSchema.index({ lastMessageAt: -1, _id: -1 });
supportThreadSchema.index({ status: 1, lastSenderRole: 1, lastMessageAt: -1 });
const supportMessageSchema = new Schema({
  threadId: ref('SupportThread'), senderId: ref('User'),
  senderRole: { type: String, enum: ['user', 'admin'], required: true }, senderName: { type: String, maxlength: 80, required: true },
  sequence: { type: Number, min: 1, required: true }, senderCount: { type: Number, min: 1, required: true },
  content: { type: String, trim: true, minlength: 1, maxlength: 4000, required: true }, clientId: { type: String, required: true },
}, options);
supportMessageSchema.index({ threadId: 1, sequence: -1 }, { unique: true });
supportMessageSchema.index({ threadId: 1, clientId: 1 }, { unique: true });

const usageSchema = new Schema({ userId: ref('User'), bucket: { type: String, required: true }, responses: { type: Number, default: 0 } }, options);
usageSchema.index({ userId: 1, bucket: 1 }, { unique: true });
const activitySchema = new Schema({ userId: ref('User'), actorId: { type: Schema.Types.ObjectId, ref: 'User' }, kind: String, text: String }, options);
activitySchema.index({ userId: 1, createdAt: -1 });

const inviteSchema = new Schema({ email: { type: String, required: true }, tokenHash: { type: String, required: true, unique: true }, invitedBy: { type: Schema.Types.ObjectId, ref: 'User' }, expiresAt: { type: Date, required: true }, usedAt: Date }, options);
inviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const resetSchema = new Schema({ userId: { ...ref('User'), unique: true }, tokenHash: { type: String, required: true, unique: true }, expiresAt: { type: Date, required: true } }, options);
resetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const models = {
  User: model('User', userSchema), Plan: model('Plan', planSchema), AgentTemplate: model('AgentTemplate', templateSchema),
  AgentInstance: model('AgentInstance', instanceSchema), Subscription: model('Subscription', subscriptionSchema),
  Payment: model('Payment', paymentSchema), Conversation: model('Conversation', conversationSchema), Message: model('Message', messageSchema),
  SupportThread: model('SupportThread', supportThreadSchema), SupportMessage: model('SupportMessage', supportMessageSchema),
  Usage: model('Usage', usageSchema), Activity: model('Activity', activitySchema), AdminInvite: model('AdminInvite', inviteSchema), PasswordReset: model('PasswordReset', resetSchema),
};
