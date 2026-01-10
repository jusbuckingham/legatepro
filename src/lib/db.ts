// src/lib/db.ts
import mongoose, { Mongoose } from "mongoose";
import { assertEnv } from "@/lib/assertEnv";

// Shape of our cached connection
interface MongooseCache {
  conn: Mongoose | null;
  promise: Promise<Mongoose> | null;
}

function getMongoUri(): string {
  try {
    assertEnv([
      {
        key: "MONGODB_URI",
        hint: "Mongo connection string used by connectToDatabase() (set in .env.local and Vercel env vars)",
      },
    ]);
  } catch {
    // Preserve the existing, friendly local-dev message while still failing fast.
    throw new Error("❌ Missing MONGODB_URI — please define it in your .env.local file.");
  }

  return process.env.MONGODB_URI as string;
}

/**
 * Extend the global type to support a cached Mongoose connection so that
 * the Next.js App Router doesn't create multiple connections on hot reload.
 */
declare global {
  var _mongooseCache: MongooseCache | undefined;
}

// Helper to get a strongly-typed global object
const globalForMongoose = globalThis as typeof globalThis & {
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

// Shared serializer for mongoose docs / lean objects.
// - Converts _id to string `id`
// - Removes _id and __v
// - Preserves other fields
export type MongoSerialized<T> = Omit<T, "_id" | "__v"> & { id: string };

export function serializeMongoDoc(input: unknown): Record<string, unknown> {
  // Mongoose `transform` typically provides a plain object, but we keep this defensive
  // so it also works with mongoose documents.
  const maybeDoc = input as { toObject?: () => unknown } | null | undefined;
  const plain =
    maybeDoc && typeof maybeDoc === "object" && typeof maybeDoc.toObject === "function"
      ? (maybeDoc.toObject() as unknown)
      : input;

  const obj: Record<string, unknown> =
    plain && typeof plain === "object" ? (plain as Record<string, unknown>) : {};

  const rawId = obj._id ?? obj.id;
  const id =
    typeof rawId === "string"
      ? rawId
      : rawId && typeof rawId === "object" && "toString" in rawId
        ? String((rawId as { toString: () => string }).toString())
        : "";

  const out: Record<string, unknown> = { ...obj };

  if (id) out.id = id;
  delete out._id;
  delete out.__v;

  return out;
}