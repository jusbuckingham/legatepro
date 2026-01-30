// src/lib/stripe.ts
// Server-only Stripe client singleton.
// Keeps Stripe initialization in one place and avoids creating multiple clients in dev/hot-reload.

import "server-only";
import Stripe from "stripe";

import { assertEnv, env } from "@/lib/assertEnv";

assertEnv([
  {
    key: "STRIPE_SECRET_KEY",
    hint: "Create an API key in the Stripe Dashboard → Developers → API keys.",
  },
]);

declare global {
  var __legateproStripe: Stripe | undefined;
}

const stripeApiVersion: Stripe.LatestApiVersion = "2025-12-15.clover";

export const stripe: Stripe =
  globalThis.__legateproStripe ??
  new Stripe(env("STRIPE_SECRET_KEY"), {
    apiVersion: stripeApiVersion,
    // Keep TS strict — Stripe types already handle JSON internally.
    typescript: true,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__legateproStripe = stripe;
}

/** True if you're running against a live Stripe key. */
export function isLiveStripeKey(): boolean {
  const key = env("STRIPE_SECRET_KEY");
  return key.startsWith("sk_live_");
}

/**
 * Read-only convenience getter for webhook secret.
 * Use `assertEnv` in the route handler if your route requires this.
 */
export function getStripeWebhookSecret(): string | null {
  const val = process.env.STRIPE_WEBHOOK_SECRET;
  return typeof val === "string" && val.trim().length > 0 ? val.trim() : null;
}

/**
 * Normalize common Stripe price IDs from env.
 * Returns null if not configured.
 */
export function getStripePriceId(key: string): string | null {
  const val = process.env[key];
  return typeof val === "string" && val.trim().length > 0 ? val.trim() : null;
}