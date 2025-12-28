import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { TimeEntry } from "@/models/TimeEntry";

type RouteContext = {
  params: Promise<{
    estateId: string;
    entryId: string;
  }>;
};

interface TimeEntryRecord {
  _id: unknown;
  estateId: unknown;
  date: Date;
  description: string;
  minutes: number;
  notes?: string;
  billable: boolean;
  rate?: number;
  amount?: number;
  taskId?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

// ---- helpers --------------------------------------------------------------

function parseMinutesFromBody(body: {
  hours?: unknown;
  minutes?: unknown;
}): number | undefined {
  const { hours, minutes } = body;

  // If explicit minutes were sent, prefer those
  if (minutes !== undefined && minutes !== null && minutes !== "") {
    const m = Number(minutes);
    if (!Number.isNaN(m) && m >= 0) return m;
  }

  // Otherwise derive from hours
  if (hours !== undefined && hours !== null && hours !== "") {
    const h = Number(hours);
    if (!Number.isNaN(h) && h >= 0) {
      return Math.round(h * 60);
    }
  }

  return undefined;
}

function serializeEntry(entry: TimeEntryRecord) {
  const minutes = entry.minutes ?? 0;
  const hours = minutes / 60;

  return {
    id: String(entry._id),
    estateId: String(entry.estateId),
    date: entry.date,
    description: entry.description,
    minutes,
    hours,
    notes: entry.notes ?? "",
    billable: entry.billable,
    rate: entry.rate ?? null,
    amount: entry.amount ?? null,
    taskId: entry.taskId ? String(entry.taskId) : null,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

// ---- GET ------------------------------------------------------------------

export async function GET(_req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { estateId, entryId } = await context.params;

  await connectToDatabase();

  const entry = await TimeEntry.findOne({
    _id: entryId,
    estateId,
    ownerId: session.user.id,
  }).lean<TimeEntryRecord | null>();

  if (!entry) {
    return NextResponse.json({ ok: false, error: "Time entry not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, entry: serializeEntry(entry) }, { status: 200 });
}

// ---- PUT (EDIT) -----------------------------------------------------------

export async function PUT(req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { estateId, entryId } = await context.params;
  const body = await req.json();

  const {
    date,
    description,
    notes,
    billable,
    rate,
    taskId,
  }: {
    date?: string;
    description?: string;
    notes?: string;
    billable?: unknown;
    rate?: unknown;
    taskId?: string;
  } = body;

  const minutes = parseMinutesFromBody(body);

  const update: Record<string, unknown> = {};

  if (date) {
    // Accept YYYY-MM-DD or full ISO; normalize to Date
    update.date = new Date(date);
  }

  if (typeof description === "string") {
    update.description = description.trim();
  }

  if (typeof notes === "string") {
    update.notes = notes.trim();
  }

  if (typeof billable === "boolean") {
    update.billable = billable;
  } else if (typeof billable === "string") {
    // handle "on" / "true" / "false" from form posts
    const lowered = billable.toLowerCase();
    if (lowered === "on" || lowered === "true") {
      update.billable = true;
    } else if (lowered === "false") {
      update.billable = false;
    }
  }

  if (rate !== undefined && rate !== null && rate !== "") {
    const parsedRate = Number(rate);
    if (!Number.isNaN(parsedRate) && parsedRate >= 0) {
      update.rate = parsedRate;
    }
  }

  if (taskId && typeof taskId === "string" && taskId.length > 0) {
    update.taskId = taskId;
  } else if (taskId === "") {
    // allow clearing taskId
    update.taskId = null;
  }

  if (minutes !== undefined) {
    update.minutes = minutes;
  }

  await connectToDatabase();

  const existing = await TimeEntry.findOne({
    _id: entryId,
    estateId,
    ownerId: session.user.id,
  });

  if (!existing) {
    return NextResponse.json({ ok: false, error: "Time entry not found" }, { status: 404 });
  }

  // Narrow to a mutable doc that definitely has our custom fields
  type MutableTimeEntryDoc = typeof existing & {
    notes?: string;
    rate?: number;
    taskId?: string | null;
    amount?: number | null;
  };

  const doc = existing as MutableTimeEntryDoc;

  // Apply updates onto the existing doc
  if (update.date instanceof Date) {
    doc.date = update.date;
  }
  if (typeof update.description === "string") {
    doc.description = update.description;
  }
  if (typeof update.notes === "string") {
    doc.notes = update.notes;
  }
  if (typeof update.billable === "boolean") {
    doc.billable = update.billable;
  }
  if (typeof update.rate === "number") {
    doc.rate = update.rate;
  }
  if ("taskId" in update) {
    doc.taskId = update.taskId as string | null;
  }
  if (typeof update.minutes === "number") {
    doc.minutes = update.minutes;
  }

  // Ensure minutes is at least 0
  if (doc.minutes == null || Number.isNaN(doc.minutes)) {
    doc.minutes = 0;
  }

  // Recalculate amount for billable time
  if (doc.billable && typeof doc.rate === "number") {
    doc.amount = (doc.minutes / 60) * doc.rate;
  }

  const saved = (await doc.save()).toObject() as TimeEntryRecord;

  return NextResponse.json({ ok: true, entry: serializeEntry(saved) }, { status: 200 });
}

// ---- DELETE ---------------------------------------------------------------

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { estateId, entryId } = await context.params;

  await connectToDatabase();

  const deleted = await TimeEntry.findOneAndDelete({
    _id: entryId,
    estateId,
    ownerId: session.user.id,
  }).lean<TimeEntryRecord | null>();

  if (!deleted) {
    return NextResponse.json({ ok: false, error: "Time entry not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, entry: serializeEntry(deleted) }, { status: 200 });
}