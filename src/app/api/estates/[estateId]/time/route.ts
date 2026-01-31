import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Types } from "mongoose";
import { requireEstateAccess, requireEstateEditAccess } from "@/lib/estateAccess";
import {
  TimeEntry,
  TIME_ENTRY_ACTIVITY_TYPES,
  TimeEntryActivityType
} from "@/models/TimeEntry";

type RouteContext = { params: Promise<{ estateId: string }> };

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

function isValidObjectId(value: string): boolean {
  return Types.ObjectId.isValid(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isResponse(value: unknown): value is Response {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.status === "number" && "headers" in v;
}

function pickResponse(value: unknown): Response | null {
  if (!value) return null;
  if (isResponse(value)) return value;
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    const r = (v.res ?? v.response) as unknown;
    if (isResponse(r)) return r;
  }
  return null;
}

async function enforceEstateAccess(opts: {
  estateId: string;
  userId: string;
  mode: "viewer" | "editor";
}): Promise<Response | true> {
  const fn = opts.mode === "editor" ? requireEstateEditAccess : requireEstateAccess;
  const out = (await fn({ estateId: opts.estateId, userId: opts.userId })) as unknown;
  const maybe = pickResponse(out);
  if (maybe) return maybe;
  return true;
}

function parseIsoDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function parseIsoDateStart(value: string | null): Date | null {
  if (!value) return null;

  // If the user passes a date-only string, interpret as local start-of-day.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map((n) => Number(n));
    const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
    if (Number.isNaN(dt.getTime())) return null;
    return dt;
  }

  return parseIsoDate(value);
}

function parseIsoDateEnd(value: string | null): Date | null {
  if (!value) return null;

  // If the user passes a date-only string, interpret as local end-of-day (inclusive).
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map((n) => Number(n));
    const dt = new Date(y, m - 1, d, 23, 59, 59, 999);
    if (Number.isNaN(dt.getTime())) return null;
    return dt;
  }

  return parseIsoDate(value);
}

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

// GET /api/estates/:estateId/time
// Optional query params:
//   - from, to: ISO date strings to bound the date range (inclusive)
export async function GET(
  req: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const { searchParams } = new URL(req.url);
  const { estateId } = await params;
  if (!estateId) {
    return NextResponse.json(
      { ok: false, error: "Missing estateId" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  if (!isValidObjectId(estateId)) {
    return NextResponse.json(
      { ok: false, error: "Invalid estateId" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const access = await enforceEstateAccess({
    estateId,
    userId: session.user.id,
    mode: "viewer",
  });
  if (access instanceof Response) return access as NextResponse;

  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const fromDate = parseIsoDateStart(from);
  const toDate = parseIsoDateEnd(to);

  if (from && !fromDate) {
    return NextResponse.json({ ok: false, error: "from must be a valid ISO date" }, { status: 400, headers: NO_STORE_HEADERS });
  }
  if (to && !toDate) {
    return NextResponse.json({ ok: false, error: "to must be a valid ISO date" }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const query: Record<string, unknown> = {
    ownerId: session.user.id,
    estateId,
  };

  if (fromDate || toDate) {
    const dateQuery: { $gte?: Date; $lte?: Date } = {};
    if (fromDate) dateQuery.$gte = fromDate;
    if (toDate) dateQuery.$lte = toDate;
    query.date = dateQuery;
  }

  try {
    await connectToDatabase();

    const docs = (await TimeEntry.find(query)
      .sort({ date: -1, createdAt: -1 })
      .lean()
      .exec()) as unknown[];

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

    return NextResponse.json({ ok: true, entries }, { status: 200, headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("[GET /api/estates/:estateId/time] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to load time entries" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

// POST /api/estates/:estateId/time
// Accepts JSON body with at minimum: { date, minutes | hours }
// Other optional fields: description, notes, hourlyRate, billable, invoiced, activityType, taskId
export async function POST(
  req: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const { estateId } = await params;
  if (!estateId) {
    return NextResponse.json(
      { ok: false, error: "Missing estateId" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  if (!isValidObjectId(estateId)) {
    return NextResponse.json(
      { ok: false, error: "Invalid estateId" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const access = await enforceEstateAccess({
    estateId,
    userId: session.user.id,
    mode: "editor",
  });
  if (access instanceof Response) return access as NextResponse;

  try {
    await connectToDatabase();

    const raw = await req.json().catch(() => null);
    if (!isPlainObject(raw)) {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const body = raw as {
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

    if (!body.date) {
      return NextResponse.json({ ok: false, error: "date is required" }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const bodyDate = parseIsoDate(body.date);
    if (!bodyDate) {
      return NextResponse.json({ ok: false, error: "date must be a valid ISO date" }, { status: 400, headers: NO_STORE_HEADERS });
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
        { ok: false, error: "A positive number of minutes or hours is required" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const hourlyRate =
      body.hourlyRate !== undefined && body.hourlyRate !== null
        ? Number(body.hourlyRate)
        : 0;

    if (!Number.isFinite(hourlyRate) || hourlyRate < 0) {
      return NextResponse.json(
        { ok: false, error: "hourlyRate must be a non-negative number" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (body.taskId && !isValidObjectId(body.taskId)) {
      return NextResponse.json(
        { ok: false, error: "taskId must be a valid ObjectId" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

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
      date: bodyDate,
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

    return NextResponse.json({ ok: true, entry }, { status: 201, headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("[POST /api/estates/:estateId/time] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to create time entry" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}