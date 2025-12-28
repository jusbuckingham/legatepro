// src/app/api/properties/route.ts
// Estate properties API for LegatePro

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

import { auth } from "../../../lib/auth";
import { connectToDatabase } from "../../../lib/db";
import { EstateProperty } from "../../../models/EstateProperty";

// Helpers
function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return undefined;
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isValidObjectId(value: string): boolean {
  return mongoose.Types.ObjectId.isValid(value);
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
    await connectToDatabase();

    const session = await auth();
    const ownerId = session?.user?.id;

    if (!ownerId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const estateId = searchParams.get("estateId");
    if (estateId && !isValidObjectId(estateId)) {
      return NextResponse.json(
        { ok: false, error: "Invalid estateId" },
        { status: 400 },
      );
    }
    const isRentedParam = searchParams.get("isRented");
    const city = searchParams.get("city");
    const state = searchParams.get("state");
    const q = (searchParams.get("q") ?? "").trim();
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

    if (city) {
      filter.city = { $regex: city, $options: "i" };
    }

    if (state) {
      filter.state = state;
    }

    if (q) {
      filter.$or = [
        { nickname: { $regex: qSafe, $options: "i" } },
        { streetAddress: { $regex: qSafe, $options: "i" } },
        { city: { $regex: qSafe, $options: "i" } },
        { notes: { $regex: qSafe, $options: "i" } },
      ];
    }

    const properties = await EstateProperty.find(filter)
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return NextResponse.json({ ok: true, properties }, { status: 200 });
  } catch (error) {
    console.error("GET /api/properties error", error);
    return NextResponse.json(
      { ok: false, error: "Unable to load properties" },
      { status: 500 },
    );
  }
}

// POST /api/properties
// Creates a new estate property
export async function POST(request: NextRequest) {
  try {
    await connectToDatabase();

    const session = await auth();
    const ownerId = session?.user?.id;

    if (!ownerId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    interface CreatePropertyPayload {
      estateId?: string;
      nickname?: string;
      streetAddress?: string;
      unit?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      propertyType?: string;
      isPrimaryResidence?: unknown;
      isRented?: unknown;
      purchasePrice?: number;
      estimatedValue?: number;
      notes?: string;
    }

    let body: CreatePropertyPayload | null = null;
    try {
      body = (await request.json()) as CreatePropertyPayload | null;
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON" },
        { status: 400 },
      );
    }

    const {
      estateId,
      nickname,
      streetAddress,
      unit,
      city,
      state,
      postalCode,
      propertyType,
      isPrimaryResidence,
      isRented,
      purchasePrice,
      estimatedValue,
      notes,
    } = body ?? {};

    if (!estateId) {
      return NextResponse.json(
        { ok: false, error: "estateId is required" },
        { status: 400 },
      );
    }

    if (!isValidObjectId(estateId)) {
      return NextResponse.json(
        { ok: false, error: "Invalid estateId" },
        { status: 400 },
      );
    }

    if (!nickname && !streetAddress) {
      return NextResponse.json(
        { ok: false, error: "A nickname or streetAddress is required for a property" },
        { status: 400 },
      );
    }

    const parsedIsPrimaryResidence = parseOptionalBoolean(isPrimaryResidence);
    const parsedIsRented = parseOptionalBoolean(isRented);

    const property = await EstateProperty.create({
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
      purchasePrice,
      estimatedValue,
      notes,
    });

    return NextResponse.json({ ok: true, property }, { status: 201 });
  } catch (error) {
    console.error("POST /api/properties error", error);
    return NextResponse.json(
      { ok: false, error: "Unable to create property" },
      { status: 500 },
    );
  }
}
