// src/app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth";

import { authOptions as baseAuthOptions } from "@/auth.config";

// Re-export for other server routes (e.g. getServerSession).
export const authOptions = baseAuthOptions;

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };