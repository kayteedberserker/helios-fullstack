import { HttpError } from '../lib/security.js';

export function createAI(config) {
  return async ({ template, agent, messages, prompt }) => {
    if (!config.aiKey) throw new HttpError(503, 'Your AI service is not configured yet. Contact the Helios team.');
    const system = [
      `You are ${agent.name}, an AI assistant on Helios. ${template.systemPrompt}`,
      'Provide helpful, concise answers. You only have this chat and the information supplied here. You cannot send messages, connect to apps, browse the web, make bookings, or perform actions. Never claim to have done those things. Do not invent current facts. Ask for missing information when needed.',
      `Use a ${agent.tone} tone.`, agent.instructions ? `User preferences: ${agent.instructions}` : '',
    ].filter(Boolean).join('\n\n');
    let response;
    try {
      response = await fetch(`${config.aiBaseUrl}/chat/completions`, {
        method: 'POST', headers: { Authorization: `Bearer ${config.aiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: config.aiModel, messages: [{ role: 'system', content: system }, ...messages.map(({ role, content }) => ({ role, content })), { role: 'user', content: prompt }], max_tokens: 1200 }),
        signal: AbortSignal.timeout(45000),
      });
    } catch { throw new HttpError(502, 'Your agent could not connect. Please try again.'); }
    const result = await response.json().catch(() => null);
    const text = result?.choices?.[0]?.message?.content;
    if (!response.ok || typeof text !== 'string' || !text.trim()) throw new HttpError(502, 'Your agent could not answer. Please try again shortly.');
    return text.trim().slice(0, 12000);
  };
}
