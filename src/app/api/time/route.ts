import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/db";
import { TimeEntry } from "../../../models/TimeEntry";

// Shape of the payload we expect when creating a time entry
interface CreateTimeEntryPayload {
  estateId: string;
  date: string; // ISO string
  hours: number;
  description: string;
  notes?: string;
  isBillable?: boolean;
  rate?: number | null;
}

/**
 * GET /api/time?estateId=...
 * Returns all time entries for a specific estate, sorted newest first.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const estateId = searchParams.get("estateId");

    if (!estateId) {
      return NextResponse.json(
        { error: "Missing required query parameter: estateId", entries: [] },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const entries = await TimeEntry.find({ estateId })
      .sort({ date: -1 })
      .lean();

    return NextResponse.json({ entries }, { status: 200 });
  } catch (error) {
    console.error("Error fetching time entries:", error);
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Failed to load time entries";
    return NextResponse.json(
      { error: message, entries: [] },
      { status: 500 }
    );
  }
}

/**
 * POST /api/time
 * Creates a new time entry.
 *
 * Expected JSON body:
 * {
 *   estateId: string;
 *   date: string;         // ISO date
 *   hours: number;
 *   description: string;
 *   notes?: string;
 *   isBillable?: boolean;
 *   rate?: number | null;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<CreateTimeEntryPayload> | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid request body. Expected JSON object." },
        { status: 400 }
      );
    }

    const {
      estateId,
      date,
      hours,
      description,
      notes,
      isBillable = true,
      rate = null,
    } = body;

    if (!estateId || !date || typeof hours !== "number" || !description) {
      return NextResponse.json(
        {
          error:
            "Missing required fields. estateId, date, hours (number), and description are required.",
        },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const entry = await TimeEntry.create({
      estateId,
      date: new Date(date),
      hours,
      description: description.trim(),
      notes: notes ? String(notes).trim() : undefined,
      isBillable: Boolean(isBillable),
      // `rate` is optional; if provided we store it, otherwise it stays null/undefined.
      rate,
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    console.error("Error creating time entry:", error);
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Failed to create time entry";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}