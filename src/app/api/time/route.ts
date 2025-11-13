

// src/app/api/time/route.ts
// Personal representative timecard API for LegatePro

import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/db";
import { TimeEntry } from "../../../models/TimeEntry";

// GET /api/time
// Optional query params:
//   estateId: string        -> filter by estate
//   from: ISO date          -> entries from this date onward
//   to: ISO date            -> entries up to this date
//   q: string               -> search by description/notes
export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();

    const ownerId = "demo-user"; // TODO: replace with real auth

    const { searchParams } = new URL(request.url);
    const estateId = searchParams.get("estateId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const q = searchParams.get("q")?.trim() ?? "";

    const filter: Record<string, unknown> = { ownerId };

    if (estateId) filter.estateId = estateId;

    if (from || to) {
      const dateFilter: Record<string, Date> = {};
      if (from) dateFilter.$gte = new Date(from);
      if (to) dateFilter.$lte = new Date(to);
      filter.date = dateFilter;
    }

    if (q) {
      filter.$or = [
        { description: { $regex: q, $options: "i" } },
        { notes: { $regex: q, $options: "i" } },
      ];
    }

    const entries = await TimeEntry.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .lean();

    return NextResponse.json({ entries }, { status: 200 });
  } catch (error) {
    console.error("GET /api/time error", error);
    return NextResponse.json(
      { error: "Unable to load time entries" },
      { status: 500 }
    );
  }
}

// POST /api/time
// Creates a new time entry for the personal representative
export async function POST(request: NextRequest) {
  try {
    await connectToDatabase();

    const ownerId = "demo-user"; // TODO: replace with real auth

    const body = await request.json();

    const {
      estateId,
      date,
      hours,
      description,
      notes,
      isBillable,
    } = body ?? {};

    if (!estateId) {
      return NextResponse.json(
        { error: "estateId is required" },
        { status: 400 }
      );
    }

    if (!date) {
      return NextResponse.json(
        { error: "date is required" },
        { status: 400 }
      );
    }

    if (hours == null || Number.isNaN(Number(hours))) {
      return NextResponse.json(
        { error: "A valid number of hours is required" },
        { status: 400 }
      );
    }

    if (!description) {
      return NextResponse.json(
        { error: "description is required" },
        { status: 400 }
      );
    }

    const entry = await TimeEntry.create({
      ownerId,
      estateId,
      date: new Date(date),
      hours: Number(hours),
      description,
      notes,
      isBillable: typeof isBillable === "boolean" ? isBillable : true,
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    console.error("POST /api/time error", error);
    return NextResponse.json(
      { error: "Unable to create time entry" },
      { status: 500 }
    );
  }
}