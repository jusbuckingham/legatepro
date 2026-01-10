// src/app/api/utilities/route.ts
// Utility accounts API for LegatePro

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { UtilityAccount } from "@/models/UtilityAccount";

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
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const estateId = searchParams.get("estateId");
    const propertyId = searchParams.get("propertyId");

    if (estateId && !isValidObjectId(estateId)) {
      return NextResponse.json({ ok: false, error: "Invalid estateId" }, { status: 400 });
    }

    if (propertyId && !isValidObjectId(propertyId)) {
      return NextResponse.json({ ok: false, error: "Invalid propertyId" }, { status: 400 });
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

    return NextResponse.json({ ok: true, data: { utilities } }, { status: 200 });
  } catch (error) {
    console.error("GET /api/utilities error", error);
    return NextResponse.json(
      { ok: false, error: "Unable to load utility accounts" },
      { status: 500 }
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
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    let body: unknown = null;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const raw = (body ?? {}) as Record<string, unknown>;

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
      return NextResponse.json({ ok: false, error: "estateId is required" }, { status: 400 });
    }

    if (!isValidObjectId(estateId)) {
      return NextResponse.json({ ok: false, error: "Invalid estateId" }, { status: 400 });
    }

    if (propertyId && !isValidObjectId(propertyId)) {
      return NextResponse.json({ ok: false, error: "Invalid propertyId" }, { status: 400 });
    }

    if (!providerName) {
      return NextResponse.json({ ok: false, error: "providerName is required" }, { status: 400 });
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

    return NextResponse.json({ ok: true, data: { utility } }, { status: 201 });
  } catch (error) {
    console.error("POST /api/utilities error", error);
    return NextResponse.json(
      { ok: false, error: "Unable to create utility account" },
      { status: 500 }
    );
  }
}