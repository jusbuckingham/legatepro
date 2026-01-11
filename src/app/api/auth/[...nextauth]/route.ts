// src/app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authOptions as baseAuthOptions } from "@/auth.config";

// Re-export for other server routes (e.g. getServerSession).
export const authOptions = baseAuthOptions;

// NextAuth relies on Node.js APIs; keep this route on the Node runtime.
export const runtime = "nodejs";

// Auth routes are inherently dynamic.
export const dynamic = "force-dynamic";

const handler = NextAuth(baseAuthOptions);

function isProd(): boolean {
  return process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
}

function missingRequiredEnv(): string[] {
  const required: string[] = ["NEXTAUTH_SECRET"];
  // In production, NextAuth expects a stable canonical URL.
  if (isProd()) required.push("NEXTAUTH_URL");

  return required.filter((k) => !process.env[k] || String(process.env[k]).trim().length === 0);
}

function applySecurityHeaders(res: Response): Response {
  // Clone into NextResponse so we can mutate headers safely.
  const next = new NextResponse(res.body, res);

  // Prevent caching of auth responses.
  next.headers.set("Cache-Control", "no-store, max-age=0");
  next.headers.set("Pragma", "no-cache");
  next.headers.set("Expires", "0");

  // Basic security headers.
  next.headers.set("X-Content-Type-Options", "nosniff");
  next.headers.set("Referrer-Policy", "same-origin");

  // Most NextAuth responses are redirects/cookies; framing isn't needed.
  next.headers.set("X-Frame-Options", "DENY");

  return next;
}

function envErrorResponse(missing: string[]): Response {
  // Keep response intentionally minimal (avoid leaking config details in prod).
  const payload = {
    ok: false,
    error: "Auth is not configured.",
    missing: isProd() ? undefined : missing,
  };

  const res = NextResponse.json(payload, { status: 500 });
  res.headers.set("Cache-Control", "no-store, max-age=0");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("X-Content-Type-Options", "nosniff");
  return res;
}

export async function GET(req: Request) {
  const missing = missingRequiredEnv();
  if (missing.length > 0) return envErrorResponse(missing);

  const res = await handler(req);
  return applySecurityHeaders(res);
}

export async function POST(req: Request) {
  const missing = missingRequiredEnv();
  if (missing.length > 0) return envErrorResponse(missing);

  const res = await handler(req);
  return applySecurityHeaders(res);
}