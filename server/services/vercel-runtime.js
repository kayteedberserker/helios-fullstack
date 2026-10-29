import mongoose from 'mongoose';
import { readConfig, assertServerConfig } from '../config.js';
import { models } from '../models/index.js';
import { seedCatalog } from './catalog.js';
import { createApp } from '../app.js';
import { assertDatabaseTopology, databaseDiagnosis } from '../lib/database.js';

export async function initializeApi() {
  let phase = 'configuration';
  try {
    const config = readConfig({ ...process.env, ...(process.env.VERCEL ? { NODE_ENV: 'production' } : {}) });
    assertServerConfig(config);
    phase = 'database';
    // One shared initialization per warm function, not a new pool per request.
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000, maxPoolSize: 5 });
    assertDatabaseTopology(await mongoose.connection.db.admin().command({ hello: 1 }));
    await Promise.all(Object.values(models).map(model => model.init()));
    await seedCatalog(models);
    console.info('[API] initialization complete');
    return createApp({ config, serveStatic: false });
  } catch (error) {
    const diagnosis = phase === 'configuration'
      ? { code: 'API_CONFIG', message: 'Check CLIENT_URL (your HTTPS site origin), MONGODB_URI, JWT_SECRET (at least 32 random characters), and the server environment settings.' }
      : databaseDiagnosis(error);
    await mongoose.disconnect().catch(() => {});
    const safeError = new Error('API initialization failed');
    safeError.publicCode = diagnosis.code; safeError.publicMessage = diagnosis.message;
    throw safeError;
  }
}
