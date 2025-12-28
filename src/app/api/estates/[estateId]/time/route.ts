import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import {
  TimeEntry,
  TIME_ENTRY_ACTIVITY_TYPES,
  TimeEntryActivityType
} from "@/models/TimeEntry";

function normalizeObjectId(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (
    typeof value === "object" &&
    value !== null &&
    "toString" in value &&
    typeof (value as { toString: () => string }).toString === "function"
  ) {
    return (value as { toString: () => string }).toString();
  }
  return String(value);
}

// GET /api/time
// Optional query params:
//   - estateId: limit to a single estate
//   - from, to: ISO date strings to bound the date range (inclusive)
export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const estateId = searchParams.get("estateId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const query: Record<string, unknown> = {
    ownerId: session.user.id,
  };

  if (estateId) {
    query.estateId = estateId;
  }

  if (from || to) {
    const dateQuery: { $gte?: Date; $lte?: Date } = {};
    if (from) dateQuery.$gte = new Date(from);
    if (to) dateQuery.$lte = new Date(to);
    query.date = dateQuery;
  }

  try {
    await connectToDatabase();

    const docs = (await TimeEntry.find(query)
      .sort({ date: -1, createdAt: -1 })
      .lean()) as unknown[];

    const entries = docs.map((raw) => {
      const doc = raw as {
        _id?: unknown;
        estateId?: unknown;
        taskId?: unknown;
        minutes?: unknown;
        hourlyRate?: unknown;
      };

      const minutes = Number(doc.minutes ?? 0);
      const hourlyRate = Number(doc.hourlyRate ?? 0);
      const hours = minutes / 60;
      const amount = (minutes * hourlyRate) / 60;

      const rawObj = (typeof raw === "object" && raw !== null) ? raw as Record<string, unknown> : {};
      return {
        ...rawObj,
        _id: normalizeObjectId(doc._id) ?? "",
        estateId: normalizeObjectId(doc.estateId),
        taskId: normalizeObjectId(doc.taskId),
        minutes,
        hourlyRate,
        hours,
        amount,
      };
    });

    return NextResponse.json({ entries }, { status: 200 });
  } catch (error) {
    console.error("[GET /api/time] Error:", error);
    return NextResponse.json(
      { error: "Failed to load time entries" },
      { status: 500 }
    );
  }
}

// POST /api/time
// Accepts JSON body with at minimum: { estateId, date, minutes | hours }
// Other optional fields: description, notes, hourlyRate, billable, invoiced, activityType, taskId
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectToDatabase();

    const body = (await req.json()) as {
      estateId?: string;
      date?: string;
      minutes?: number | string | null;
      hours?: number | string | null;
      description?: string;
      notes?: string;
      hourlyRate?: number | string | null;
      billable?: boolean | string;
      invoiced?: boolean | string;
      activityType?: string | null;
      taskId?: string | null;
    };

    if (!body.estateId) {
      return NextResponse.json(
        { error: "estateId is required" },
        { status: 400 }
      );
    }

    if (!body.date) {
      return NextResponse.json(
        { error: "date is required" },
        { status: 400 }
      );
    }

    // Normalise minutes: allow client to send either minutes or hours
    let minutes: number | null = null;
    if (body.minutes !== undefined && body.minutes !== null) {
      minutes = Number(body.minutes);
    } else if (body.hours !== undefined && body.hours !== null) {
      minutes = Number(body.hours) * 60;
    }

    if (!minutes || Number.isNaN(minutes) || minutes <= 0) {
      return NextResponse.json(
        { error: "A positive number of minutes or hours is required" },
        { status: 400 }
      );
    }

    const hourlyRate =
      body.hourlyRate !== undefined && body.hourlyRate !== null
        ? Number(body.hourlyRate)
        : 0;

    const normalizedActivityType: TimeEntryActivityType =
      body.activityType &&
      TIME_ENTRY_ACTIVITY_TYPES.includes(
        body.activityType as TimeEntryActivityType
      )
        ? (body.activityType as TimeEntryActivityType)
        : "GENERAL";

    const created = await TimeEntry.create({
      ownerId: session.user.id,
      estateId: body.estateId,
      date: new Date(body.date),
      minutes,
      description: body.description?.trim() || undefined,
      notes: body.notes?.trim() || undefined,
      activityType: normalizedActivityType,
      hourlyRate,
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

    const minutesCreated = Number(created.minutes ?? minutes ?? 0);
    const hourlyRateCreated = Number(created.hourlyRate ?? hourlyRate ?? 0);
    const hoursCreated = minutesCreated / 60;
    const amountCreated = (minutesCreated * hourlyRateCreated) / 60;

    const createdWithIds = created as {
      _id?: unknown;
      estateId?: unknown;
      taskId?: unknown;
    };

    const entry = {
      ...created.toObject(),
      _id: normalizeObjectId(createdWithIds._id) ?? "",
      estateId: normalizeObjectId(createdWithIds.estateId),
      taskId: normalizeObjectId(createdWithIds.taskId),
      minutes: minutesCreated,
      hourlyRate: hourlyRateCreated,
      hours: hoursCreated,
      amount: amountCreated,
    };

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/time] Error:", error);
    return NextResponse.json(
      { error: "Failed to create time entry" },
      { status: 500 }
    );
  }
}