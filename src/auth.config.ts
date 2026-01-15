// src/auth.config.ts

import type { NextAuthOptions, Session, User as NextAuthUser } from "next-auth";
import type { JWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";

/**
 * NOTE:
 * - This config is compatible with NextAuth/Auth.js v5 style route handlers.
 * - It still works fine for credentials auth in the App Router.
 */
export const authOptions: NextAuthOptions = {
  providers: [
    Credentials({
      name: "Email and Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || !credentials?.password) return null;

          const normalizedEmail = String(credentials.email).trim().toLowerCase();

          // Lazy-load server-only modules to avoid edge/bundling issues
          const [{ connectToDatabase }, { User }, bcrypt] = await Promise.all([
            import("@/lib/db"),
            import("@/models/User"),
            import("bcryptjs")
          ]);

          await connectToDatabase();

          const user = (await User.findOne({ email: normalizedEmail })
            .select("+password")
            .lean()) as
            | {
                _id: { toString(): string } | string;
                firstName?: string;
                lastName?: string;
                email: string;
                password?: string;
              }
            | null;

          if (!user || !user.password) return null;

          const isValid = await bcrypt.compare(String(credentials.password), user.password);
          if (!isValid) return null;

          const fullName =
            [user.firstName, user.lastName].filter(Boolean).join(" ") || undefined;

          return {
            id: typeof user._id === "string" ? user._id : user._id.toString(),
            name: fullName,
            email: user.email
          };
        } catch {
          // Do not leak auth errors to the client
          return null;
        }
      }
    })
  ],

  session: {
    strategy: "jwt"
  },

  pages: {
    signIn: "/login"
  },

  // Support both env var names (v4 and v5 conventions)
  secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,

  callbacks: {
    async jwt({ token, user }: { token: JWT; user?: NextAuthUser }) {
      // Attach user id on first sign in
      if (user && typeof user === "object" && "id" in user) {
        const u = user as unknown as { id?: string | number };
        if (u.id != null) (token as JWT & { id?: string }).id = String(u.id);
      }
      return token;
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      const t = token as JWT & { id?: string };
      if (session.user && t.id) {
        (session.user as unknown as { id?: string }).id = t.id;
      }
      return session;
    }
  }
};