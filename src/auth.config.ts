// src/auth.config.ts
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import type { JWT } from "next-auth/jwt";
import bcrypt from "bcryptjs";

import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";

type AppToken = JWT & {
  userId?: string;
  email?: string;
  name?: string;
};

const isProd = process.env.NODE_ENV === "production";
const debugEnabled = process.env.NEXTAUTH_DEBUG === "true" || !isProd;

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!user || !domain) return "***";
  const left = user.slice(0, 2);
  const right = user.length > 2 ? user.slice(-1) : "";
  return `${left}***${right}@${domain}`;
}

export const authOptions: NextAuthOptions = {
  // IMPORTANT: must be set in production (Vercel)
  secret: process.env.NEXTAUTH_SECRET,

  // Enable verbose auth diagnostics locally; opt-in on Vercel with NEXTAUTH_DEBUG=true
  debug: debugEnabled,
  ...(debugEnabled
    ? {
        logger: {
          error(code, meta) {
            console.error("[nextauth][error]", code, meta);
          },
          warn(code) {
            console.warn("[nextauth][warn]", code);
          },
          debug(code, meta) {
            console.log("[nextauth][debug]", code, meta);
          },
        },
      }
    : {}),

  session: {
    strategy: "jwt",
  },

  providers: [
    CredentialsProvider({
      name: "Email and Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          const email = credentials?.email?.trim().toLowerCase();
          const password = credentials?.password ?? "";

          if (isProd && !process.env.NEXTAUTH_SECRET) {
            console.error("[auth] NEXTAUTH_SECRET is missing in production");
          }

          if (!email || !password) {
            console.warn("[auth] missing email/password");
            return null;
          }

          await connectToDatabase();

          // NOTE: if your User schema has passwordHash/password with `select:false`,
          // you MUST select them explicitly or authorize() will always fail in prod.
          const userDoc = await User.findOne({ email })
            // harmless if fields are not select:false
            .select("+passwordHash +password +email +name")
            .lean();

          if (!userDoc) {
            console.warn("[auth] user not found", { email: isProd ? maskEmail(email) : email });
            return null;
          }

          const doc = userDoc as unknown as {
            _id: unknown;
            email?: string;
            name?: string;
            passwordHash?: string;
            password?: string;
          };

          // Prefer the canonical field: passwordHash.
          // If we still have legacy `password` (which historically stored a bcrypt hash),
          // we can authenticate with it once and then migrate it to `passwordHash`.
          const passwordHash = doc.passwordHash;
          const legacyHash = doc.password;

          const hashToCheck = passwordHash ?? legacyHash;
          if (!hashToCheck) {
            console.error("[auth] user missing password hash field", {
              email: isProd ? maskEmail(email) : email,
            });
            return null;
          }

          const ok = await bcrypt.compare(password, hashToCheck);
          if (!ok) {
            console.warn("[auth] bad password", { email: isProd ? maskEmail(email) : email });
            return null;
          }

          // One-time migration: if the user authenticated via legacy `password`,
          // persist it under `passwordHash` and remove `password`.
          if (!passwordHash && legacyHash) {
            try {
              await User.updateOne(
                { _id: doc._id },
                { $set: { passwordHash: legacyHash }, $unset: { password: "" } }
              ).exec();
              console.log("[auth] migrated legacy password -> passwordHash", {
                email: isProd ? maskEmail(email) : email,
              });
            } catch (e) {
              console.warn("[auth] failed to migrate legacy password field", e);
              // Do not fail login if migration fails.
            }
          }

          return {
            id: String(doc._id),
            email: doc.email ?? email,
            name: doc.name ?? undefined,
          };
        } catch (err) {
          console.error("[auth] authorize exception", err);
          return null;
        }
      },
    }),
  ],

  pages: {
    signIn: "/login",
  },

  callbacks: {
    async jwt({ token, user }) {
      const t = token as AppToken;

      if (user) {
        t.userId = user.id;
        t.email = user.email ?? undefined;
        t.name = user.name ?? undefined;
      }

      return t;
    },

    async session({ session, token }) {
      const t = token as AppToken;

      session.user = session.user ?? {};
      (session.user as { id?: string }).id = t.userId;

      session.user.email = t.email ?? session.user.email;
      session.user.name = t.name ?? session.user.name;

      return session;
    },
  },
};

export default authOptions;