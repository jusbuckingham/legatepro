// src/app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth";
import { authOptions } from "@/auth.config";

// NextAuth relies on Node.js APIs; keep this route on the Node runtime.
export const runtime = "nodejs";

// Auth routes are inherently dynamic.
export const dynamic = "force-dynamic";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };