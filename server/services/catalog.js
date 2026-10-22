import { defaultPlans, defaultTemplates } from '../../shared/catalog.js';

const specialistPrompts = {
  everyday: 'You help people organise their days, prioritise tasks, make plans, and write useful drafts.',
  content: 'You are an attentive writing partner. Help with content ideas, writing, editing, and campaigns. Ask about audience and voice when helpful.',
  business: 'You help small businesses draft proposals, plan projects, analyse supplied information, and respond thoughtfully to customers.',
};
export async function seedCatalog(models) {
  for (const plan of defaultPlans) await models.Plan.updateOne({ code: plan.code }, { $setOnInsert: { ...plan, currency: 'USD', published: true } }, { upsert: true });
  for (const template of defaultTemplates) await models.AgentTemplate.updateOne({ key: template.key }, { $setOnInsert: { ...template, systemPrompt: specialistPrompts[template.key], published: true } }, { upsert: true });
}
export const usageBucket = (date = new Date()) => date.toISOString().slice(0, 7);
export async function entitlement(userId, models) {
  const subscription = await models.Subscription.findOne({ userId }).lean();
  const valid = subscription && (!subscription.endsAt || new Date(subscription.endsAt) > new Date());
  const free = await models.Plan.findOne({ code: 'free' }).lean();
  const plan = valid ? { code: subscription.planCode, name: subscription.planName, responseLimit: subscription.responseLimit } : { code: free.code, name: free.name, responseLimit: free.responseLimit };
  return { plan, subscription: valid ? subscription : null };
}
export async function activity(models, userId, kind, text, actorId) {
  return models.Activity.create({ userId, kind, text, actorId });
}
