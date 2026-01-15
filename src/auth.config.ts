// src/auth.config.ts

import type { NextAuthOptions, Session, User as NextAuthUser } from "next-auth";
import type { JWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";

const AUTH_SECRET = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
const AUTH_DEBUG = process.env.AUTH_DEBUG === "1";

function debugAuth(...args: unknown[]) {
  if (AUTH_DEBUG) console.log("[auth]", ...args);
}

if (!AUTH_SECRET && process.env.NODE_ENV === "production") {
  // This won't crash the app, but it makes the root cause obvious in logs.
  console.warn(
    "[auth] Missing NEXTAUTH_SECRET/AUTH_SECRET in production. Set NEXTAUTH_SECRET in Vercel env vars."
  );
}

/**
 * NextAuth v4-compatible config (works with App Router route handlers via NextAuth(authOptions)).
 *
 * Notes:
 * - We support both env var names (v4 and v5 conventions): NEXTAUTH_SECRET and AUTH_SECRET
 */
export const authOptions: NextAuthOptions = {
  // Support both env var names (v4 and v5 conventions)
  secret: AUTH_SECRET,

  pages: {
    signIn: "/login"
  },

  session: {
    strategy: "jwt"
  },

  providers: [
    Credentials({
      id: "credentials",
      name: "Email and Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || !credentials?.password) return null;
          debugAuth("authorize: start", { email: String(credentials.email) });

          const normalizedEmail = String(credentials.email).trim().toLowerCase();
          debugAuth("authorize: normalizedEmail", normalizedEmail);

          // Lazy-load server-only modules to avoid edge/bundling issues
          const [{ connectToDatabase }, { User }, bcrypt] = await Promise.all([
            import("@/lib/db"),
            import("@/models/User"),
            import("bcryptjs")
          ]);

          await connectToDatabase();
          debugAuth("authorize: db connected");

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
          debugAuth("authorize: user found", Boolean(user));

          if (!user || !user.password) {
            debugAuth("authorize: missing user or password hash");
            return null;
          }

          const isValid = await bcrypt.compare(
            String(credentials.password),
            user.password
          );
          debugAuth("authorize: password valid", isValid);
          if (!isValid) return null;

          const fullName =
            [user.firstName, user.lastName].filter(Boolean).join(" ") || undefined;

          return {
            id: typeof user._id === "string" ? user._id : user._id.toString(),
            name: fullName,
            email: user.email
          };
        } catch (err) {
          // Do not leak auth errors to the client
          debugAuth("authorize: error", err);
          return null;
        }
      }
    })
  ],

  callbacks: {
    async jwt({ token, user }: { token: JWT; user?: NextAuthUser | null }) {
      // Attach user id on first sign in
      if (user && typeof user === "object" && "id" in user) {
        const u = user as unknown as { id?: string | number };
        if (u.id != null) (token as JWT & { id?: string }).id = String(u.id);
      }
      return token;
    },

    async session({
      session,
      token
    }: {
      session: Session;
      token: JWT;
    }) {
      const t = token as JWT & { id?: string };
      if (session.user && t.id) {
        (session.user as unknown as { id?: string }).id = t.id;
      }
      return session;
    }
  }
};

// Backwards-compatible alias (some modules may still import authConfig)
export const authConfig = authOptions;

export default authOptions;