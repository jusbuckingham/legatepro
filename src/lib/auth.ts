// src/lib/auth.ts
// Thin wrapper around next-auth's getServerSession for server-side auth (v4 compatible).

import { getServerSession } from "next-auth";
import { authOptions } from "@/auth.config";

export async function auth() {
  return getServerSession(authOptions);
}