

// src/lib/auth.ts
// Minimal auth helper stub for now so that `import { auth } from "@/lib/auth"` works.
// TODO: Replace this with real authentication (NextAuth or other) when ready.

export type SessionUser = {
  id?: string;
  name?: string | null;
  email?: string | null;
};

export type Session = {
  user?: SessionUser;
} | null;

/**
 * Temporary auth() stub.
 *
 * This always returns null so routes will treat the user as unauthenticated.
 * It only exists so the project compiles while you wire up real auth.
 */
export async function auth(): Promise<Session> {
  return null;
}