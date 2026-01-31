// src/app/api/utilities/route.ts
// Utility accounts API for LegatePro

import type { NextRequest } from "next/server";
import mongoose from "mongoose";

import { auth } from "@/lib/auth";
import { jsonOk, noStoreHeaders, safeErrorMessage } from "@/lib/apiResponse";
import { connectToDatabase } from "@/lib/db";
import { UtilityAccount } from "@/models/UtilityAccount";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { headers: noStoreHeaders() } as const;

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isValidObjectId(value: string): boolean {
  return mongoose.Types.ObjectId.isValid(value);
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asOptionalTrimmedString(value: unknown): string | undefined {
  const s = asTrimmedString(value);
  return s.length > 0 ? s : undefined;
}

// GET /api/utilities
// Optional query params:
//   estateId: string            -> filter by estate
//   propertyId: string          -> filter by property
//   type: string                -> filter by utility type (electric, gas, etc.)
//   q: string                   -> search by providerName, accountNumber, notes
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const ownerId = session?.user?.id;
    if (!ownerId) {
      return jsonOk({ ok: false, error: "Unauthorized" }, 401, NO_STORE.headers);
    }

    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const estateId = searchParams.get("estateId");
    const propertyId = searchParams.get("propertyId");

    if (estateId && !isValidObjectId(estateId)) {
      return jsonOk({ ok: false, error: "Invalid estateId" }, 400, NO_STORE.headers);
    }

    if (propertyId && !isValidObjectId(propertyId)) {
      return jsonOk({ ok: false, error: "Invalid propertyId" }, 400, NO_STORE.headers);
    }

    const type = searchParams.get("type")?.trim() ?? "";
    const q = searchParams.get("q")?.trim() ?? "";
    const qSafe = q ? escapeRegex(q) : "";

    const filter: Record<string, unknown> = { ownerId };

    if (estateId) {
      filter.estateId = estateId;
    }

    if (propertyId) {
      filter.propertyId = propertyId;
    }

    if (type) {
      filter.utilityType = type;
    }

    if (q) {
      filter.$or = [
        { providerName: { $regex: qSafe, $options: "i" } },
        { accountNumber: { $regex: qSafe, $options: "i" } },
        { notes: { $regex: qSafe, $options: "i" } },
      ];
    }

    const utilities = await UtilityAccount.find(filter)
      .sort({ providerName: 1 })
      .lean()
      .exec();

    return jsonOk({ ok: true, data: { utilities } }, 200, NO_STORE.headers);
  } catch (error) {
    console.error("GET /api/utilities error", safeErrorMessage(error));
    return jsonOk(
      { ok: false, error: "Unable to load utility accounts" },
      500,
      NO_STORE.headers,
    );
  }
}

// POST /api/utilities
// Creates a new utility account record
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const ownerId = session?.user?.id;
    if (!ownerId) {
      return jsonOk({ ok: false, error: "Unauthorized" }, 401, NO_STORE.headers);
    }

    await connectToDatabase();

    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonOk({ ok: false, error: "Invalid JSON" }, 400, NO_STORE.headers);
    }

    const raw = body as Record<string, unknown>;

    const estateId = asTrimmedString(raw.estateId);
    const propertyId = asOptionalTrimmedString(raw.propertyId);
    const providerName = asTrimmedString(raw.providerName);
    const utilityType = asOptionalTrimmedString(raw.utilityType) ?? "other";
    const accountNumber = asOptionalTrimmedString(raw.accountNumber);
    const billingName = asOptionalTrimmedString(raw.billingName);
    const phone = asOptionalTrimmedString(raw.phone);
    const email = asOptionalTrimmedString(raw.email);
    const onlinePortalUrl = asOptionalTrimmedString(raw.onlinePortalUrl);
    const status = asOptionalTrimmedString(raw.status) ?? "active";
    const isAutoPay = Boolean(raw.isAutoPay);
    const notes = asOptionalTrimmedString(raw.notes);

    if (!estateId) {
      return jsonOk({ ok: false, error: "estateId is required" }, 400, NO_STORE.headers);
    }

    if (!isValidObjectId(estateId)) {
      return jsonOk({ ok: false, error: "Invalid estateId" }, 400, NO_STORE.headers);
    }

    if (propertyId && !isValidObjectId(propertyId)) {
      return jsonOk({ ok: false, error: "Invalid propertyId" }, 400, NO_STORE.headers);
    }

    if (!providerName) {
      return jsonOk({ ok: false, error: "providerName is required" }, 400, NO_STORE.headers);
    }

    const utility = await UtilityAccount.create({
      ownerId,
      estateId,
      propertyId,
      providerName,
      utilityType,
      accountNumber,
      billingName,
      phone,
      email,
      onlinePortalUrl,
      status,
      isAutoPay,
      notes,
    });

    return jsonOk({ ok: true, data: { utility } }, 201, NO_STORE.headers);
  } catch (error) {
    console.error("POST /api/utilities error", safeErrorMessage(error));
    return jsonOk(
      { ok: false, error: "Unable to create utility account" },
      500,
      NO_STORE.headers,
    );
  }
}