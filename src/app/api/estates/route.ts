// src/app/api/estates/route.ts
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { connectToDatabase, serializeMongoDoc } from "@/lib/db";
import { Estate } from "@/models/Estate";
import { User } from "@/models/User";
import { logEstateEvent } from "@/lib/estateEvents";
import {
  jsonErr,
  jsonOk,
  noStoreHeaders,
  safeErrorMessage,
} from "@/lib/apiResponse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CreateEstateBody = Partial<{
  displayName: string;
  name: string;
  estateName: string;
  caseNumber: string;
  courtCaseNumber: string;
  status: "OPEN" | "CLOSED" | string;
  county: string;
  jurisdiction: string;
  decedentName: string;
  decedentDateOfDeath: string;
  notes: string;
}>;

function headersNoStore(): Headers {
  // normalize HeadersInit -> Headers so we can safely mutate
  return new Headers(noStoreHeaders());
}

function addSecurityHeaders(headers: Headers) {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "same-origin");
  headers.set("X-Frame-Options", "DENY");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  );
}

function isProd(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production" ||
    Boolean(process.env.VERCEL)
  );
}

function normalizeStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function getUserPlanSnapshot(user: unknown): {
  planId: "free" | "pro";
  status: string | null;
  isPro: boolean;
} {
  const rawPlanId = (user as { subscriptionPlanId?: unknown })?.subscriptionPlanId;
  const rawStatus = (user as { subscriptionStatus?: unknown })?.subscriptionStatus;

  const planIdRaw = normalizeStr(rawPlanId).toLowerCase();
  const status = normalizeStr(rawStatus).toLowerCase() || null;

  // IMPORTANT:
  // - Preferred: subscriptionPlanId = "pro"
  // - Back-compat: subscriptionStatus used to store "pro"/"free"
  // - Stripe statuses: treat active-ish as Pro
  const PRO_STRIPE_STATUSES = new Set(["active", "trialing", "past_due"]);

  const isPro =
    planIdRaw === "pro" ||
    status === "pro" ||
    (status ? PRO_STRIPE_STATUSES.has(status) : false);

  return {
    planId: isPro ? "pro" : "free",
    status,
    isPro,
  };
}

const MAX_JSON_BODY_BYTES = 25_000;

async function readJsonBody(
  req: NextRequest,
  headers: Headers,
): Promise<
  | { ok: true; body: CreateEstateBody }
  | { ok: false; res: ReturnType<typeof jsonErr> }
> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return {
      ok: false,
      res: jsonErr(
        "Content-Type must be application/json",
        415,
        "UNSUPPORTED_MEDIA_TYPE",
        { headers },
      ),
    };
  }

  try {
    const raw = await req.text();
    if (raw.length > MAX_JSON_BODY_BYTES) {
      return {
        ok: false,
        res: jsonErr("Request body too large", 413, "PAYLOAD_TOO_LARGE", {
          headers,
        }),
      };
    }

    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return { ok: true, body: parsed as CreateEstateBody };
  } catch {
    return {
      ok: false,
      res: jsonErr("Invalid JSON", 400, "BAD_REQUEST", { headers }),
    };
  }
}

/**
 * GET /api/estates
 * List estates owned by the logged-in user
 */
export async function GET() {
  const headers = headersNoStore();
  addSecurityHeaders(headers);

  const session = await auth();
  if (!session?.user?.id) {
    return jsonErr("Unauthorized", 401, "UNAUTHORIZED", { headers });
  }

  try {
    await connectToDatabase();

    // IMPORTANT: scope to ownerId (Estate.ownerId is a string)
    const estatesRaw = await Estate.find({ ownerId: session.user.id })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    const estates = estatesRaw.map((e) => serializeMongoDoc(e));

    return jsonOk({ estates }, { headers });
  } catch (error) {
    console.error("[GET /api/estates] Error:", safeErrorMessage(error));
    return jsonErr("Failed to fetch estates", 500, "INTERNAL_ERROR", {
      headers,
    });
  }
}

/**
 * POST /api/estates
 * Create a new estate owned by the logged-in user
 */
export async function POST(req: NextRequest) {
  const headers = headersNoStore();
  addSecurityHeaders(headers);

  const session = await auth();
  if (!session?.user?.id) {
    return jsonErr("Unauthorized", 401, "UNAUTHORIZED", { headers });
  }

  const parsed = await readJsonBody(req, headers);
  if (!parsed.ok) return parsed.res;

  const body = parsed.body;

  try {
    await connectToDatabase();

    // --- Billing enforcement ---
    // Free plan: 1 estate max. Pro plan: unlimited.
    // We treat a user as "Pro" if either:
    // - subscriptionPlanId is "pro" (preferred)
    // - OR subscriptionStatus is one of Stripe's active-ish statuses
    // - OR legacy back-compat: subscriptionStatus was historically set to "pro"
    const user = await User.findById(session.user.id).lean().exec();
    if (!user) {
      return jsonErr("User not found", 404, "NOT_FOUND", { headers });
    }

    const plan = getUserPlanSnapshot(user);

    if (!plan.isPro) {
      const estateCount = await Estate.countDocuments({ ownerId: session.user.id });
      if (estateCount >= 1) {
        return NextResponse.json(
          {
            ok: false,
            error: "Free plan supports 1 estate. Upgrade to Pro to create more.",
            code: "PAYMENT_REQUIRED",
            data: {
              upgradeUrl: "/app/billing",
              limit: 1,
              current: estateCount,
              planId: plan.planId,
              status: plan.status,
              env: isProd() ? "prod" : "dev",
            },
          },
          { status: 402, headers },
        );
      }
    }
    // --- End billing enforcement ---

    const payload = {
      ...body,
      ownerId: session.user.id,
      status: body.status ?? "OPEN",
    };

    const estateDoc = await Estate.create(payload);

    try {
      await logEstateEvent({
        ownerId: session.user.id,
        estateId: String(estateDoc._id),
        type: "ESTATE_CREATED",
        summary: "Estate created",
      });
    } catch (err) {
      console.warn("[ESTATE_CREATED] log failed:", safeErrorMessage(err));
    }

    const estate = serializeMongoDoc(estateDoc);
    return jsonOk({ estate }, { headers, status: 201 });
  } catch (error) {
    console.error("[POST /api/estates] Error:", safeErrorMessage(error));
    return jsonErr("Failed to create estate", 500, "INTERNAL_ERROR", {
      headers,
    });
  }
}