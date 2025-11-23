import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { TimeEntry, TIME_ENTRY_ACTIVITY_TYPES } from "@/models/TimeEntry";

type RouteParams = {
  estateId: string;
};

interface RouteContext {
  params: Promise<RouteParams>;
}

// Derive a proper activity type from the constant
type TimeEntryActivityType = (typeof TIME_ENTRY_ACTIVITY_TYPES)[number];

// GET /api/estates/[estateId]/time
export async function GET(
  _req: NextRequest,
  context: RouteContext
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
  context: RouteContext
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { estateId } = await context.params;

  try {
    await connectToDatabase();

    const body = (await req.json()) as {
      date: string;
      minutes: number | string;
      description?: string;
      activityType?: string;
      hourlyRate?: number | string;
      billable?: boolean | string;
      invoiced?: boolean | string;
      taskId?: string | null;
      notes?: string;
    };

    const minutesNumber =
      typeof body.minutes === "string"
        ? Number.parseFloat(body.minutes)
        : body.minutes;

    if (
      !body.date ||
      minutesNumber === undefined ||
      Number.isNaN(minutesNumber) ||
      minutesNumber <= 0
    ) {
      return NextResponse.json(
        { error: "Valid date and positive minutes are required" },
        { status: 400 }
      );
    }

    const hourlyRateNumber =
      typeof body.hourlyRate === "string"
        ? Number.parseFloat(body.hourlyRate)
        : body.hourlyRate ?? 0;

    const normalizedActivityType: TimeEntryActivityType =
      body.activityType &&
      TIME_ENTRY_ACTIVITY_TYPES.includes(
        body.activityType as TimeEntryActivityType
      )
        ? (body.activityType as TimeEntryActivityType)
        : "GENERAL";

    const created = await TimeEntry.create({
      ownerId: session.user.id,
      estateId,
      date: new Date(body.date),
      minutes: minutesNumber,
      description: body.description?.trim() || undefined,
      notes: body.notes?.trim() || undefined,
      activityType: normalizedActivityType,
      hourlyRate: hourlyRateNumber,
      billable:
        typeof body.billable === "string"
          ? body.billable === "true" || body.billable === "on"
          : body.billable ?? true,
      invoiced:
        typeof body.invoiced === "string"
          ? body.invoiced === "true" || body.invoiced === "on"
          : body.invoiced ?? false,
      taskId: body.taskId || undefined,
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