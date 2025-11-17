// src/auth.config.ts
import type { NextAuthOptions, Session, User as NextAuthUser } from "next-auth";
import type { JWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";
import { compare } from "bcryptjs";

export const authOptions: NextAuthOptions = {
  providers: [
    Credentials({
      name: "Email and Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        await connectToDatabase();

        const user = (await User.findOne({ email: credentials.email }).lean()) as
          | {
              _id: { toString(): string } | string;
              name?: string;
              email: string;
              password?: string;
            }
          | null;

        if (!user || !user.password) {
          return null;
        }

        const isValid = await compare(credentials.password, user.password);
        if (!isValid) return null;

        return {
          id: typeof user._id === "string" ? user._id : user._id.toString(),
          name: user.name,
          email: user.email
        };
      }
    })
  ],

  session: {
    strategy: "jwt"
  },

  pages: {
    signIn: "/login"
  },

  callbacks: {
    async jwt({
      token,
      user
    }: {
      token: JWT & { id?: string };
      user?: NextAuthUser | null;
    }) {
      // Attach user id on first sign in
      if (user && user.id) {
        token.id = user.id as string;
      }
      return token;
    },
    async session({
      session,
      token
    }: {
      session: Session;
      token: JWT & { id?: string };
    }) {
      if (session.user && token.id) {
        (session.user as { id?: string }).id = token.id;
      }
      return session;
    }
  }
};