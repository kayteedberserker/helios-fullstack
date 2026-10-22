import 'dotenv/config';
import mongoose from 'mongoose';
import { assertDatabaseTopology, formatDatabaseError } from '../lib/database.js';

let phase = 'reading MONGODB_URI';
try {
  const uri = (process.env.MONGODB_URI || '').trim();
  if (!uri) throw Object.assign(new Error(), { code: 'HELIOS_MONGO_MISSING' });
  if (!/^mongodb(?:\+srv)?:\/\//.test(uri)) throw Object.assign(new Error(), { code: 'HELIOS_BAD_URI' });
  if (/[<>]/.test(uri)) throw Object.assign(new Error(), { code: 'HELIOS_URI_PLACEHOLDER' });
  console.log('MONGODB_URI is set. Checking the database without printing credentials…');
  phase = 'connecting to MongoDB';
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000 });
  console.log('Connection and authentication passed.');
  phase = 'checking the database topology';
  assertDatabaseTopology(await mongoose.connection.db.admin().command({ hello: 1 }));
  console.log('Replica-set / sharded-cluster check passed.');
  phase = 'checking read access to the Helios database';
  await mongoose.connection.db.collection('plans').findOne({}, { projection: { _id: 1 } });
  console.log('Database read access passed. No data was written.');
  console.log('Run npm run dev next. Startup also checks index creation and catalogue writes.');
} catch (error) {
  console.error(formatDatabaseError(error, phase));
  process.exitCode = 1;
} finally {
  await mongoose.disconnect().catch(() => {});
}
