import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { requireEstateAccess, requireEstateEditAccess } from "@/lib/estateAccess";
import { TimeEntry } from "@/models/TimeEntry";

type RouteContext = {
  params: Promise<{
    estateId: string;
    entryId: string;
  }>;
};

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

interface TimeEntryRecord {
  _id: unknown;
  estateId: unknown;
  ownerId: unknown;
  date: Date;
  description: string;
  minutes?: number;
  hours?: number;
  notes?: string;
  billable?: boolean;
  rate?: number | null;
  amount?: number | null;
  taskId?: unknown | null;
  createdAt?: Date;
  updatedAt?: Date;
}

function isValidObjectId(value: string): boolean {
  return Types.ObjectId.isValid(value);
}

// ---- helpers --------------------------------------------------------------

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
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const { estateId, entryId } = await context.params;

  if (!estateId || !entryId) {
    return NextResponse.json(
      { ok: false, error: "Missing estateId or entryId" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  if (!isValidObjectId(estateId) || !isValidObjectId(entryId)) {
    return NextResponse.json(
      { ok: false, error: "Invalid estateId or entryId" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  await connectToDatabase();

  const access = await enforceEstateAccess({
    estateId,
    userId: session.user.id,
    mode: "viewer",
  });
  if (access instanceof Response) return access as unknown as NextResponse;

  const entry = await TimeEntry.findOne({
    _id: entryId,
    estateId,
    ownerId: session.user.id,
  }).lean<TimeEntryRecord | null>();

  if (!entry) {
    return NextResponse.json({ ok: false, error: "Time entry not found" }, { status: 404, headers: NO_STORE_HEADERS });
  }

  return NextResponse.json({ ok: true, entry: serializeEntry(entry) }, { status: 200, headers: NO_STORE_HEADERS });
}

// ---- PUT (EDIT) -----------------------------------------------------------

export async function PUT(req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const { estateId, entryId } = await context.params;

  if (!estateId || !entryId) {
    return NextResponse.json(
      { ok: false, error: "Missing estateId or entryId" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  if (!isValidObjectId(estateId) || !isValidObjectId(entryId)) {
    return NextResponse.json(
      { ok: false, error: "Invalid estateId or entryId" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  await connectToDatabase();

  const access = await enforceEstateAccess({
    estateId,
    userId: session.user.id,
    mode: "editor",
  });
  if (access instanceof Response) return access as unknown as NextResponse;

  const raw = await req.json().catch(() => null);
  if (!isPlainObject(raw)) {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const body = raw;

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
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json(
        { ok: false, error: "Invalid date" },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }
    update.date = parsed;
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
    if (Number.isNaN(parsedRate) || parsedRate < 0) {
      return NextResponse.json(
        { ok: false, error: "Invalid rate" },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }
    update.rate = parsedRate;
  }

  if (taskId && typeof taskId === "string" && taskId.length > 0) {
    if (!isValidObjectId(taskId)) {
      return NextResponse.json(
        { ok: false, error: "Invalid taskId" },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }
    update.taskId = taskId;
  } else if (taskId === "") {
    // allow clearing taskId
    update.taskId = null;
  }

  if (minutes !== undefined) {
    update.minutes = minutes;
  }

  const existing = await TimeEntry.findOne({
    _id: entryId,
    estateId,
    ownerId: session.user.id,
  });

  if (!existing) {
    return NextResponse.json({ ok: false, error: "Time entry not found" }, { status: 404, headers: NO_STORE_HEADERS });
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

  return NextResponse.json({ ok: true, entry: serializeEntry(saved) }, { status: 200, headers: NO_STORE_HEADERS });
}

// ---- DELETE ---------------------------------------------------------------

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const { estateId, entryId } = await context.params;

  if (!estateId || !entryId) {
    return NextResponse.json(
      { ok: false, error: "Missing estateId or entryId" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  if (!isValidObjectId(estateId) || !isValidObjectId(entryId)) {
    return NextResponse.json(
      { ok: false, error: "Invalid estateId or entryId" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  await connectToDatabase();

  const access = await enforceEstateAccess({
    estateId,
    userId: session.user.id,
    mode: "editor",
  });
  if (access instanceof Response) return access as unknown as NextResponse;

  const deleted = await TimeEntry.findOneAndDelete({
    _id: entryId,
    estateId,
    ownerId: session.user.id,
  }).lean<TimeEntryRecord | null>();

  if (!deleted) {
    return NextResponse.json({ ok: false, error: "Time entry not found" }, { status: 404, headers: NO_STORE_HEADERS });
  }

  return NextResponse.json({ ok: true, entry: serializeEntry(deleted) }, { status: 200, headers: NO_STORE_HEADERS });
}