import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/db";
import { TimeEntry } from "../../../../models/TimeEntry";

// GET /api/time/[entryId]  – fetch a single time entry
export async function GET(
  _req: NextRequest,
  context: { params: { entryId: string } }
) {
  const { entryId } = context.params;

  if (!entryId) {
    return NextResponse.json(
      { error: "Time entry id is required" },
      { status: 400 }
    );
  }

  try {
    await connectToDatabase();

    const entry = await TimeEntry.findById(entryId).lean();

    if (!entry) {
      return NextResponse.json(
        { error: "Time entry not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(entry, { status: 200 });
  } catch (err) {
    console.error("Error fetching time entry:", err);
    return NextResponse.json(
      { error: "Failed to fetch time entry" },
      { status: 500 }
    );
  }
}

// PUT /api/time/[entryId]  – update a time entry
export async function PUT(
  req: NextRequest,
  context: { params: { entryId: string } }
) {
  const { entryId } = context.params;

  if (!entryId) {
    return NextResponse.json(
      { error: "Time entry id is required" },
      { status: 400 }
    );
  }

  try {
    await connectToDatabase();

    const payload = await req.json();

    const {
      date,
      hours,
      rate,
      description,
      notes,
      isBillable,
    }: {
      date?: string;
      hours?: number;
      rate?: number | null;
      description?: string;
      notes?: string;
      isBillable?: boolean;
    } = payload;

    const entry = await TimeEntry.findById(entryId);

    if (!entry) {
      return NextResponse.json(
        { error: "Time entry not found" },
        { status: 404 }
      );
    }

    if (date) entry.date = new Date(date);
    if (typeof hours === "number") entry.hours = hours;
    if (typeof rate === "number") entry.rate = rate;
    if (typeof description === "string") entry.description = description;
    if (typeof notes === "string") entry.notes = notes;
    if (typeof isBillable === "boolean") entry.isBillable = isBillable;

    await entry.save();

    return NextResponse.json(entry, { status: 200 });
  } catch (err) {
    console.error("Error updating time entry:", err);
    return NextResponse.json(
      { error: "Failed to update time entry" },
      { status: 500 }
    );
  }
}

// DELETE /api/time/[entryId]  – delete a time entry
export async function DELETE(
  _req: NextRequest,
  context: { params: { entryId: string } }
) {
  const { entryId } = context.params;

  if (!entryId) {
    return NextResponse.json(
      { error: "Time entry id is required" },
      { status: 400 }
    );
  }

  try {
    await connectToDatabase();

    const deleted = await TimeEntry.findByIdAndDelete(entryId);

    if (!deleted) {
      return NextResponse.json(
        { error: "Time entry not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, id: entryId },
      { status: 200 }
    );
  } catch (err) {
    console.error("Error deleting time entry:", err);
    return NextResponse.json(
      { error: "Failed to delete time entry" },
      { status: 500 }
    );
  }
}