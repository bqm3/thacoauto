import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';
import { attachDatabasePool } from '@vercel/functions';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_FILE = path.join(__dirname, 'config.json');
const CONFIG_ID = 'app-config';

const mongoUri = process.env.MONGODB_URI;
const mongoClient = mongoUri
  ? new MongoClient(mongoUri, {
      maxPoolSize: 10,
      minPoolSize: 0,
      maxIdleTimeMS: 30_000,
      serverSelectionTimeoutMS: 10_000
    })
  : null;

if (mongoClient) attachDatabasePool(mongoClient);

let collectionsPromise;

async function initializeCollections() {
  if (!mongoClient) {
    throw new Error('Thiếu biến môi trường MONGODB_URI');
  }

  await mongoClient.connect();
  const database = mongoClient.db(process.env.MONGODB_DATABASE || 'thaco_auto');
  const configs = database.collection('configs');
  const sessions = database.collection('sessions');

  const seed = JSON.parse(await fs.readFile(SEED_FILE, 'utf8'));
  seed.screens = Array.isArray(seed.screens) ? seed.screens : [];

  await Promise.all([
    configs.updateOne(
      { _id: CONFIG_ID },
      { $setOnInsert: { ...seed, createdAt: new Date() } },
      { upsert: true }
    ),
    sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  ]);

  return { configs, sessions };
}

function getCollections() {
  if (!collectionsPromise) {
    collectionsPromise = initializeCollections().catch(error => {
      collectionsPromise = undefined;
      throw error;
    });
  }
  return collectionsPromise;
}

export async function readConfig() {
  const { configs } = await getCollections();
  const config = await configs.findOne({ _id: CONFIG_ID });
  if (!config) throw new Error('Không tìm thấy cấu hình trong MongoDB');

  const { _id, createdAt, updatedAt, ...data } = config;
  data.screens = Array.isArray(data.screens) ? data.screens : [];
  return data;
}

export async function writeConfig(data) {
  const { configs } = await getCollections();
  await configs.replaceOne(
    { _id: CONFIG_ID },
    { _id: CONFIG_ID, ...data, updatedAt: new Date() },
    { upsert: true }
  );
}

export async function createSession(token, expiresAt) {
  const { sessions } = await getCollections();
  await sessions.insertOne({ _id: token, expiresAt: new Date(expiresAt) });
}

export async function refreshSession(token, expiresAt) {
  if (!token) return false;
  const { sessions } = await getCollections();
  const result = await sessions.updateOne(
    { _id: token, expiresAt: { $gt: new Date() } },
    { $set: { expiresAt: new Date(expiresAt) } }
  );
  return result.matchedCount === 1;
}

export async function deleteSession(token) {
  if (!token) return;
  const { sessions } = await getCollections();
  await sessions.deleteOne({ _id: token });
}
