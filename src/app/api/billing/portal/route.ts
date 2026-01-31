// src/app/api/billing/portal/route.ts
// Creates a Stripe Customer Portal session so users can manage billing.

import Stripe from "stripe";

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { assertEnv } from "@/lib/assertEnv";
import { connectToDatabase } from "@/lib/db";
import {
  jsonErr,
  jsonOk,
  noStoreHeaders,
  safeErrorMessage,
} from "@/lib/apiResponse";
import { User } from "@/models/User";

type LeanUser = {
  _id: unknown;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  stripeCustomerId?: string | null;
};

function getUserFullName(user: LeanUser): string | undefined {
  const parts = [user.firstName ?? "", user.lastName ?? ""].map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts.join(" ") : undefined;
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Best-effort in-memory rate limit (works in long-lived runtimes; may reset on serverless cold starts).
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const attempts = new Map<string, { count: number; resetAt: number }>();

function cleanupRateLimitMap(now: number) {
  // Best-effort cleanup; keep it tiny and fast.
  if (attempts.size < 500) return;
  for (const [k, v] of attempts) {
    if (v.resetAt <= now) attempts.delete(k);
  }
}

function getClientKey(req: NextRequest): string {
  // Portal is auth-gated; we still apply a lightweight client-based limiter to reduce abuse.
  // Prefer the edge-provided IP header when available.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "unknown";

  const ua = req.headers.get("user-agent")?.slice(0, 128) ?? "";

  return `portal:ip:${ip}:ua:${ua}`;
}

function checkRateLimit(
  key: string,
): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const now = Date.now();
  cleanupRateLimitMap(now);
  const entry = attempts.get(key);

  if (!entry || entry.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { ok: true };
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }

  entry.count += 1;
  attempts.set(key, entry);
  return { ok: true };
}

function isProd(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production" ||
    Boolean(process.env.VERCEL)
  );
}

function getStripe(): Stripe {
  assertEnv([
    {
      key: "STRIPE_SECRET_KEY",
      hint: "Stripe secret key for server-side billing",
    },
  ]);

  return new Stripe(process.env.STRIPE_SECRET_KEY as string, {
    apiVersion: "2025-12-15.clover",
  });
}

function getAppUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.VERCEL_URL ||
    "http://localhost:3000";

  return url.startsWith("http") ? url : `https://${url}`;
}

function safeReturnUrl(appUrl: string): string | null {
  try {
    const base = new URL(appUrl);

    // Only allow http(s)
    if (base.protocol !== "https:" && base.protocol !== "http:") return null;

    // In production, require https
    if (isProd() && base.protocol !== "https:") return null;

    // Require a host
    if (!base.host) return null;

    // Only return to our own billing page (prevents open redirects)
    return new URL("/app/billing", base).toString();
  } catch {
    return null;
  }
}

function getPortalReturnUrl(): string | null {
  // Optional override for portal return URL (useful if your app URL differs across environments)
  const override = process.env.STRIPE_PORTAL_RETURN_URL;
  if (override && override.trim()) {
    return safeReturnUrl(override.trim());
  }

  return safeReturnUrl(getAppUrl());
}

function idToString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "toString" in value) {
    return String((value as { toString: () => string }).toString());
  }
  return "";
}

function addSecurityHeaders(headers: Headers) {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "same-origin");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
}

// POST /api/billing/portal
// Returns a Stripe billing portal url for the authenticated user.
export async function POST(req: NextRequest) {
  const headers = new Headers(noStoreHeaders());
  addSecurityHeaders(headers);

  // Rate limit (best-effort). We include the user id once we have it.
  const clientKey = getClientKey(req);
  const rl = checkRateLimit(clientKey);
  if (!rl.ok) {
    headers.set("Retry-After", String(rl.retryAfterSeconds));
    return jsonErr("Too many requests. Please try again shortly.", 429, headers);
  }

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return jsonErr("Unauthorized", 401, headers);
    }

    // Add per-user rate limit key for better protection (in addition to the coarse bucket above).
    const userRl = checkRateLimit(`portal:user:${session.user.id}:${clientKey}`);
    if (!userRl.ok) {
      headers.set("Retry-After", String(userRl.retryAfterSeconds));
      return jsonErr(
        "Too many requests. Please try again shortly.",
        429,
        headers,
      );
    }

    await connectToDatabase();

    const userDoc = (await User.findById(session.user.id).lean().exec()) as LeanUser | null;
    if (!userDoc) return jsonErr("User not found", 404, headers);

    const stripe = getStripe();

    let stripeCustomerId = userDoc.stripeCustomerId ?? null;

    // If the user hasn't created a Stripe customer yet, create one now.
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: userDoc.email || undefined,
        name: getUserFullName(userDoc),
        metadata: {
          userId: idToString(userDoc._id),
        },
      });

      stripeCustomerId = customer.id;

      await User.updateOne(
        { _id: userDoc._id },
        { $set: { stripeCustomerId } },
      ).exec();
    }

    // Guard against corrupted/invalid values
    if (!stripeCustomerId || !/^cus_[A-Za-z0-9]+$/.test(stripeCustomerId)) {
      return jsonErr("Billing is not configured for this user.", 409, headers);
    }

    const returnUrl = getPortalReturnUrl();
    if (!returnUrl) {
      // Avoid leaking env details in prod.
      const message = isProd()
        ? "Billing is not configured."
        : `Invalid return URL configuration (check NEXT_PUBLIC_BASE_URL/NEXTAUTH_URL/VERCEL_URL or STRIPE_PORTAL_RETURN_URL): ${
            process.env.STRIPE_PORTAL_RETURN_URL || getAppUrl()
          }`;
      return jsonErr(message, 500, headers);
    }

    // NOTE: Stripe Billing Portal must be enabled in the Stripe Dashboard.
    // If a stored Stripe customer id is stale/invalid, recreate it once and retry.
    let portal: Stripe.Response<Stripe.BillingPortal.Session> | null = null;

    try {
      portal = await stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: returnUrl,
      });
    } catch (err) {
      const msg = safeErrorMessage(err);

      // Common failure: stored customer id no longer exists (e.g., test data reset)
      if (msg.toLowerCase().includes("no such customer")) {
        try {
          const customer = await stripe.customers.create({
            email: userDoc.email || undefined,
            name: getUserFullName(userDoc),
            metadata: {
              userId: idToString(userDoc._id),
            },
          });

          stripeCustomerId = customer.id;

          await User.updateOne(
            { _id: userDoc._id },
            { $set: { stripeCustomerId } },
          ).exec();

          portal = await stripe.billingPortal.sessions.create({
            customer: stripeCustomerId,
            return_url: returnUrl,
          });
        } catch (retryErr) {
          console.error("POST /api/billing/portal retry error:", safeErrorMessage(retryErr));
          return jsonErr(
            "Unable to open customer portal",
            500,
            headers,
          );
        }
      } else {
        console.error("POST /api/billing/portal error:", msg);
        return jsonErr("Unable to open customer portal", 500, headers);
      }
    }

    if (!portal?.url) {
      return jsonErr(
        "Unable to create customer portal session",
        500,
        headers,
      );
    }

    return jsonOk({ url: portal.url }, 200, headers);
  } catch (error) {
    console.error("POST /api/billing/portal error:", safeErrorMessage(error));
    return jsonErr("Unable to open customer portal", 500, headers);
  }
}
