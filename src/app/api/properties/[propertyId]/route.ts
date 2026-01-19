import { NextRequest, NextResponse } from "next/server";
import { isValidObjectId } from "mongoose";

import { auth } from "@/lib/auth";
import { connectToDatabase, serializeMongoDoc } from "@/lib/db";

import { noStoreHeaders, safeErrorMessage } from "@/lib/apiResponse";
import { Estate } from "@/models/Estate";
import { EstateProperty } from "@/models/EstateProperty";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function buildHeaders(): Headers {
  const h = new Headers(noStoreHeaders());
  // Basic hardening headers
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "same-origin");
  h.set("X-Frame-Options", "DENY");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), interest-cohort=()");
  return h;
}

function json(
  body: Record<string, unknown>,
  opts: { status: number; headers?: HeadersInit } = { status: 200 },
): NextResponse {
  const headers = opts.headers ? new Headers(opts.headers) : buildHeaders();
  return NextResponse.json(body, { status: opts.status, headers });
}

function cleanString(value: unknown, maxLen = 256): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed.length) return undefined;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

function cleanEmail(value: unknown, maxLen = 320): string | undefined {
  const v = cleanString(value, maxLen);
  return v ? v.toLowerCase() : undefined;
}

function cleanPhone(value: unknown, maxLen = 32): string | undefined {
  // keep digits + common separators; clamp length
  const v = cleanString(value, maxLen);
  if (!v) return undefined;
  const cleaned = v.replace(/[^0-9+()\- .]/g, "");
  return cleaned.length ? cleaned : undefined;
}

function cleanNumber(value: unknown, opts?: { min?: number; max?: number }): number | undefined {
  let n: number | undefined;

  if (typeof value === "number" && Number.isFinite(value)) n = value;
  if (n === undefined && typeof value === "string" && value.trim().length) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) n = parsed;
  }

  if (n === undefined) return undefined;

  const min = opts?.min;
  const max = opts?.max;
  if (typeof min === "number" && n < min) return min;
  if (typeof max === "number" && n > max) return max;
  return n;
}


function cleanObjectId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const s = value.trim();
  if (!s) return undefined;
  if (s.length != 24) return undefined;
  return isValidObjectId(s) ? s : undefined;
}

const MAX_JSON_BODY_BYTES = 25_000;

async function readJsonObject(
  request: NextRequest,
  headers: Headers,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; res: NextResponse }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return {
      ok: false,
      res: json({ ok: false, error: "Content-Type must be application/json" }, { status: 415, headers }),
    };
  }

  try {
    const raw = await request.text();
    if (raw.length > MAX_JSON_BODY_BYTES) {
      return {
        ok: false,
        res: json({ ok: false, error: "Request body too large" }, { status: 413, headers }),
      };
    }

    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        ok: false,
        res: json({ ok: false, error: "Invalid JSON" }, { status: 400, headers }),
      };
    }

    return { ok: true, body: parsed as Record<string, unknown> };
  } catch {
    return {
      ok: false,
      res: json({ ok: false, error: "Invalid JSON" }, { status: 400, headers }),
    };
  }
}


interface UpdatePropertyPayload {
  estateId: string;
  label?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  monthlyRentTarget?: number;
  notes?: string;
  tenantName?: string;
  tenantPhone?: string;
  tenantEmail?: string;
  tenantNotes?: string;
}

async function assertEstateOwner(estateId: string, userId: string): Promise<boolean> {
  const estate = await Estate.findOne({ _id: estateId, ownerId: userId })
    .select({ _id: 1 })
    .lean()
    .exec();
  return Boolean(estate);
}

async function getPropertyAndVerifyOwner(
  propertyId: string,
  userId: string,
  estateId?: string,
): Promise<ReturnType<typeof serializeMongoDoc> | null> {
  const query: Record<string, unknown> = { _id: propertyId, ownerId: userId };
  if (estateId) query.estateId = estateId;

  const property = await EstateProperty.findOne(query).lean().exec();
  if (!property) return null;

  const propEstateId = String((property as unknown as { estateId?: unknown }).estateId ?? "");
  if (!propEstateId) return null;

  const ok = await assertEstateOwner(propEstateId, userId);
  if (!ok) return null;

  return serializeMongoDoc(property);
}

/**
 * GET /api/properties/[propertyId]?estateId=...
 * Fetch a single property, optionally scoped to an estate.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ propertyId: string }> },
): Promise<Response> {
  const headers = buildHeaders();
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return json(
        { ok: false, error: "Unauthorized" },
        { status: 401, headers },
      );
    }
    const { propertyId } = await params;

    const propertyIdClean = cleanObjectId(propertyId);
    if (!propertyIdClean) {
      return json({ ok: false, error: "Invalid Property ID" }, { status: 400, headers });
    }

    const url = new URL(request.url);
    const estateIdRaw = url.searchParams.get("estateId");
    const estateId = estateIdRaw ? cleanObjectId(estateIdRaw) : undefined;
    if (estateIdRaw && !estateId) {
      return json({ ok: false, error: "Invalid Estate ID" }, { status: 400, headers });
    }

    await connectToDatabase();

    // If estateId is provided, we enforce it AND enforce ownership.
    // Return 404 for any mismatch to avoid leaking existence.
    if (estateId) {
      const ok = await assertEstateOwner(estateId, session.user.id);
      if (!ok) {
        return json({ ok: false, error: "Property not found" }, { status: 404, headers });
      }
    }

    const propertyOut = await getPropertyAndVerifyOwner(propertyIdClean, session.user.id, estateId);

    if (!propertyOut) {
      return json(
        { ok: false, error: "Property not found" },
        { status: 404, headers },
      );
    }

    return json({ ok: true, data: { property: propertyOut } }, { status: 200, headers });
  } catch (error) {
    console.error("Error fetching property:", safeErrorMessage(error));
    return json(
      { ok: false, error: "Failed to fetch property" },
      { status: 500, headers }
    );
  }
}

/**
 * PUT /api/properties/[propertyId]
 * Update a single property.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ propertyId: string }> },
): Promise<Response> {
  const headers = buildHeaders();
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return json(
        { ok: false, error: "Unauthorized" },
        { status: 401, headers },
      );
    }
    const { propertyId } = await params;

    const propertyIdClean = cleanObjectId(propertyId);
    if (!propertyIdClean) {
      return json({ ok: false, error: "Invalid Property ID" }, { status: 400, headers });
    }

    const parsed = await readJsonObject(request, headers);
    if (!parsed.ok) return parsed.res;

    const body = parsed.body as Partial<UpdatePropertyPayload>;

    const {
      estateId,
      label,
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
      propertyType,
      bedrooms,
      bathrooms,
      monthlyRentTarget,
      notes,
      tenantName,
      tenantPhone,
      tenantEmail,
      tenantNotes,
    } = body ?? {};

    const estateIdClean = cleanObjectId(estateId);
    if (!estateIdClean) {
      return json({ ok: false, error: "Estate ID is required" }, { status: 400, headers });
    }

    await connectToDatabase();

    const ownsEstate = await assertEstateOwner(estateIdClean, session.user.id);
    if (!ownsEstate) {
      return json(
        { ok: false, error: "Not found" },
        { status: 404, headers },
      );
    }

    const update: Record<string, unknown> = {
      label: cleanString(label, 80),
      addressLine1: cleanString(addressLine1, 120),
      addressLine2: cleanString(addressLine2, 120),
      city: cleanString(city, 80),
      state: cleanString(state, 64),
      postalCode: cleanString(postalCode, 32),
      propertyType: cleanString(propertyType, 64),
      bedrooms: cleanNumber(bedrooms, { min: 0, max: 50 }),
      bathrooms: cleanNumber(bathrooms, { min: 0, max: 50 }),
      monthlyRentTarget: cleanNumber(monthlyRentTarget, { min: 0, max: 1_000_000 }),
      notes: cleanString(notes, 5_000),
      tenantName: cleanString(tenantName, 120),
      tenantPhone: cleanPhone(tenantPhone, 32),
      tenantEmail: cleanEmail(tenantEmail, 320),
      tenantNotes: cleanString(tenantNotes, 5_000),
    };

    // Remove undefined keys so we don't overwrite with undefined
    Object.keys(update).forEach((key) => {
      if (update[key] === undefined) {
        delete update[key];
      }
    });

    const property = await EstateProperty.findOneAndUpdate(
      { _id: propertyIdClean, estateId: estateIdClean, ownerId: session.user.id },
      { $set: update },
      { new: true, runValidators: true }
    )
      .lean()
      .exec();
    const propertyOut = property ? serializeMongoDoc(property) : null;

    if (!propertyOut) {
      return json(
        { ok: false, error: "Property not found or does not belong to this estate" },
        { status: 404, headers }
      );
    }

    return json(
      { ok: true, data: { property: propertyOut } },
      { status: 200, headers }
    );
  } catch (error) {
    console.error("Error updating property:", safeErrorMessage(error));
    return json(
      { ok: false, error: "Failed to update property" },
      { status: 500, headers }
    );
  }
}

/**
 * DELETE /api/properties/[propertyId]?estateId=...
 * (Optional) Remove a property from an estate.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ propertyId: string }> },
): Promise<Response> {
  const headers = buildHeaders();
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return json(
        { ok: false, error: "Unauthorized" },
        { status: 401, headers },
      );
    }
    const { propertyId } = await params;

    const propertyIdClean = cleanObjectId(propertyId);
    if (!propertyIdClean) {
      return json({ ok: false, error: "Invalid Property ID" }, { status: 400, headers });
    }

    const url = new URL(request.url);
    const estateIdRaw = url.searchParams.get("estateId");
    const estateId = estateIdRaw ? cleanObjectId(estateIdRaw) : undefined;

    if (!estateId) {
      return json({ ok: false, error: "Estate ID is required" }, { status: 400, headers });
    }

    if (estateIdRaw && !estateId) {
      return json({ ok: false, error: "Invalid Estate ID" }, { status: 400, headers });
    }

    await connectToDatabase();

    const ownsEstate = await assertEstateOwner(estateId, session.user.id);
    if (!ownsEstate) {
      return json({ ok: false, error: "Property not found" }, { status: 404, headers });
    }

    const result = await EstateProperty.findOneAndDelete({
      _id: propertyIdClean,
      estateId,
      ownerId: session.user.id,
    })
      .lean()
      .exec();
    const deletedOut = result ? serializeMongoDoc(result) : null;

    if (!deletedOut) {
      return json(
        { ok: false, error: "Property not found or already deleted" },
        { status: 404, headers }
      );
    }

    return json(
      { ok: true, data: { success: true } },
      { status: 200, headers }
    );
  } catch (error) {
    console.error("Error deleting property:", safeErrorMessage(error));
    return json(
      { ok: false, error: "Failed to delete property" },
      { status: 500, headers }
    );
  }
}
