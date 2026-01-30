// src/lib/auth.ts
// Server-side auth helpers (NextAuth v4 compatible).
// Centralizes session access so imports stay consistent across the app.

import { getServerSession, type Session } from "next-auth";
import authOptions from "@/auth.config";

export { authOptions };

/**
 * Returns the current authenticated session (or null).
 * Intended for server components, route handlers, and server actions.
 */
export async function auth(): Promise<Session | null> {
  return getServerSession(authOptions);
}