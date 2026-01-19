// src/app/api/billing/webhook/route.ts
// Stripe webhook handler (signature-verified) to keep subscription state in sync.

import Stripe from "stripe";
import { NextRequest } from "next/server";
import mongoose from "mongoose";

import { assertEnv } from "@/lib/assertEnv";
import { connectToDatabase } from "@/lib/db";
import { jsonErr, jsonOk, noStoreHeaders, safeErrorMessage } from "@/lib/apiResponse";
import { User, UserDocument } from "@/models/User";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function addSecurityHeaders(headers: Headers) {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "same-origin");
  headers.set("X-Frame-Options", "DENY");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  );
}

function buildHeaders(): Headers {
  const h = new Headers(noStoreHeaders());
  addSecurityHeaders(h);
  return h;
}

const ALLOWED_EVENT_TYPES = new Set<string>([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "customer.subscription.updated",
  "invoice.payment_failed",
  "invoice.payment_succeeded",
  "invoice.paid",
]);

const MAX_WEBHOOK_BODY_BYTES = 1_000_000; // 1MB
const WEBHOOK_EVENT_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

let ensuredWebhookIndexes: Promise<void> | null = null;

function isDuplicateKeyError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  if (!("code" in err)) return false;
  const code = (err as { code?: unknown }).code;
  return code === 11000;
}

async function ensureWebhookIndexes() {
  if (ensuredWebhookIndexes) return ensuredWebhookIndexes;

  ensuredWebhookIndexes = (async () => {
    const db = mongoose.connection.db;
    if (!db) return;

    const col = db.collection<{ eventId: string; type: string; createdAt: Date }>(
      "stripe_webhook_events",
    );

    // Idempotency via unique Stripe event id
    await col.createIndex({ eventId: 1 }, { unique: true });

    // TTL to keep the idempotency table bounded
    await col.createIndex({ createdAt: 1 }, { expireAfterSeconds: WEBHOOK_EVENT_TTL_SECONDS });
  })();

  return ensuredWebhookIndexes;
}

async function markEventProcessed(eventId: string, eventType: string): Promise<"new" | "duplicate"> {
  const db = mongoose.connection.db;
  if (!db) return "new";

  const col = db.collection<{ eventId: string; type: string; createdAt: Date }>(
    "stripe_webhook_events",
  );

  try {
    await col.insertOne({ eventId, type: eventType, createdAt: new Date() });
    return "new";
  } catch (err) {
    // Duplicate key => already processed
    if (isDuplicateKeyError(err)) return "duplicate";
    throw err;
  }
}

function safeTrim(s: string | null | undefined): string {
  return typeof s === "string" ? s.trim() : "";
}

function getStripe() {
  assertEnv([
    { key: "STRIPE_SECRET_KEY", hint: "Stripe secret key for server-side billing" },
    { key: "STRIPE_WEBHOOK_SECRET", hint: "Stripe webhook signing secret" },
  ]);

  return new Stripe(process.env.STRIPE_SECRET_KEY as string, {
    apiVersion: "2025-12-15.clover",
  });
}

function getPlanIdFromPriceId(priceId: string | null | undefined): "free" | "pro" {
  // If we can’t identify a price, treat as free.
  if (!priceId) return "free";

  // If you have a single paid plan, any recognized price id should be considered “pro”.
  // If STRIPE_PRICE_PRO_MONTHLY is not set, still treat any price id as pro.
  const proMonthly = process.env.STRIPE_PRICE_PRO_MONTHLY;
  if (!proMonthly) return "pro";

  // If you later add annual pricing, extend this mapping.
  return priceId === proMonthly ? "pro" : "pro";
}

async function findUserForEvent(event: Stripe.Event): Promise<UserDocument | null> {
  // Priority 1: metadata userId (we set this on checkout session + customer)
  const obj = event.data.object as unknown;

  const userId =
    (obj as { metadata?: Record<string, string> })?.metadata?.userId ||
    (obj as { client_reference_id?: string | null })?.client_reference_id ||
    null;

  if (userId) {
    const byId = await User.findById(userId);
    if (byId) return byId;
  }

  // Priority 2: customer id → user.stripeCustomerId
  const customerId = (obj as { customer?: string | Stripe.Customer | null })?.customer;
  const customerIdStr = typeof customerId === "string" ? customerId : customerId?.id;

  if (customerIdStr) {
    const byCustomer = await User.findOne({ stripeCustomerId: customerIdStr } as never);
    if (byCustomer) return byCustomer;
  }

  return null;
}

async function updateUserSubscriptionFromSubscription(
  user: UserDocument,
  subscription: Stripe.Subscription,
) {
  const firstItem = subscription.items?.data?.[0];
  const priceId = firstItem?.price?.id ?? null;

  const planId = getPlanIdFromPriceId(priceId);
  const status = subscription.status;

  const normalizedStatus: "active" | "trialing" | "past_due" | "canceled" =
    status === "active"
      ? "active"
      : status === "trialing"
        ? "trialing"
        : status === "past_due" ||
            status === "unpaid" ||
            status === "paused" ||
            status === "incomplete" ||
            status === "incomplete_expired"
          ? "past_due"
          : "canceled";

  const u = user as unknown as {
    subscriptionStatus?: string | null;
    stripeSubscriptionId?: string | null;
    stripeCustomerId?: string | null;
    subscriptionPlanId?: string;
    save: () => Promise<unknown>;
  };

  // NOTE: Our User schema does NOT allow "free" in subscriptionStatus.
  // Free users are represented by subscriptionPlanId="free" and subscriptionStatus=null.
  if (normalizedStatus === "canceled") {
    u.subscriptionStatus = null;
    u.subscriptionPlanId = "free";
    u.stripeSubscriptionId = null;
  } else {
    u.subscriptionStatus = planId === "free" ? null : normalizedStatus;
    u.subscriptionPlanId = planId;
    u.stripeSubscriptionId = subscription.id;
  }

  // Ensure we persist customer id if present
  if (typeof subscription.customer === "string") {
    u.stripeCustomerId = subscription.customer;
  }

  await u.save();
}

export async function POST(req: NextRequest) {
  const headers = buildHeaders();

  try {
    const stripe = getStripe();

    const sig = safeTrim(req.headers.get("stripe-signature"));
    if (!sig) {
      return jsonErr("Missing stripe-signature header", 400, "BAD_REQUEST", { headers });
    }

    // Stripe sends JSON; we still must verify the signature using the raw body.
    const contentType = safeTrim(req.headers.get("content-type"));
    if (contentType && !contentType.toLowerCase().includes("application/json")) {
      return jsonErr("Unsupported Content-Type", 415, "UNSUPPORTED_MEDIA_TYPE", { headers });
    }

    const rawBody = await req.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BODY_BYTES) {
      return jsonErr("Payload too large", 413, "PAYLOAD_TOO_LARGE", { headers });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET as string,
      );
    } catch (err) {
      console.error("Stripe webhook signature verification failed:", safeErrorMessage(err));
      return jsonErr("Invalid signature", 400, "BAD_REQUEST", { headers });
    }

    // Fast ignore: only handle events we explicitly support.
    if (!ALLOWED_EVENT_TYPES.has(event.type)) {
      return jsonOk({ received: true, ignored: true }, { headers });
    }

    await connectToDatabase();
    await ensureWebhookIndexes();

    // Idempotency: drop duplicate deliveries.
    const processed = await markEventProcessed(event.id, event.type);
    if (processed === "duplicate") {
      return jsonOk({ received: true, duplicate: true }, { headers });
    }

    // Handle only the events we care about.
    switch (event.type) {
      case "checkout.session.completed": {
        // On completion, Stripe will also emit subscription events; we can use this to backfill customer id.
        const session = event.data.object as Stripe.Checkout.Session;

        const user = await findUserForEvent(event);
        if (!user) break;

        const u = user as unknown as {
          stripeCustomerId?: string | null;
          save: () => Promise<unknown>;
        };

        if (!u.stripeCustomerId && typeof session.customer === "string") {
          u.stripeCustomerId = session.customer;
          await u.save();
        }

        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;

        const user = await findUserForEvent(event);
        if (!user) break;

        await updateUserSubscriptionFromSubscription(user, subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;

        // Try the usual lookup first (metadata userId or customerId).
        let user = await findUserForEvent(event);

        // Fallback: if metadata/customer mapping is missing, try by stored subscription id.
        if (!user) {
          user = await User.findOne({ stripeSubscriptionId: subscription.id } as never);
        }

        if (!user) break;

        // Treat deletion as a downgrade to free.
        const u = user as unknown as {
          subscriptionStatus?: string | null;
          stripeSubscriptionId?: string | null;
          subscriptionPlanId?: string;
          save: () => Promise<unknown>;
        };

        u.subscriptionStatus = null;
        u.subscriptionPlanId = "free";
        u.stripeSubscriptionId = null;

        await u.save();
        break;
      }

      case "invoice.payment_failed": {
        // Optional: mark user as past_due if you want strict gating.
        // Stripe's TS types vary; treat invoice as unknown and safely pluck customer/subscription.
        const invoiceObj = event.data.object as unknown;

        const customerIdRaw = (invoiceObj as { customer?: unknown })?.customer;
        const customerId =
          typeof customerIdRaw === "string"
            ? customerIdRaw
            : (customerIdRaw as { id?: string } | null)?.id;

        const subscriptionIdRaw = (invoiceObj as { subscription?: unknown })?.subscription;
        const subscriptionId =
          typeof subscriptionIdRaw === "string"
            ? subscriptionIdRaw
            : (subscriptionIdRaw as { id?: string } | null)?.id;

        // Best effort: if we can fetch the subscription, update the user's persisted status.
        if (subscriptionId) {
          try {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            const user =
              (await User.findOne({ stripeCustomerId: customerId ?? null } as never)) ||
              (await User.findOne({ stripeSubscriptionId: subscription.id } as never));

            if (user) {
              await updateUserSubscriptionFromSubscription(user, subscription);
            }
          } catch (err) {
            console.error(
              "Stripe subscription retrieve failed (invoice.payment_failed):",
              safeErrorMessage(err),
            );
          }
        }

        break;
      }

      case "invoice.payment_succeeded":
      case "invoice.paid": {
        // If the user was past_due, payment success should generally restore them.
        const invoiceObj = event.data.object as unknown;

        const customerIdRaw = (invoiceObj as { customer?: unknown })?.customer;
        const customerId =
          typeof customerIdRaw === "string"
            ? customerIdRaw
            : (customerIdRaw as { id?: string } | null)?.id;

        const subscriptionIdRaw = (invoiceObj as { subscription?: unknown })?.subscription;
        const subscriptionId =
          typeof subscriptionIdRaw === "string"
            ? subscriptionIdRaw
            : (subscriptionIdRaw as { id?: string } | null)?.id;

        if (subscriptionId) {
          try {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            const user =
              (await User.findOne({ stripeCustomerId: customerId ?? null } as never)) ||
              (await User.findOne({ stripeSubscriptionId: subscription.id } as never));

            if (user) {
              await updateUserSubscriptionFromSubscription(user, subscription);
            }
          } catch (err) {
            console.error(
              "Stripe subscription retrieve failed (invoice.payment_succeeded/invoice.paid):",
              safeErrorMessage(err),
            );
          }
        }

        break;
      }

      default:
        // ignore other event types
        break;
    }

    // Stripe only needs a 2xx.
    return jsonOk({ received: true }, { headers });
  } catch (error) {
    console.error("POST /api/billing/webhook error:", safeErrorMessage(error));
    // Stripe will retry on 5xx; return 500 only for truly unexpected failures.
    return jsonErr("Webhook handler failed", 500, "INTERNAL_ERROR", { headers });
  }
}
