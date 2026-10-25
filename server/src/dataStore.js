import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { Comparison, Simulation, User } from './models.js';

let mongoConnectPromise;

const localFile = process.env.LOCAL_DATA_FILE || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/fincoach-local.json');
const localSecretFile = path.join(path.dirname(localFile), '.jwt-secret');
let writes = Promise.resolve();

export const hasMongoConnection = () => mongoose.connection.readyState === 1;

export async function connectMongo() {
  if (hasMongoConnection()) return mongoose.connection;
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required for hosted accounts.');
  if (!mongoConnectPromise) {
    mongoConnectPromise = mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 })
      .then(() => mongoose.connection)
      .catch((error) => { mongoConnectPromise = undefined; throw error; });
  }
  return mongoConnectPromise;
}

async function readLocal() {
  try {
    const parsed = JSON.parse(await readFile(localFile, 'utf8'));
    return { users: parsed.users || [], simulations: parsed.simulations || [], comparisons: parsed.comparisons || [] };
  } catch (error) {
    if (error.code === 'ENOENT') return { users: [], simulations: [], comparisons: [] };
    throw error;
  }
}

function changeLocal(mutator) {
  const operation = writes.then(async () => {
    const data = await readLocal();
    const result = mutator(data);
    await mkdir(path.dirname(localFile), { recursive: true });
    const temporaryFile = `${localFile}.tmp`;
    await writeFile(temporaryFile, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
    await rename(temporaryFile, localFile);
    return result;
  });
  writes = operation.catch(() => {});
  return operation;
}

const localId = () => randomBytes(12).toString('hex');
const copy = (value) => value == null ? value : structuredClone(value);

export async function findUserByEmail(email, includePassword = false) {
  if (hasMongoConnection()) {
    const query = User.findOne({ email });
    if (includePassword) query.select('+passwordHash');
    return query;
  }
  const user = (await readLocal()).users.find((item) => item.email === email);
  if (!user) return null;
  const result = copy(user);
  if (!includePassword) delete result.passwordHash;
  return result;
}

export async function createUser(input) {
  if (hasMongoConnection()) return User.create(input);
  return changeLocal((data) => {
    if (data.users.some((item) => item.email === input.email)) return null;
    const now = new Date().toISOString();
    const user = { _id: localId(), ...input, createdAt: now, updatedAt: now };
    data.users.push(user);
    return copy(user);
  });
}

export async function findUserById(id, includePassword = false) {
  if (hasMongoConnection()) { const query = User.findById(id); if (includePassword) query.select('+passwordHash'); return query; }
  return copy((await readLocal()).users.find((item) => item._id === String(id)) || null);
}

export async function updateUserProfile(id, { name, email }) {
  if (hasMongoConnection()) return User.findByIdAndUpdate(id, { $set: { name, email } }, { new: true, runValidators: true });
  return changeLocal((data) => {
    if (data.users.some((item) => item._id !== String(id) && item.email === email)) return null;
    const user = data.users.find((item) => item._id === String(id)); if (!user) return null;
    user.name = name; user.email = email; user.updatedAt = new Date().toISOString(); return copy(user);
  });
}

export async function updateUserPassword(id, passwordHash) {
  if (hasMongoConnection()) return User.findByIdAndUpdate(id, { $set: { passwordHash } }, { new: true });
  return changeLocal((data) => {
    const user = data.users.find((item) => item._id === String(id)); if (!user) return null;
    user.passwordHash = passwordHash; user.updatedAt = new Date().toISOString(); return copy(user);
  });
}

export async function deleteUserAndOwnedData(id) {
  if (hasMongoConnection()) {
    await Promise.all([Simulation.deleteMany({ userId: id }), Comparison.deleteMany({ userId: id })]);
    return User.findByIdAndDelete(id);
  }
  return changeLocal((data) => {
    const index = data.users.findIndex((item) => item._id === String(id));
    if (index < 0) return null;
    const [user] = data.users.splice(index, 1);
    data.simulations = data.simulations.filter((item) => item.userId !== String(id));
    data.comparisons = data.comparisons.filter((item) => item.userId !== String(id));
    return copy(user);
  });
}

export async function listScenarios(userId) {
  if (hasMongoConnection()) return Simulation.find({ userId }).sort({ updatedAt: -1 }).limit(100).lean();
  return (await readLocal()).simulations.filter((item) => item.userId === String(userId)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 100);
}

export async function createScenario(input) {
  if (hasMongoConnection()) return Simulation.create(input);
  return changeLocal((data) => {
    const now = new Date().toISOString();
    const record = { _id: localId(), schemaVersion: 1, ...input, userId: String(input.userId), createdAt: now, updatedAt: now };
    data.simulations.push(record);
    return copy(record);
  });
}

export async function findScenario(id, userId) {
  if (hasMongoConnection()) return Simulation.findOne({ _id: id, userId });
  return copy((await readLocal()).simulations.find((item) => item._id === String(id) && item.userId === String(userId)) || null);
}

export async function renameScenario(id, userId, title) {
  if (hasMongoConnection()) return Simulation.findOneAndUpdate({ _id: id, userId }, { $set: { title } }, { new: true, runValidators: true });
  return changeLocal((data) => {
    const record = data.simulations.find((item) => item._id === String(id) && item.userId === String(userId));
    if (!record) return null;
    record.title = title;
    record.updatedAt = new Date().toISOString();
    return copy(record);
  });
}

export async function deleteScenario(id, userId) {
  if (hasMongoConnection()) return Simulation.findOneAndDelete({ _id: id, userId });
  return changeLocal((data) => {
    const index = data.simulations.findIndex((item) => item._id === String(id) && item.userId === String(userId));
    return index < 0 ? null : copy(data.simulations.splice(index, 1)[0]);
  });
}

export async function listComparisons(userId) {
  if (hasMongoConnection()) return Comparison.find({ userId }).sort({ createdAt: -1 }).limit(100).lean();
  return (await readLocal()).comparisons.filter((item) => item.userId === String(userId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100);
}

export async function createComparison(input) {
  if (hasMongoConnection()) return Comparison.create(input);
  return changeLocal((data) => {
    const now = new Date().toISOString();
    const record = { _id: localId(), schemaVersion: 1, ...input, userId: String(input.userId), createdAt: now, updatedAt: now };
    data.comparisons.push(record);
    return copy(record);
  });
}

export async function renameComparison(id, userId, title) {
  if (hasMongoConnection()) return Comparison.findOneAndUpdate({ _id: id, userId }, { $set: { title } }, { new: true, runValidators: true });
  return changeLocal((data) => {
    const record = data.comparisons.find((item) => item._id === String(id) && item.userId === String(userId));
    if (!record) return null;
    record.title = title; record.updatedAt = new Date().toISOString(); return copy(record);
  });
}

export async function deleteComparison(id, userId) {
  if (hasMongoConnection()) return Comparison.findOneAndDelete({ _id: id, userId });
  return changeLocal((data) => {
    const index = data.comparisons.findIndex((item) => item._id === String(id) && item.userId === String(userId));
    return index < 0 ? null : copy(data.comparisons.splice(index, 1)[0]);
  });
}

export async function loadOrCreateLocalJwtSecret() {
  try {
    const existing = (await readFile(localSecretFile, 'utf8')).trim();
    if (existing.length >= 32) return existing;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await mkdir(path.dirname(localSecretFile), { recursive: true });
  const secret = randomBytes(32).toString('base64url');
  try {
    await writeFile(localSecretFile, secret, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    return secret;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    return (await readFile(localSecretFile, 'utf8')).trim();
  }
}
