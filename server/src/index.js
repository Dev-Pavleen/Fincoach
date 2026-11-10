import 'dotenv/config';
import mongoose from 'mongoose';
import { createApp } from './app.js';
import { loadOrCreateLocalJwtSecret } from './dataStore.js';

const port = Number(process.env.PORT || 4000);
if (!process.env.JWT_SECRET && process.env.NODE_ENV !== 'production') {
  process.env.JWT_SECRET = await loadOrCreateLocalJwtSecret();
  console.warn('Using a persistent local session secret. Set JWT_SECRET explicitly for deployment.');
}
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) { console.error('Production requires JWT_SECRET to be a random value at least 32 characters long.'); process.exit(1); }
if (process.env.NODE_ENV === 'production' && !process.env.MONGODB_URI) {
  console.error('Production requires MONGODB_URI. Local JSON storage is available only for development.');
  process.exit(1);
}
if (process.env.MONGODB_URI) {
  try { await mongoose.connect(process.env.MONGODB_URI); console.log('Connected to MongoDB.'); }
  catch (error) { console.error('Could not connect to MongoDB:', error.message); process.exit(1); }
} else {
  console.warn('MONGODB_URI is not set; accounts and saved scenarios will use the local JSON data store.');
}

const app = createApp();
const server = app.listen(port, () => console.log(`FinCoach API listening on http://localhost:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { server.close(); await mongoose.disconnect(); process.exit(0); });
