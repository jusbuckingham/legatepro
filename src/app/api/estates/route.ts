// Minimal auth helper stub for now so that `import { auth } from "@/lib/auth"` works.
// TODO: Replace this with your real authentication integration (e.g. NextAuth).

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
 * This is just here to satisfy TypeScript while you wire up real auth.
 * It always returns null, so any route using it will treat the user as unauthenticated.
 */
export async function auth(): Promise<Session> {
  return null;
}