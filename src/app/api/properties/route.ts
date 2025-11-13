// src/app/api/properties/route.ts
// Estate properties API for LegatePro

import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/db";
import { EstateProperty } from "../../../models/EstateProperty";

// GET /api/properties
// Optional query params:
//   estateId: string          -> filter by estate
//   isRented: "true" | "false" -> filter by rental status
//   city: string              -> filter by city (case-insensitive)
//   state: string             -> filter by state (exact match)
//   q: string                 -> search by nickname, address, or notes
export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();

    // TODO: replace with real ownerId from auth/session
    const ownerId = "demo-user";

    const { searchParams } = new URL(request.url);
    const estateId = searchParams.get("estateId");
    const isRentedParam = searchParams.get("isRented");
    const city = searchParams.get("city");
    const state = searchParams.get("state");
    const q = searchParams.get("q")?.trim() ?? "";

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
        { nickname: { $regex: q, $options: "i" } },
        { streetAddress: { $regex: q, $options: "i" } },
        { city: { $regex: q, $options: "i" } },
        { notes: { $regex: q, $options: "i" } },
      ];
    }

    const properties = await EstateProperty.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ properties }, { status: 200 });
  } catch (error) {
    console.error("GET /api/properties error", error);
    return NextResponse.json(
      { error: "Unable to load properties" },
      { status: 500 }
    );
  }
}

// POST /api/properties
// Creates a new estate property
export async function POST(request: NextRequest) {
  try {
    await connectToDatabase();

    // TODO: replace with real ownerId from auth/session
    const ownerId = "demo-user";

    const body = await request.json();

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
        { error: "estateId is required" },
        { status: 400 }
      );
    }

    if (!nickname && !streetAddress) {
      return NextResponse.json(
        { error: "A nickname or streetAddress is required for a property" },
        { status: 400 }
      );
    }

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
      isPrimaryResidence,
      isRented,
      purchasePrice,
      estimatedValue,
      notes,
    });

    return NextResponse.json({ property }, { status: 201 });
  } catch (error) {
    console.error("POST /api/properties error", error);
    return NextResponse.json(
      { error: "Unable to create property" },
      { status: 500 }
    );
  }
}
