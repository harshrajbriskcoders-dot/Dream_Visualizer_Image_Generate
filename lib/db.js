import { MongoClient } from 'mongodb';
import { AppError } from './errors.js';

// Reuse one connection across serverless invocations.
const cache = globalThis.__dvMongo || (globalThis.__dvMongo = { promise: null, indexes: null });

export async function getDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new AppError('MONGODB_URI is not set', 500, 'CONFIG');

  if (!cache.promise) {
    const client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 });
    cache.promise = client.connect().catch((err) => {
      cache.promise = null;
      throw err;
    });
  }
  const client = await cache.promise;
  return client.db(process.env.MONGODB_DB || 'dream_visualizer');
}

export async function getSubmissions() {
  const col = (await getDb()).collection('submissions');
  if (!cache.indexes) {
    cache.indexes = col
      .createIndexes([
        { key: { status: 1, createdAt: -1 } },
        { key: { email: 1 } },
        { key: { ipHash: 1, createdAt: -1 } },
        { key: { createdAt: -1 } },
      ])
      .catch((err) => {
        cache.indexes = null;
        console.warn('[db] index creation failed:', err.message);
      });
  }
  await cache.indexes;
  return col;
}
