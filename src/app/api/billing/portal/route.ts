// src/app/api/billing/portal/route.ts
// Creates a Stripe Customer Portal session so users can manage billing.

import Stripe from "stripe";

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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Best-effort in-memory rate limit (works in long-lived runtimes; may reset on serverless cold starts).
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const attempts = new Map<string, { count: number; resetAt: number }>();

function getClientKey(): string {
  // Portal is auth-gated; we rate limit primarily by user id (fallback to UA).
  // We can't access req headers here (no req param), so keep this conservative.
  // If you want IP-based limiting too, change POST signature to accept NextRequest.
  return "portal";
}

function checkRateLimit(
  key: string,
): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || entry.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { ok: true };
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
  }

  entry.count += 1;
  attempts.set(key, entry);
  return { ok: true };
}

function isProd(): boolean {
  return process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
}

function getStripe() {
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
}

// POST /api/billing/portal
// Returns a Stripe billing portal url for the authenticated user.
export async function POST() {
  const headers = new Headers(noStoreHeaders());
  addSecurityHeaders(headers);

  // Rate limit (best-effort). We include the user id once we have it.
  const rl = checkRateLimit(getClientKey());
  if (!rl.ok) {
    headers.set("Retry-After", String(rl.retryAfterSeconds));
    return jsonErr("Too many requests. Please try again shortly.", 429, "RATE_LIMITED", {
      headers,
    });
  }

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return jsonErr("Unauthorized", 401, "UNAUTHORIZED", { headers });
    }

    // Add per-user rate limit key for better protection (in addition to the coarse bucket above).
    const userRl = checkRateLimit(`portal:user:${session.user.id}`);
    if (!userRl.ok) {
      headers.set("Retry-After", String(userRl.retryAfterSeconds));
      return jsonErr(
        "Too many requests. Please try again shortly.",
        429,
        "RATE_LIMITED",
        { headers },
      );
    }

    await connectToDatabase();

    const user = await User.findById(session.user.id).lean().exec();
    if (!user) return jsonErr("User not found", 404, "NOT_FOUND", { headers });

    const stripe = getStripe();

    let stripeCustomerId = (user as unknown as { stripeCustomerId?: string | null })
      .stripeCustomerId;

    // If the user hasn't created a Stripe customer yet, create one now.
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: (user as unknown as { email?: string | null }).email || undefined,
        name:
          [
            (user as unknown as { firstName?: string | null }).firstName,
            (user as unknown as { lastName?: string | null }).lastName,
          ]
            .filter(Boolean)
            .join(" ") || undefined,
        metadata: {
          userId: idToString((user as unknown as { _id?: unknown })._id),
        },
      });

      stripeCustomerId = customer.id;

      await User.updateOne(
        { _id: (user as unknown as { _id?: unknown })._id },
        { $set: { stripeCustomerId } },
      ).exec();
    }

    // Guard against corrupted/invalid values
    if (!stripeCustomerId || !stripeCustomerId.startsWith("cus_")) {
      return jsonErr("Billing is not configured for this user.", 409, "BILLING_NOT_READY", {
        headers,
      });
    }

    const appUrl = getAppUrl();
    const returnUrl = safeReturnUrl(appUrl);
    if (!returnUrl) {
      // Avoid leaking env details in prod.
      const message = isProd()
        ? "Billing is not configured."
        : `Invalid app URL configuration: ${appUrl}`;
      return jsonErr(message, 500, "CONFIG_ERROR", { headers });
    }

    // NOTE: Stripe Billing Portal must be enabled in the Stripe Dashboard.
    const portal = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl,
    });

    if (!portal.url) {
      return jsonErr("Unable to create customer portal session", 500, "INTERNAL_ERROR", {
        headers,
      });
    }

    return jsonOk({ url: portal.url }, { headers });
  } catch (error) {
    console.error("POST /api/billing/portal error:", safeErrorMessage(error));
    return jsonErr("Unable to open customer portal", 500, "INTERNAL_ERROR", { headers });
  }
}
