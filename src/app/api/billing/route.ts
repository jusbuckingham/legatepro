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
  jsonUnauthorized,
  noStoreHeaders,
  safeErrorMessage,
} from "@/lib/apiResponse";
import { User, UserDocument } from "@/models/User";

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

function getStripe() {
  assertEnv([
    { key: "STRIPE_SECRET_KEY", hint: "Stripe secret key for server-side billing" },
  ]);
  return new Stripe(process.env.STRIPE_SECRET_KEY as string, {
    apiVersion: "2025-12-15.clover",
  });
}

function getAppUrl() {
  // Prefer an explicit app url in prod.
  // Fallbacks are fine for local/dev.
  const url =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.VERCEL_URL ||
    "http://localhost:3000";
  return url.startsWith("http") ? url : `https://${url}`;
}

function idToString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "toString" in value) {
    return String((value as { toString: () => string }).toString());
  }
  return "";
}

// GET /api/billing
// Returns subscription/billing info for the authenticated user.
export async function GET() {
  const headers = noStoreHeaders();

  try {
    const session = await auth();
    if (!session?.user?.id) return jsonUnauthorized();

    await connectToDatabase();

    const user: UserDocument | null = await User.findById(session.user.id);
    if (!user) {
      return jsonErr("User not found", 404, "NOT_FOUND", { headers });
    }

    const planId = user.subscriptionStatus ?? "free";
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
      status: planId === "free" ? "inactive" : "active",
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
  const headers = noStoreHeaders();

  try {
    const session = await auth();
    if (!session?.user?.id) return jsonUnauthorized();

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonErr("Invalid JSON", 400, "BAD_REQUEST", { headers });
    }

    const planId = (body as { planId?: string })?.planId ?? "";
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

    const user: UserDocument | null = await User.findById(session.user.id);
    if (!user) return jsonErr("User not found", 404, "NOT_FOUND", { headers });

    const stripe = getStripe();

    // Ensure Stripe Customer exists.
    const u = user as unknown as {
      stripeCustomerId?: string;
      save: () => Promise<unknown>;
    };

    if (!u.stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: [user.firstName, user.lastName].filter(Boolean).join(" ") || undefined,
        metadata: {
          userId: idToString(user._id),
        },
      });
      u.stripeCustomerId = customer.id;
      await u.save();
    }

    const appUrl = getAppUrl();

    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: u.stripeCustomerId,
      line_items: [{ price: process.env[priceEnv] as string, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${appUrl}/app/billing?success=1`,
      cancel_url: `${appUrl}/app/billing?canceled=1`,
      // Important: don't trust client state—webhook will finalize subscription status.
      metadata: {
        userId: idToString(user._id),
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