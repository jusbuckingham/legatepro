// src/app/api/billing/route.ts
// Stripe-backed billing endpoints for LegatePro.
// - GET: returns current user's billing/subscription snapshot
// - POST: creates a Stripe Checkout Session for a subscription

import { NextRequest } from "next/server";
import Stripe from "stripe";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { assertEnv } from "@/lib/assertEnv";
import {
  jsonErr,
  jsonOk,
  noStoreHeaders,
  safeErrorMessage,
} from "@/lib/apiResponse";
import { User } from "@/models/User";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Plans shown on /app/billing
// NOTE: For Stripe, set STRIPE_PRICE_PRO_MONTHLY to the Price ID for the plan.
const PLAN_METADATA: Record<
  string,
  {
    id: string;
    name: string;
    price: number;
    currency: string;
    interval: "month" | "year";
    stripePriceEnv?: string;
  }
> = {
  free: {
    id: "free",
    name: "Starter",
    price: 0,
    currency: "usd",
    interval: "month",
  },
  pro: {
    id: "pro",
    name: "Pro Personal Representative",
    price: 19,
    currency: "usd",
    interval: "month",
    stripePriceEnv: "STRIPE_PRICE_PRO_MONTHLY",
  },
};

// --- Security helpers ---
function isProd(): boolean {
  return process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
}

function headersNoStore(): Headers {
  // `noStoreHeaders()` returns HeadersInit; normalize to Headers for `.set()`.
  return new Headers(noStoreHeaders());
}

function addSecurityHeaders(headers: Headers) {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "same-origin");
  headers.set("X-Frame-Options", "DENY");
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
  // Prefer an explicit app url in prod.
  // Fallbacks are fine for local/dev.
  const url =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.VERCEL_URL ||
    "http://localhost:3000";

  return url.startsWith("http") ? url : `https://${url}`;
}

function safeBillingReturnUrl(appUrl: string): string | null {
  try {
    const base = new URL(appUrl);

    // Only allow http(s)
    if (base.protocol !== "https:" && base.protocol !== "http:") return null;

    // In production, require https
    if (isProd() && base.protocol !== "https:") return null;

    if (!base.host) return null;

    // Lock return URLs to our billing page only.
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

// --- Best-effort in-memory rate limit (may reset on serverless cold starts) ---
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_POST = 20;
const attempts = new Map<string, { count: number; resetAt: number }>();

function getClientKey(req: NextRequest): string {
  const xfwd = req.headers.get("x-forwarded-for");
  const ip = xfwd ? xfwd.split(",")[0]?.trim() : "";
  const realIp = req.headers.get("x-real-ip")?.trim() ?? "";
  const ua = req.headers.get("user-agent")?.slice(0, 64) ?? "";
  return ip || realIp || `ua:${ua}`;
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

  if (entry.count >= RATE_LIMIT_MAX_POST) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }

  entry.count += 1;
  attempts.set(key, entry);
  return { ok: true };
}

// --- Request parsing ---
const MAX_JSON_BODY_BYTES = 25_000;

async function readJsonBody(
  req: NextRequest,
  headers: Headers,
): Promise<
  | { ok: true; planId: string }
  | { ok: false; res: ReturnType<typeof jsonErr> }
> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return {
      ok: false,
      res: jsonErr("Content-Type must be application/json", 415, "UNSUPPORTED_MEDIA_TYPE", { headers }),
    };
  }

  try {
    const raw = await req.text();
    if (raw.length > MAX_JSON_BODY_BYTES) {
      return { ok: false, res: jsonErr("Request body too large", 413, "PAYLOAD_TOO_LARGE", { headers }) };
    }

    const parsed: unknown = raw ? JSON.parse(raw) : null;
    const planId =
      typeof (parsed as { planId?: unknown } | null)?.planId === "string"
        ? String((parsed as { planId: string }).planId).trim()
        : "";

    return { ok: true, planId };
  } catch {
    return { ok: false, res: jsonErr("Invalid JSON", 400, "BAD_REQUEST", { headers }) };
  }
}

// GET /api/billing
// Returns subscription/billing info for the authenticated user.
export async function GET() {
  const headers = headersNoStore();
  addSecurityHeaders(headers);

  try {
    const session = await auth();
    if (!session?.user?.id) return jsonErr("Unauthorized", 401, "UNAUTHORIZED", { headers });

    await connectToDatabase();

    const user = await User.findById(session.user.id).lean().exec();
    if (!user) {
      return jsonErr("User not found", 404, "NOT_FOUND", { headers });
    }

    const rawStatus = (user.subscriptionStatus ?? null) as string | null;

    // Back-compat: some code paths historically stored a planId (e.g. "pro"/"free") in `subscriptionStatus`.
    // Newer Stripe-backed paths store Stripe subscription statuses (e.g. "active", "trialing", "past_due", "canceled").
    function derivePlanId(status: string | null): "free" | "pro" {
      const s = (status ?? "").toLowerCase();
      if (s === "pro") return "pro";
      if (s === "free" || !s) return "free";
      if (s === "active" || s === "trialing" || s === "past_due") return "pro";
      return "free";
    }

    const planId = derivePlanId(rawStatus);

    const plan = PLAN_METADATA[planId] ?? PLAN_METADATA.free;

    const customer = {
      id: idToString(user._id),
      email: user.email,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      // Best-effort: only present if your User model has this field.
      stripeCustomerId:
        (user as unknown as { stripeCustomerId?: string }).stripeCustomerId ?? null,
    };

    const subscription = {
      planId: plan.id,
      planName: plan.name,
      price: plan.price,
      currency: plan.currency,
      interval: plan.interval,
      status:
        rawStatus && ["active", "trialing", "past_due", "canceled"].includes(String(rawStatus))
          ? String(rawStatus)
          : planId === "free"
            ? "inactive"
            : "active",
      managedByStripe: true,
    };

    return jsonOk(
      { customer, subscription, plans: Object.values(PLAN_METADATA) },
      { headers },
    );
  } catch (error) {
    console.error("GET /api/billing error:", safeErrorMessage(error));
    return jsonErr("Unable to load billing information", 500, "INTERNAL_ERROR", {
      headers,
    });
  }
}

// POST /api/billing
// Body: { planId: "pro" }
// Creates a Stripe Checkout Session and returns { url }.
export async function POST(req: NextRequest) {
  const headers = headersNoStore();
  addSecurityHeaders(headers);

  // Rate limit (best-effort)
  const rl = checkRateLimit(`billing:checkout:${getClientKey(req)}`);
  if (!rl.ok) {
    headers.set("Retry-After", String(rl.retryAfterSeconds));
    return jsonErr("Too many requests. Please try again shortly.", 429, "RATE_LIMITED", {
      headers,
    });
  }

  try {
    const session = await auth();
    if (!session?.user?.id) return jsonErr("Unauthorized", 401, "UNAUTHORIZED", { headers });

    const parsed = await readJsonBody(req, headers);
    if (!parsed.ok) return parsed.res;

    const planId = parsed.planId;
    const plan = PLAN_METADATA[planId];
    if (!plan || planId === "free") {
      return jsonErr("Invalid planId", 400, "BAD_REQUEST", { headers });
    }

    const priceEnv = plan.stripePriceEnv;
    if (!priceEnv) {
      return jsonErr("Plan is not billable", 400, "BAD_REQUEST", { headers });
    }

    assertEnv([{ key: priceEnv, hint: "Stripe Price ID for the selected plan" }]);

    await connectToDatabase();

    const user = await User.findById(session.user.id).exec();
    if (!user) return jsonErr("User not found", 404, "NOT_FOUND", { headers });

    const stripe = getStripe();

    // Ensure Stripe Customer exists.
    const u = user as unknown as {
      stripeCustomerId?: string | null;
      save: () => Promise<unknown>;
      _id: unknown;
      email: string;
      firstName?: string | null;
      lastName?: string | null;
    };

    if (!u.stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: u.email,
        name: [u.firstName, u.lastName].filter(Boolean).join(" ") || undefined,
        metadata: {
          userId: idToString(u._id),
        },
      });
      u.stripeCustomerId = customer.id;
      await u.save();
    }

    // Guard against corrupted/invalid values.
    if (!u.stripeCustomerId || !u.stripeCustomerId.startsWith("cus_")) {
      return jsonErr("Billing is not configured for this user.", 409, "BILLING_NOT_READY", {
        headers,
      });
    }

    const appUrl = getAppUrl();
    const returnUrl = safeBillingReturnUrl(appUrl);
    if (!returnUrl) {
      const message = isProd() ? "Billing is not configured." : `Invalid app URL: ${appUrl}`;
      return jsonErr(message, 500, "CONFIG_ERROR", { headers });
    }

    const successUrl = `${returnUrl}?success=1`;
    const cancelUrl = `${returnUrl}?canceled=1`;

    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: u.stripeCustomerId,
      line_items: [{ price: process.env[priceEnv] as string, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: successUrl,
      cancel_url: cancelUrl,
      // Important: don't trust client state—webhook will finalize subscription status.
      metadata: {
        userId: idToString(u._id),
        planId,
      },
    });

    if (!checkout.url) {
      return jsonErr("Unable to create checkout session", 500, "INTERNAL_ERROR", {
        headers,
      });
    }

    return jsonOk({ url: checkout.url }, { headers });
  } catch (error) {
    console.error("POST /api/billing error:", safeErrorMessage(error));
    return jsonErr("Unable to start checkout", 500, "INTERNAL_ERROR", { headers });
  }
}