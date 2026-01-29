// src/app/api/estates/route.ts
import { NextRequest } from "next/server";

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

/* --------------------------------- helpers -------------------------------- */

function headersNoStore(): Headers {
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

/* ----------------------------------- GET ---------------------------------- */

export async function GET(req: NextRequest) {
  const headers = headersNoStore();
  addSecurityHeaders(headers);

  const session = await auth();
  if (!session?.user?.id) {
    return jsonErr("Unauthorized", 401, "UNAUTHORIZED", { headers });
  }

  const url = new URL(req.url);
  const compactParam = url.searchParams.get("compact");
  const limitParam = url.searchParams.get("limit");
  const statusParam = url.searchParams.get("status");

  const compact = compactParam === "1" || compactParam === "true";
  let limit = 500;
  if (limitParam !== null) {
    const parsedLimit = parseInt(limitParam, 10);
    if (!isNaN(parsedLimit)) {
      limit = Math.min(Math.max(parsedLimit, 1), 1000);
    }
  }
  const statusFilter = (statusParam ?? "all").toLowerCase();

  try {
    await connectToDatabase();

    const query: Record<string, unknown> = { ownerId: session.user.id };
    if (statusFilter === "open") {
      query.status = "OPEN";
    } else if (statusFilter === "closed") {
      query.status = "CLOSED";
    }

    const estatesRaw = (await Estate.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec()) as unknown[];

    const asRecord = (v: unknown): Record<string, unknown> =>
      v && typeof v === "object" ? (v as Record<string, unknown>) : {};

    const asStringOrNull = (v: unknown): string | null => {
      if (typeof v !== "string") return null;
      const s = v.trim();
      return s ? s : null;
    };

    const idToString = (id: unknown): string => {
      if (typeof id === "string") return id;
      if (typeof id === "number") return String(id);
      if (id && typeof id === "object" && "toString" in id) {
        const fn = (id as { toString?: unknown }).toString;
        if (typeof fn === "function") {
          const out = fn.call(id);
          if (typeof out === "string") return out;
        }
      }
      return String(id ?? "");
    };

    const estateCompact = (e: unknown) => {
      const rec = asRecord(e);
      const displayName =
        asStringOrNull(rec.displayName) ??
        asStringOrNull(rec.name) ??
        asStringOrNull(rec.estateName) ??
        "";

      return {
        _id: idToString(rec._id),
        displayName,
        status: asStringOrNull(rec.status),
        caseNumber: asStringOrNull(rec.caseNumber) ?? asStringOrNull(rec.courtCaseNumber),
        decedentName: asStringOrNull(rec.decedentName),
        county: asStringOrNull(rec.county),
        jurisdiction: asStringOrNull(rec.jurisdiction),
        updatedAt: rec.updatedAt ?? null,
      };
    };

    if (!compact) {
      return jsonOk(
        { estates: estatesRaw.map(serializeMongoDoc) },
        { headers },
      );
    } else {
      return jsonOk(
        {
          estates: estatesRaw.map(estateCompact),
        },
        { headers },
      );
    }
  } catch (error) {
    console.error("[GET /api/estates]", safeErrorMessage(error));
    return jsonErr("Failed to fetch estates", 500, "INTERNAL_ERROR", { headers });
  }
}

/* ----------------------------------- POST --------------------------------- */

export async function POST(req: NextRequest) {
  const headers = headersNoStore();
  addSecurityHeaders(headers);

  const session = await auth();
  if (!session?.user?.id) {
    return jsonErr("Unauthorized", 401, "UNAUTHORIZED", { headers });
  }

  const parsed = await readJsonBody(req, headers);
  if (!parsed.ok) return parsed.res;

  try {
    await connectToDatabase();

    const user = await User.findById(session.user.id).lean().exec();
    if (!user) {
      return jsonErr("User not found", 404, "NOT_FOUND", { headers });
    }

    const plan = getUserPlanSnapshot(user);

    if (!plan.isPro) {
      const estateCount = await Estate.countDocuments({
        ownerId: session.user.id,
      }).exec();

      if (estateCount >= 1) {
        headers.set("X-LegatePro-Upgrade-Url", "/app/billing");
        headers.set("X-LegatePro-Plan-Id", plan.planId);
        headers.set("X-LegatePro-Plan-Limit", "1");
        headers.set("X-LegatePro-Plan-Current", String(estateCount));
        if (plan.status) {
          headers.set("X-LegatePro-Subscription-Status", plan.status);
        }

        return jsonErr(
          "Free plan supports 1 estate. Upgrade to Pro to create more.",
          402,
          "PAYMENT_REQUIRED",
          { headers },
        );
      }
    }

    const estateDoc = await Estate.create({
      ...parsed.body,
      ownerId: session.user.id,
      status: parsed.body.status ?? "OPEN",
    });

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
    // Return a 201 Created with our no-store + security headers.
    headers.set("Content-Type", "application/json; charset=utf-8");

    return new Response(
      JSON.stringify({ ok: true, estate: serializeMongoDoc(estateDoc) }),
      {
        status: 201,
        headers,
      },
    );
  } catch (error) {
    console.error("[POST /api/estates]", safeErrorMessage(error));
    return jsonErr("Failed to create estate", 500, "INTERNAL_ERROR", { headers });
  }
}