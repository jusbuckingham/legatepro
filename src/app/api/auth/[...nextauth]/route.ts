// src/app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth/next";
import authOptions from "@/auth.config";

// Required for Credentials provider + adapters
export const runtime = "nodejs";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };