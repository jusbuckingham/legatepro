import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { TimeEntry, TIME_ENTRY_ACTIVITY_TYPES } from "@/models/TimeEntry";

type RouteParams = {
  estateId: string;
  entryId: string;
};

// GET /api/estates/[estateId]/time/[entryId]
export async function GET(
  _req: NextRequest,
  context: { params: Promise<RouteParams> }
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { estateId, entryId } = await context.params;

  try {
    await connectToDatabase();

    const entry = await TimeEntry.findOne({
      _id: entryId,
      estateId,
      ownerId: session.user.id,
    }).lean();

    if (!entry) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ entry }, { status: 200 });
  } catch (error) {
    console.error("[GET /api/estates/[estateId]/time/[entryId]] Error:", error);
    return NextResponse.json(
      { error: "Failed to load time entry" },
      { status: 500 }
    );
  }
}

// PATCH /api/estates/[estateId]/time/[entryId]
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<RouteParams> }
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { estateId, entryId } = await context.params;

  try {
    await connectToDatabase();

    const body = await req.json();

    const update: Record<string, unknown> = {};

    if (body.date) update.date = new Date(body.date);
    if (typeof body.minutes === "number") update.minutes = body.minutes;
    if (typeof body.description === "string") {
      update.description = body.description.trim();
    }
    if (typeof body.hourlyRate === "number") update.hourlyRate = body.hourlyRate;
    if (typeof body.billable === "boolean") update.billable = body.billable;
    if (typeof body.invoiced === "boolean") update.invoiced = body.invoiced;

    if (body.activityType) {
      if (TIME_ENTRY_ACTIVITY_TYPES.includes(body.activityType)) {
        update.activityType = body.activityType;
      }
    }

    const updated = await TimeEntry.findOneAndUpdate(
      {
        _id: entryId,
        estateId,
        ownerId: session.user.id,
      },
      update,
      { new: true }
    ).lean();

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ entry: updated }, { status: 200 });
  } catch (error) {
    console.error(
      "[PATCH /api/estates/[estateId]/time/[entryId]] Error:",
      error
    );
    return NextResponse.json(
      { error: "Failed to update time entry" },
      { status: 500 }
    );
  }
}

// DELETE /api/estates/[estateId]/time/[entryId]
export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<RouteParams> }
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { estateId, entryId } = await context.params;

  try {
    await connectToDatabase();

    const deleted = await TimeEntry.findOneAndDelete({
      _id: entryId,
      estateId,
      ownerId: session.user.id,
    }).lean();

    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error(
      "[DELETE /api/estates/[estateId]/time/[entryId]] Error:",
      error
    );
    return NextResponse.json(
      { error: "Failed to delete time entry" },
      { status: 500 }
    );
  }
}