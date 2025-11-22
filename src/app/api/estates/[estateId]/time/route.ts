import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { TimeEntry, TIME_ENTRY_ACTIVITY_TYPES } from "@/models/TimeEntry";

type RouteParams = {
  estateId: string;
};

// Derive a proper activity type from the constant
type TimeEntryActivityType = (typeof TIME_ENTRY_ACTIVITY_TYPES)[number];

// GET /api/estates/[estateId]/time
export async function GET(
  _req: NextRequest,
  context: { params: Promise<RouteParams> }
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { estateId } = await context.params;

  try {
    await connectToDatabase();

    const entries = await TimeEntry.find({
      estateId,
      ownerId: session.user.id,
    })
      .sort({ date: -1, createdAt: -1 })
      .lean();

    return NextResponse.json({ entries }, { status: 200 });
  } catch (error) {
    console.error("[GET /api/estates/[estateId]/time] Error:", error);
    return NextResponse.json(
      { error: "Failed to load time entries" },
      { status: 500 }
    );
  }
}

// POST /api/estates/[estateId]/time
export async function POST(
  req: NextRequest,
  context: { params: Promise<RouteParams> }
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { estateId } = await context.params;

  try {
    await connectToDatabase();

    const body = await req.json();

    const {
      date,
      minutes,
      description,
      activityType,
      hourlyRate,
      billable,
      invoiced,
    } = body as {
      date: string;
      minutes: number;
      description?: string;
      activityType?: string;
      hourlyRate?: number;
      billable?: boolean;
      invoiced?: boolean;
    };

    if (!date || !minutes) {
      return NextResponse.json(
        { error: "date and minutes are required" },
        { status: 400 }
      );
    }

    const normalizedActivityType: TimeEntryActivityType =
      activityType &&
      TIME_ENTRY_ACTIVITY_TYPES.includes(
        activityType as TimeEntryActivityType
      )
        ? (activityType as TimeEntryActivityType)
        : "GENERAL";

    const created = await TimeEntry.create({
      ownerId: session.user.id,
      estateId,
      date: new Date(date),
      minutes,
      description: description?.trim() || undefined,
      activityType: normalizedActivityType,
      hourlyRate: typeof hourlyRate === "number" ? hourlyRate : undefined,
      billable: typeof billable === "boolean" ? billable : true,
      invoiced: typeof invoiced === "boolean" ? invoiced : false,
    });

    return NextResponse.json({ entry: created }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/estates/[estateId]/time] Error:", error);
    return NextResponse.json(
      { error: "Failed to create time entry" },
      { status: 500 }
    );
  }
}