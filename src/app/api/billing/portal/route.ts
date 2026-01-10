// src/app/api/billing/portal/route.ts
// Creates a Stripe Customer Portal session so users can manage billing.

import Stripe from "stripe";

import { auth } from "@/lib/auth";
import { assertEnv } from "@/lib/assertEnv";
import { connectToDatabase } from "@/lib/db";
import {
  jsonErr,
  jsonOk,
  jsonUnauthorized,
  noStoreHeaders,
  safeErrorMessage,
} from "@/lib/apiResponse";
import { User, UserDocument } from "@/models/User";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getStripe() {
  assertEnv([
    { key: "STRIPE_SECRET_KEY", hint: "Stripe secret key for server-side billing" },
  ]);

  return new Stripe(process.env.STRIPE_SECRET_KEY as string, {
    apiVersion: "2025-12-15.clover",
  });
}

function getAppUrl() {
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

// POST /api/billing/portal
// Returns a Stripe billing portal url for the authenticated user.
export async function POST() {
  const headers = noStoreHeaders();

  try {
    const session = await auth();
    if (!session?.user?.id) return jsonUnauthorized();

    await connectToDatabase();

    const user: UserDocument | null = await User.findById(session.user.id);
    if (!user) return jsonErr("User not found", 404, "NOT_FOUND", { headers });

    const stripe = getStripe();

    const u = user as unknown as {
      stripeCustomerId?: string | null;
      save: () => Promise<unknown>;
    };

    // If the user hasn't created a Stripe customer yet, create one now.
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

    // NOTE: Stripe Billing Portal must be enabled in the Stripe Dashboard.
    const portal = await stripe.billingPortal.sessions.create({
      customer: u.stripeCustomerId,
      return_url: `${appUrl}/app/billing`,
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
