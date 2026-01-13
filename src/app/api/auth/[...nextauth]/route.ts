// src/app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth/next";

import { authOptions as baseAuthOptions } from "@/auth.config";

// Re-export for other server routes (e.g. getServerSession).
export const authOptions = baseAuthOptions;

// NextAuth relies on Node.js APIs; keep this route on the Node runtime.
export const runtime = "nodejs";

// Auth routes are inherently dynamic.
export const dynamic = "force-dynamic";

/**
 * App Router route handlers MUST export the NextAuth handler directly.
 * Avoid wrapping it in custom GET/POST functions that pass a NextRequest,
 * because `next-auth` expects the Next.js Route Handler signature.
 */
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };