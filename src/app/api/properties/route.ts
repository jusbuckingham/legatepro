// src/app/api/properties/route.ts
// Estate properties API for LegatePro

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

import { auth } from "@/lib/auth";
import { connectToDatabase, serializeMongoDoc } from "@/lib/db";
import { Estate } from "@/models/Estate";
import { EstateProperty } from "@/models/EstateProperty";
import { User } from "@/models/User";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function headersNoStore(): HeadersInit {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    // Basic hardening headers (safe for JSON API responses)
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "X-Frame-Options": "DENY",
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  };
}

function json(resBody: unknown, status = 200) {
  return NextResponse.json(resBody, { status, headers: headersNoStore() });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanString(value: unknown, maxLen = 256): string | undefined {
  if (typeof value !== "string") return undefined;
  const s = value.trim();
  if (!s) return undefined;
  const capped = s.length > maxLen ? s.slice(0, maxLen) : s;
  return capped;
}

function toOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function assertNonNegativeNumber(
  name: string,
  raw: unknown,
  parsed: number | undefined,
): { ok: true } | { ok: false; res: ReturnType<typeof json> } {
  if (raw === undefined || raw === null || raw === "") return { ok: true };
  if (parsed === undefined) {
    return {
      ok: false,
      res: json({ ok: false, error: `${name} must be a number` }, 400),
    };
  }
  if (parsed < 0) {
    return {
      ok: false,
      res: json({ ok: false, error: `${name} must be >= 0` }, 400),
    };
  }
  return { ok: true };
}

// Helpers
function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (s === "true" || s === "1") return true;
    if (s === "false" || s === "0") return false;
  }
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return undefined;
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isValidObjectId(value: string): boolean {
  return mongoose.Types.ObjectId.isValid(value);
}
function cleanObjectId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const s = value.trim();
  if (!s) return undefined;
  // ObjectIds must be exactly 24 hex chars. Reject anything longer/shorter.
  if (s.length !== 24) return undefined;
  return isValidObjectId(s) ? s : undefined;
}

async function assertEstateOwnedByUser(params: {
  estateId: string;
  ownerId: string;
}): Promise<{ ok: true } | { ok: false; res: ReturnType<typeof json> }> {
  const { estateId, ownerId } = params;

  const cleaned = cleanObjectId(estateId);
  if (!cleaned) {
    return {
      ok: false,
      res: json({ ok: false, error: "Invalid estateId" }, 400),
    };
  }

  const estate = await Estate.findOne({ _id: cleaned, ownerId })
    .select({ _id: 1 })
    .lean()
    .exec();
  if (!estate) {
    // Avoid leaking existence of other users' estates.
    return {
      ok: false,
      res: json({ ok: false, error: "Estate not found" }, 404),
    };
  }

  return { ok: true };
}

function isProUser(user: unknown): boolean {
  const rawPlanId = (user as { subscriptionPlanId?: unknown }).subscriptionPlanId;
  const rawStatus = (user as { subscriptionStatus?: unknown }).subscriptionStatus;

  const planId = typeof rawPlanId === "string" ? rawPlanId.toLowerCase() : "";
  const status = typeof rawStatus === "string" ? rawStatus.toLowerCase() : "";

  // Stripe "active-ish" statuses we treat as Pro.
  const PRO_STATUSES = new Set(["active", "trialing", "past_due"]);

  // Back-compat: some legacy code stored "pro" in subscriptionStatus.
  return planId === "pro" || status === "pro" || PRO_STATUSES.has(status);
}

// GET /api/properties
// Optional query params:
//   estateId: string            -> filter by estate
//   isRented: "true" | "false"  -> filter by rental status
//   city: string                -> filter by city (case-insensitive)
//   state: string               -> filter by state (exact match)
//   q: string                   -> search by nickname, address, or notes
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const ownerId = session?.user?.id;

    if (!ownerId) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    const { searchParams } = new URL(request.url);
    const estateIdRaw = (searchParams.get("estateId") ?? "").trim();

    // Validate estateId early to avoid unnecessary DB work.
    const estateId = estateIdRaw ? cleanObjectId(estateIdRaw) : null;
    if (estateIdRaw && !estateId) {
      return json({ ok: false, error: "Invalid estateId" }, 400);
    }

    await connectToDatabase();

    if (estateId) {
      const check = await assertEstateOwnedByUser({ estateId, ownerId });
      if (!check.ok) return check.res;
    }

    const isRentedParam = (searchParams.get("isRented") ?? "").trim();
    const cityRaw = (searchParams.get("city") ?? "").trim();
    const stateRaw = (searchParams.get("state") ?? "").trim();
    const qRaw = (searchParams.get("q") ?? "").trim();

    // Prevent unbounded regex / payload sizes
    const city = cityRaw.slice(0, 128);
    const state = stateRaw.slice(0, 64).toUpperCase();
    const q = qRaw.slice(0, 256);

    const citySafe = city ? escapeRegex(city) : "";
    const qSafe = q ? escapeRegex(q) : "";

    const filter: Record<string, unknown> = { ownerId };

    if (estateId) {
      filter.estateId = estateId;
    }

    if (isRentedParam === "true") {
      filter.isRented = true;
    } else if (isRentedParam === "false") {
      filter.isRented = false;
    }

    if (citySafe) {
      filter.city = { $regex: citySafe, $options: "i" };
    }

    if (state) {
      filter.state = state;
    }

    if (qSafe) {
      filter.$or = [
        { nickname: { $regex: qSafe, $options: "i" } },
        { streetAddress: { $regex: qSafe, $options: "i" } },
        { city: { $regex: qSafe, $options: "i" } },
        { notes: { $regex: qSafe, $options: "i" } },
      ];
    }

    const propertiesRaw = await EstateProperty.find(filter)
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    const properties = propertiesRaw.map((p) => serializeMongoDoc(p));

    return json({ ok: true, properties }, 200);
  } catch (error) {
    console.error("GET /api/properties error", error);
    return json({ ok: false, error: "Unable to load properties" }, 500);
  }
}

// POST /api/properties
// Creates a new estate property
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const ownerId = session?.user?.id;

    if (!ownerId) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return json(
        { ok: false, error: "Content-Type must be application/json" },
        415,
      );
    }

    let body: unknown = null;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400);
    }

    if (!isPlainObject(body)) {
      return json({ ok: false, error: "Request body must be a JSON object" }, 400);
    }

    const estateId = cleanObjectId(body.estateId);
    const nickname = cleanString(body.nickname, 128);
    const streetAddress = cleanString(body.streetAddress, 256);
    const unit = cleanString(body.unit, 32);
    const city = cleanString(body.city, 128);
    const state = cleanString(body.state, 64)?.toUpperCase();
    const postalCode = cleanString(body.postalCode, 32);
    const propertyType = cleanString(body.propertyType, 64);
    const notes = cleanString(body.notes, 2000);

    const isPrimaryResidenceRaw = body.isPrimaryResidence;
    const isRentedRaw = body.isRented;
    const purchasePriceRaw = body.purchasePrice;
    const estimatedValueRaw = body.estimatedValue;

    if (!estateId) {
      return json({ ok: false, error: "estateId is required" }, 400);
    }

    if (!nickname && !streetAddress) {
      return json(
        { ok: false, error: "Provide at least a nickname or a streetAddress" },
        400,
      );
    }

    const purchasePriceNum = toOptionalNumber(purchasePriceRaw);
    const estimatedValueNum = toOptionalNumber(estimatedValueRaw);

    const purchaseCheck = assertNonNegativeNumber("purchasePrice", purchasePriceRaw, purchasePriceNum);
    if (!purchaseCheck.ok) return purchaseCheck.res;

    const estimateCheck = assertNonNegativeNumber("estimatedValue", estimatedValueRaw, estimatedValueNum);
    if (!estimateCheck.ok) return estimateCheck.res;

    const parsedIsPrimaryResidence = parseOptionalBoolean(isPrimaryResidenceRaw);
    const parsedIsRented = parseOptionalBoolean(isRentedRaw);

    await connectToDatabase();

    // --- Billing enforcement (best-effort) ---
    // Free plan supports 1 estate max. If a legacy account already has multiple estates,
    // block creating additional properties until they upgrade.
    const user = await User.findById(ownerId)
      .select({ subscriptionPlanId: 1, subscriptionStatus: 1 })
      .lean()
      .exec();

    const pro = user ? isProUser(user) : false;
    if (!pro) {
      const estateCount = await Estate.countDocuments({ ownerId });
      if (estateCount > 1) {
        return json(
          {
            ok: false,
            error:
              "This account exceeds the free plan limit (1 estate). Upgrade to Pro to continue.",
            code: "PAYMENT_REQUIRED",
          },
          402,
        );
      }
    }
    // --- End billing enforcement ---

    const check = await assertEstateOwnedByUser({ estateId, ownerId });
    if (!check.ok) return check.res;

    const propertyDoc = await EstateProperty.create({
      ownerId,
      estateId,
      nickname,
      streetAddress,
      unit,
      city,
      state,
      postalCode,
      propertyType,
      isPrimaryResidence: parsedIsPrimaryResidence,
      isRented: parsedIsRented,
      purchasePrice: purchasePriceNum,
      estimatedValue: estimatedValueNum,
      notes,
    });

    const property = serializeMongoDoc(propertyDoc);

    return json({ ok: true, property }, 201);
  } catch (error) {
    console.error("POST /api/properties error", error);
    return json({ ok: false, error: "Unable to create property" }, 500);
  }
}
