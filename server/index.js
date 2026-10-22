import mongoose from 'mongoose';
import { readConfig, assertServerConfig } from './config.js';
import { models } from './models/index.js';
import { seedCatalog } from './services/catalog.js';
import { createApp } from './app.js';
import { assertDatabaseTopology, formatDatabaseError } from './lib/database.js';

let phase = 'configuration';
try {
  const config = readConfig();
  assertServerConfig(config);
  phase = 'connecting to MongoDB';
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
  phase = 'checking the database topology';
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  assertDatabaseTopology(hello);
  phase = 'creating database indexes';
  await Promise.all(Object.values(models).map(model => model.init()));
  phase = 'loading the starting catalogue';
  await seedCatalog(models);
  const server = createApp({ config }).listen(config.port, () => console.log(`Helios API listening on port ${config.port}.`));
  const shutdown = () => server.close(async () => { await mongoose.disconnect(); process.exit(0); });
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
} catch (error) {
  // Only configuration errors are printed directly; driver details stay private.
  console.error(phase === 'configuration' ? `Helios configuration: ${error.message}` : formatDatabaseError(error, phase));
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
}
