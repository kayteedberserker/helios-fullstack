import 'dotenv/config';
import mongoose from 'mongoose';
import { models } from '../models/index.js';
import { seedCatalog } from '../services/catalog.js';
try {
  if (!process.env.MONGODB_URI) throw new Error('Fill MONGODB_URI in .env first.');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  await Promise.all(Object.values(models).map(model => model.init()));
  await seedCatalog(models);
  console.log('Helios plans and agent specialities are ready. Existing edits were preserved.');
} catch { console.error('Seed failed. Check the MongoDB connection and permissions.'); process.exitCode = 1; }
finally { await mongoose.disconnect(); }
