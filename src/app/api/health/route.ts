// src/app/api/health/route.ts

import { NextResponse } from "next/server";
import Stripe from "stripe";
import mongoose from "mongoose";

import { connectToDatabase } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HealthStatus = "ok" | "degraded" | "error";

type HealthResponse = {
  ok: boolean;
  status: HealthStatus;
  timestamp: string;
  durationMs: number;
  version?: string;
  checks: {
    env: {
      ok: boolean;
      missing: string[];
    };
    db: {
      ok: boolean;
      state: number;
      stateLabel: string;
    };
    stripe: {
      enabled: boolean;
      ok: boolean;
      error?: string;
    };
  };
};

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
} as const;

function labelMongooseState(state: number): string {
  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  switch (state) {
    case 0:
      return "disconnected";
    case 1:
      return "connected";
    case 2:
      return "connecting";
    case 3:
      return "disconnecting";
    default:
      return "unknown";
  }
}

function isProd(): boolean {
  return process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
}

function getVersion(): string | undefined {
  if (isProd()) return undefined;
  return (
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_APP_VERSION ||
    undefined
  );
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function applyResponseHeaders(res: NextResponse) {
  // Prevent caching (important for uptime monitors).
  res.headers.set("Cache-Control", NO_STORE_HEADERS["Cache-Control"]);
  res.headers.set("Pragma", NO_STORE_HEADERS.Pragma);
  res.headers.set("Expires", NO_STORE_HEADERS.Expires);

  // Security headers.
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "same-origin");
  res.headers.set("X-Frame-Options", "DENY");

  return res;
}

export async function GET() {
  const start = Date.now();
  const timestamp = new Date().toISOString();

  // --- Env guardrails ---
  // Keep this list tight: only what would make the app unusable.
  const requiredEnv = ["MONGODB_URI"] as const;
  const missing = requiredEnv.filter((k) => {
    const v = process.env[k];
    return !v || String(v).trim().length === 0;
  });
  const envOk = missing.length === 0;

  // --- DB check ---
  let dbOk = false;
  try {
    if (envOk) {
      await withTimeout(connectToDatabase(), 1500, "DB connect");
      dbOk = mongoose.connection.readyState === 1;
    }
  } catch {
    dbOk = false;
  }

  // --- Stripe check (optional) ---
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const stripeEnabled = Boolean(stripeKey && String(stripeKey).trim().length > 0);
  let stripeOk = true;
  let stripeError: string | undefined;

  if (stripeEnabled) {
    try {
      // Prefer configured API version; otherwise let Stripe SDK default.
      const apiVersion = process.env.STRIPE_API_VERSION;
      const stripe = new Stripe(String(stripeKey), {
        ...(apiVersion && String(apiVersion).trim().length > 0
          ? { apiVersion: String(apiVersion) as Stripe.LatestApiVersion }
          : {}),
      });

      // Lightweight auth check.
      await withTimeout(stripe.balance.retrieve(), 1500, "Stripe balance.retrieve");
      stripeOk = true;
    } catch (err) {
      stripeOk = false;
      stripeError = err instanceof Error ? err.message : "Stripe check failed";
    }
  }

  const durationMs = Date.now() - start;

  // Status logic:
  // - error: env missing OR db down
  // - degraded: db ok but stripe enabled and failing
  // - ok: all required checks ok
  let status: HealthStatus = "ok";
  if (!envOk || !dbOk) status = "error";
  else if (stripeEnabled && !stripeOk) status = "degraded";

  // Keep the existing semantics: ok means fully healthy.
  const ok = status === "ok";

  const body: HealthResponse = {
    ok,
    status,
    timestamp,
    durationMs,
    version: getVersion(),
    checks: {
      env: {
        ok: envOk,
        missing: isProd() ? [] : missing,
      },
      db: {
        ok: dbOk,
        state: mongoose.connection.readyState,
        stateLabel: labelMongooseState(mongoose.connection.readyState),
      },
      stripe: {
        enabled: stripeEnabled,
        ok: stripeEnabled ? stripeOk : true,
        ...(stripeEnabled && !stripeOk ? { error: stripeError } : {}),
      },
    },
  };

  const httpStatus = ok ? 200 : status === "degraded" ? 200 : 500;
  const res = NextResponse.json(body, { status: httpStatus });
  return applyResponseHeaders(res);
}