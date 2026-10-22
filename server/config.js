import 'dotenv/config';

export function readConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const clientUrl = (env.CLIENT_URL || 'http://localhost:4173').replace(/\/$/, '');
  const parsed = new URL(clientUrl);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.pathname !== '/') throw new Error('CLIENT_URL must be a website origin, e.g. https://helios.example.com.');
  if (production && parsed.protocol !== 'https:') throw new Error('Production CLIENT_URL must use HTTPS.');
  const sameSite = env.COOKIE_SAME_SITE || 'lax';
  if (!['lax', 'strict', 'none'].includes(sameSite) || (sameSite === 'none' && !production)) throw new Error('COOKIE_SAME_SITE must be lax/strict, or none with production HTTPS.');
  return {
    production, clientUrl, port: Number(env.PORT || env.API_PORT || 4000), mongoUri: env.MONGODB_URI || '',
    jwtSecret: env.JWT_SECRET || '', cookieName: 'helios_session', sameSite,
    trustProxy: Number(env.TRUST_PROXY || 0), paystackSecret: env.PAYSTACK_SECRET_KEY || '',
    aiKey: env.AI_API_KEY || '', aiBaseUrl: (env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
    aiModel: env.AI_MODEL || 'gpt-4.1-mini',
    smtp: { host: env.SMTP_HOST || '', port: Number(env.SMTP_PORT || 587), secure: env.SMTP_SECURE === 'true', user: env.SMTP_USER || '', pass: env.SMTP_PASSWORD || '', from: env.SMTP_FROM || '' },
  };
}

export function assertServerConfig(config) {
  if (!config.mongoUri) throw new Error('Fill MONGODB_URI in .env before starting the API.');
  if (config.jwtSecret.length < 32 || /^(change|your|replace|example)/i.test(config.jwtSecret)) throw new Error('Set JWT_SECRET to a random secret of at least 32 characters in .env.');
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error('API_PORT must be a valid port.');
  if (!Number.isInteger(config.trustProxy) || config.trustProxy < 0 || config.trustProxy > 5) throw new Error('TRUST_PROXY must be the number of trusted reverse proxies (0–5).');
  const aiUrl = new URL(config.aiBaseUrl);
  if (aiUrl.protocol !== 'https:' && !(aiUrl.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(aiUrl.hostname))) throw new Error('AI_BASE_URL must use HTTPS, except for a local AI service.');
}
