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

export const authOptions: NextAuthOptions = {
  // IMPORTANT: must be set in production (Vercel)
  secret: process.env.NEXTAUTH_SECRET,

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
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password ?? "";

        if (!email || !password) return null;

        await connectToDatabase();

        const userDoc = await User.findOne({ email }).lean();
        if (!userDoc) return null;

        const doc = userDoc as unknown as {
          _id: unknown;
          email?: string;
          name?: string;
          passwordHash?: string;
          password?: string;
        };

        const hash = doc.passwordHash ?? doc.password;
        if (!hash) return null;

        const ok = await bcrypt.compare(password, hash);
        if (!ok) return null;

        return {
          id: String(doc._id),
          email: doc.email ?? email,
          name: doc.name ?? undefined,
        };
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

      // Ensure session.user exists
      session.user = session.user ?? {};

      // Attach our fields for server components / API routes
      (session.user as { id?: string }).id = t.userId;
      session.user.email = t.email ?? session.user.email;
      session.user.name = t.name ?? session.user.name;

      return session;
    },
  },
};

export default authOptions;