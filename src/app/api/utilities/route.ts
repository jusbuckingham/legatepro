

// src/app/api/utilities/route.ts
// Utility accounts API for LegatePro

import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/db";
import { UtilityAccount } from "../../../models/UtilityAccount";

// GET /api/utilities
// Optional query params:
//   estateId: string            -> filter by estate
//   propertyId: string          -> filter by property
//   utilityType: string         -> filter by utility type (ELECTRIC, GAS, etc.)
//   q: string                   -> search by providerName, accountNumber, notes
export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();

    // TODO: replace with real ownerId from auth/session
    const ownerId = "demo-user";

    const { searchParams } = new URL(request.url);
    const estateId = searchParams.get("estateId");
    const propertyId = searchParams.get("propertyId");
    const utilityType = searchParams.get("utilityType");
    const q = searchParams.get("q")?.trim() ?? "";

    const filter: Record<string, unknown> = { ownerId };

    if (estateId) {
      filter.estateId = estateId;
    }

    if (propertyId) {
      filter.propertyId = propertyId;
    }

    if (utilityType) {
      filter.utilityType = utilityType;
    }

    if (q) {
      filter.$or = [
        { providerName: { $regex: q, $options: "i" } },
        { accountNumber: { $regex: q, $options: "i" } },
        { notes: { $regex: q, $options: "i" } },
      ];
    }

    const utilities = await UtilityAccount.find(filter)
      .sort({ providerName: 1 })
      .lean();

    return NextResponse.json({ utilities }, { status: 200 });
  } catch (error) {
    console.error("GET /api/utilities error", error);
    return NextResponse.json(
      { error: "Unable to load utility accounts" },
      { status: 500 }
    );
  }
}

// POST /api/utilities
// Creates a new utility account record
export async function POST(request: NextRequest) {
  try {
    await connectToDatabase();

    // TODO: replace with real ownerId from auth/session
    const ownerId = "demo-user";

    const body = await request.json();

    const {
      estateId,
      propertyId,
      providerName,
      utilityType,
      accountNumber,
      phone,
      website,
      balanceDue,
      lastPaymentAmount,
      lastPaymentDate,
      notes,
    } = body ?? {};

    if (!estateId) {
      return NextResponse.json(
        { error: "estateId is required" },
        { status: 400 }
      );
    }

    if (!providerName) {
      return NextResponse.json(
        { error: "providerName is required" },
        { status: 400 }
      );
    }

    if (!utilityType) {
      return NextResponse.json(
        { error: "utilityType is required" },
        { status: 400 }
      );
    }

    const utility = await UtilityAccount.create({
      ownerId,
      estateId,
      propertyId,
      providerName,
      utilityType,
      accountNumber,
      phone,
      website,
      balanceDue: balanceDue != null ? Number(balanceDue) : undefined,
      lastPaymentAmount:
        lastPaymentAmount != null ? Number(lastPaymentAmount) : undefined,
      lastPaymentDate: lastPaymentDate
        ? new Date(lastPaymentDate)
        : undefined,
      notes,
    });

    return NextResponse.json({ utility }, { status: 201 });
  } catch (error) {
    console.error("POST /api/utilities error", error);
    return NextResponse.json(
      { error: "Unable to create utility account" },
      { status: 500 }
    );
  }
}