// src/lib/db.ts
import mongoose, { Mongoose } from "mongoose";

// Explicitly type as string for TypeScript, but still runtime-check below
const MONGODB_URI: string = process.env.MONGODB_URI as string;

if (!MONGODB_URI) {
  throw new Error(
    "❌ Missing MONGODB_URI — please define it in your .env.local file."
  );
}

// Shape of our cached connection
interface MongooseCache {
  conn: Mongoose | null;
  promise: Promise<Mongoose> | null;
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
    cached.promise = mongoose
      .connect(MONGODB_URI, {
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