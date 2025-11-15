// src/lib/db.ts
import mongoose, { Mongoose } from "mongoose";

// Shape of our cached connection
interface MongooseCache {
  conn: Mongoose | null;
  promise: Promise<Mongoose> | null;
}

function getMongoUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("❌ Missing MONGODB_URI — please define it in your .env.local file.");
  }
  return uri;
}

/**
 * Extend the global type to support a cached Mongoose connection so that
 * the Next.js App Router doesn't create multiple connections on hot reload.
 */
declare global {
  var _mongooseCache: MongooseCache | undefined;
}

// Helper to get a strongly-typed global object
const globalForMongoose = global as typeof globalThis & {
  _mongooseCache?: MongooseCache;
};

const cached: MongooseCache =
  globalForMongoose._mongooseCache ??
  (globalForMongoose._mongooseCache = {
    conn: null,
    promise: null,
  });

export async function connectToDatabase(): Promise<Mongoose> {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const uri = getMongoUri();
    cached.promise = mongoose
      .connect(uri, {
        dbName: "legatepro",
        autoIndex: true,
      })
      .then((mongooseInstance) => mongooseInstance)
      .catch((err) => {
        console.error("❌ MongoDB connection error:", err);
        throw err;
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}