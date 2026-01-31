// src/app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth";
import authOptions from "@/auth.config";

// NextAuth requires the Node.js runtime (cookies, adapters, credentials)
// Required for Credentials provider + adapters
export const runtime = "nodejs";

export const dynamic = "force-dynamic";

// Single NextAuth handler wired to both GET and POST per App Router convention
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };