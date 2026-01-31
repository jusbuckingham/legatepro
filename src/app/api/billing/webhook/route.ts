// src/app/api/billing/webhook/route.ts
// Stripe webhook handler (authoritative source of subscription status)
// - Verifies Stripe signature using raw request body
// - Idempotent processing (stores processed Stripe event IDs)
// - Updates User.subscriptionStatus + User.subscriptionPlanId

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import mongoose from "mongoose";

import { connectToDatabase } from "@/lib/db";
import { assertEnv } from "@/lib/assertEnv";
import { noStoreHeaders, safeErrorMessage } from "@/lib/apiResponse";
import { User } from "@/models/User";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildHeaders(): Headers {
  const h = new Headers(noStoreHeaders());
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "same-origin");
  h.set("X-Frame-Options", "DENY");
  h.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  );
  return h;
}

function json(
  body: Record<string, unknown>,
  opts: { status?: number; headers?: HeadersInit } = {},
): NextResponse {
  const headers = opts.headers ? new Headers(opts.headers) : buildHeaders();
  return NextResponse.json(body, { status: opts.status ?? 200, headers });
}

function getStripe(): Stripe {
  assertEnv([
    { key: "STRIPE_SECRET_KEY", hint: "Stripe secret key for webhook verification" },
    { key: "STRIPE_WEBHOOK_SECRET", hint: "Stripe webhook signing secret" },
  ]);

  return new Stripe(process.env.STRIPE_SECRET_KEY as string, {
    apiVersion: "2025-12-15.clover",
  });
}

// --- Minimal persistence for idempotency ---
const StripeWebhookEventSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // Stripe event id
    type: { type: String, required: true },
    created: { type: Number, required: true },
    livemode: { type: Boolean, required: true },
    processedAt: { type: Date, required: true },
    objectId: { type: String, required: false },
  },
  { collection: "stripe_webhook_events", versionKey: false },
);

type StripeWebhookEventDoc = mongoose.InferSchemaType<typeof StripeWebhookEventSchema>;

function StripeWebhookEventModel(): mongoose.Model<StripeWebhookEventDoc> {
  return (
    (mongoose.models.StripeWebhookEvent as mongoose.Model<StripeWebhookEventDoc> | undefined) ??
    mongoose.model<StripeWebhookEventDoc>("StripeWebhookEvent", StripeWebhookEventSchema)
  );
}

async function alreadyProcessed(eventId: string): Promise<boolean> {
  const Model = StripeWebhookEventModel();
  const existing = await Model.findById(eventId).select({ _id: 1 }).lean().exec();
  return Boolean(existing);
}

async function markProcessed(params: {
  eventId: string;
  type: string;
  created: number;
  livemode: boolean;
  objectId?: string | null;
}): Promise<void> {
  const Model = StripeWebhookEventModel();

  // Upsert to avoid race-condition duplicates under concurrent deliveries.
  await Model.updateOne(
    { _id: params.eventId },
    {
      $setOnInsert: {
        _id: params.eventId,
        type: params.type,
        created: params.created,
        livemode: params.livemode,
        processedAt: new Date(),
        objectId: params.objectId ?? undefined,
      },
    },
    { upsert: true },
  ).exec();
}

function cleanString(value: unknown, maxLen = 256): string | undefined {
  if (typeof value !== "string") return undefined;
  const s = value.trim();
  if (!s) return undefined;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function normalizeStatus(status: string | null | undefined): string | null {
  if (!status) return null;
  return String(status).toLowerCase();
}

function isProStatus(status: string | null | undefined): boolean {
  const s = normalizeStatus(status);
  // Treat these as "paid/allowed" states.
  // Everything else (canceled, unpaid, incomplete, etc.) should be considered free.
  return s === "active" || s === "trialing" || s === "past_due";
}

function inferPlanIdFromSubscription(subscription: Stripe.Subscription): "pro" | "free" {
  // Only allow Pro when the subscription is in an allowed state.
  if (!isProStatus(subscription.status)) return "free";

  const proPriceId = cleanString(process.env.STRIPE_PRICE_PRO_MONTHLY, 200);
  const items = subscription.items?.data ?? [];
  const priceIds = items.map((i) => i.price?.id).filter(Boolean) as string[];

  if (proPriceId && priceIds.includes(proPriceId)) return "pro";

  // If price id isn't configured yet, still default to free (safer).
  return "free";
}

async function updateUserSubscription(params: {
  userId?: string | null;
  stripeCustomerId?: string | null;
  subscriptionStatus: string | null;
  planId: "pro" | "free";
}): Promise<void> {
  const { userId, stripeCustomerId, subscriptionStatus, planId } = params;

  const query: Record<string, unknown> = {};
  if (userId) query._id = userId;
  else if (stripeCustomerId) query.stripeCustomerId = stripeCustomerId;

  if (!Object.keys(query).length) return;

  const set: Record<string, unknown> = {
    subscriptionPlanId: planId,
    subscriptionStatus,
  };

  // If we know the Stripe customer id, store it so future webhook events can match.
  if (stripeCustomerId) {
    set.stripeCustomerId = stripeCustomerId;
  }

  await User.updateOne(query, { $set: set }).exec();
}

async function handleCheckoutSessionCompleted(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const userId = cleanString(session.metadata?.userId, 64) ?? null;
  const stripeCustomerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;

  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const status = normalizeStatus(subscription.status);
  const planId = inferPlanIdFromSubscription(subscription);

  await updateUserSubscription({ userId, stripeCustomerId, subscriptionStatus: status, planId });
}

async function handleSubscriptionChange(subscription: Stripe.Subscription): Promise<void> {
  const stripeCustomerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id ?? null;

  const status = normalizeStatus(subscription.status);
  const planId = inferPlanIdFromSubscription(subscription);

  await updateUserSubscription({
    stripeCustomerId,
    subscriptionStatus: status,
    planId,
  });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const stripeCustomerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id ?? null;

  await updateUserSubscription({
    stripeCustomerId,
    subscriptionStatus: "canceled",
    planId: "free",
  });
}

const HANDLED_EVENT_TYPES = new Set<string>([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

export async function POST(request: NextRequest): Promise<Response> {
  const headers = buildHeaders();

  try {
    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      return json({ ok: false, error: "Missing Stripe signature" }, { status: 400, headers });
    }

    const contentType = request.headers.get("content-type") ?? "";
    // Stripe typically sends application/json; tolerate charset variants.
    if (contentType && !contentType.toLowerCase().includes("application/json")) {
      // Don’t hard-fail: some proxies can rewrite content-type. We only warn.
      console.warn("[stripe:webhook] unexpected content-type:", contentType);
    }

    const rawBodyBuffer = Buffer.from(await request.arrayBuffer());
    const stripe = getStripe();
    const secret = process.env.STRIPE_WEBHOOK_SECRET as string;

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBodyBuffer, signature, secret);
    } catch (err) {
      console.warn("[stripe:webhook] signature verification failed:", safeErrorMessage(err));
      return json({ ok: false, error: "Invalid signature" }, { status: 400, headers });
    }

    if (!event?.id || !event?.type) {
      return json({ ok: false, error: "Malformed event" }, { status: 400, headers });
    }

    await connectToDatabase();

    if (await alreadyProcessed(event.id)) {
      return json({ ok: true, received: true, duplicate: true }, { status: 200, headers });
    }

    // If it's an event we don't care about, still mark as processed to reduce retries.
    if (!HANDLED_EVENT_TYPES.has(event.type)) {
      const objectId =
        typeof (event.data.object as { id?: unknown })?.id === "string"
          ? String((event.data.object as { id: string }).id)
          : null;

      await markProcessed({
        eventId: event.id,
        type: event.type,
        created: event.created,
        livemode: event.livemode,
        objectId,
      });

      return json({ ok: true, received: true, ignored: true }, { status: 200, headers });
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          await handleCheckoutSessionCompleted(stripe, session);
          break;
        }
        case "customer.subscription.created":
        case "customer.subscription.updated": {
          const subscription = event.data.object as Stripe.Subscription;
          await handleSubscriptionChange(subscription);
          break;
        }
        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          await handleSubscriptionDeleted(subscription);
          break;
        }
        default:
          break;
      }

      const objectId =
        typeof (event.data.object as { id?: unknown })?.id === "string"
          ? String((event.data.object as { id: string }).id)
          : null;

      await markProcessed({
        eventId: event.id,
        type: event.type,
        created: event.created,
        livemode: event.livemode,
        objectId,
      });

      return json({ ok: true, received: true }, { status: 200, headers });
    } catch (err) {
      console.error("[stripe:webhook] handler error:", safeErrorMessage(err));
      return json({ ok: false, error: "Webhook handler error" }, { status: 500, headers });
    }
  } catch (error) {
    console.error("[stripe:webhook] unexpected error:", safeErrorMessage(error));
    return json({ ok: false, error: "Webhook error" }, { status: 500, headers });
  }
}