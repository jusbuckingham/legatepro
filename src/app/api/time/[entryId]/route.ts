import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/db";
import { TimeEntry } from "../../../../models/TimeEntry";

type RouteParams = {
  params: Promise<{
    entryId: string;
  }>;
};

async function getEntryId(paramsPromise: RouteParams["params"]): Promise<string> {
  const { entryId } = await paramsPromise;
  return entryId;
}

export async function GET(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    await connectToDatabase();
    const entryId = await getEntryId(params);

    const entry = await TimeEntry.findById(entryId).lean();

    if (!entry) {
      return NextResponse.json({ ok: false, error: "Time entry not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, entry }, { status: 200 });
  } catch (error) {
    console.error("[TIME_ENTRY_GET_ERROR]", error);
    return NextResponse.json(
      { ok: false, error: "Failed to load time entry" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    await connectToDatabase();
    const entryId = await getEntryId(params);
    const body = await request.json();

    const { date, hours, rate, description, notes, isBillable } = body as {
      date?: string | Date;
      hours?: number;
      rate?: number | null;
      description?: string;
      notes?: string;
      isBillable?: boolean;
    };

    const updates: Record<string, unknown> = {};

    if (date !== undefined) updates.date = new Date(date);
    if (hours !== undefined) updates.hours = hours;
    if (rate !== undefined) updates.rate = rate;
    if (description !== undefined) updates.description = description;
    if (notes !== undefined) updates.notes = notes;
    if (isBillable !== undefined) updates.isBillable = isBillable;

    const updated = await TimeEntry.findByIdAndUpdate(entryId, updates, {
      new: true,
      runValidators: true,
    }).lean();

    if (!updated) {
      return NextResponse.json({ ok: false, error: "Time entry not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, entry: updated }, { status: 200 });
  } catch (error) {
    console.error("[TIME_ENTRY_PATCH_ERROR]", error);
    return NextResponse.json(
      { ok: false, error: "Failed to update time entry" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    await connectToDatabase();
    const entryId = await getEntryId(params);

    const deleted = await TimeEntry.findByIdAndDelete(entryId).lean();

    if (!deleted) {
      return NextResponse.json({ ok: false, error: "Time entry not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("[TIME_ENTRY_DELETE_ERROR]", error);
    return NextResponse.json(
      { ok: false, error: "Failed to delete time entry" },
      { status: 500 }
    );
  }
}