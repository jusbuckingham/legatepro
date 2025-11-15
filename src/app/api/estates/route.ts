// src/app/api/estates/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/db";
import { Estate } from "../../../models/Estate";

// GET /api/estates
// Returns a list of estates for the current (placeholder) owner
export async function GET() {
  try {
    await connectToDatabase();

    // TODO: replace with real ownerId from auth/session
    const ownerId = "000000000000000000000001";

    const estates = await Estate.find({ ownerId })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ estates }, { status: 200 });
  } catch (error) {
    console.error("GET /api/estates error", error);
    return NextResponse.json(
      { error: "Unable to load estates" },
      { status: 500 }
    );
  }
}

// POST /api/estates
// Creates a new estate
export async function POST(request: NextRequest) {
  try {
    await connectToDatabase();

    const body = await request.json();

    // TODO: replace with real ownerId from auth/session
    const ownerId = "000000000000000000000001";

    const {
      decedentName,
      name,
      courtCounty,
      courtState,
      caseNumber,
      status,
    } = body ?? {};

    if (!decedentName && !name) {
      return NextResponse.json(
        { error: "Decedent name or estate name is required" },
        { status: 400 }
      );
    }

    const estateDoc = await Estate.create({
      ownerId,
      decedentName,
      name,
      courtCounty,
      courtState,
      caseNumber,
      status: (status || "OPEN").toUpperCase(),
    });

    return NextResponse.json({ estate: estateDoc }, { status: 201 });
  } catch (error) {
    console.error("POST /api/estates error", error);
    return NextResponse.json(
      { error: "Unable to create estate" },
      { status: 500 }
    );
  }
}
