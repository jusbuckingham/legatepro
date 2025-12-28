import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { getEstateAccess } from "@/lib/estateAccess";
import { TimeEntry } from "@/models/TimeEntry";

type RouteParams = {
  params: Promise<{
    entryId: string;
  }>;
};

type TimeEntryLean = {
  _id: unknown;
  estateId?: unknown;
  ownerId?: unknown;
  date?: Date | string | null;
  minutes?: number | null;
  hourlyRate?: number | null;
  description?: string | null;
  notes?: string | null;
  activityType?: string | null;
  billable?: boolean | null;
  invoiced?: boolean | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
};

function isValidObjectId(value: string): boolean {
  return Types.ObjectId.isValid(value);
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function serializeEntry(entry: TimeEntryLean) {
  return {
    _id: String(entry._id),
    estateId: entry.estateId ? String(entry.estateId) : null,
    ownerId: entry.ownerId ? String(entry.ownerId) : null,
    date: toIso(entry.date),
    minutes: typeof entry.minutes === "number" ? entry.minutes : null,
    hourlyRate: typeof entry.hourlyRate === "number" ? entry.hourlyRate : null,
    description: entry.description ?? null,
    notes: entry.notes ?? null,
    activityType: entry.activityType ?? null,
    billable: typeof entry.billable === "boolean" ? entry.billable : null,
    invoiced: typeof entry.invoiced === "boolean" ? entry.invoiced : null,
    createdAt: toIso(entry.createdAt),
    updatedAt: toIso(entry.updatedAt),
  };
}

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  const userId = session?.user?.id;
  return typeof userId === "string" && userId.length > 0 ? userId : null;
}

async function getEntryId(paramsPromise: RouteParams["params"]): Promise<string> {
  const { entryId } = await paramsPromise;
  return entryId;
}

async function loadEntry(entryId: string): Promise<TimeEntryLean | null> {
  const doc = (await TimeEntry.findById(entryId).lean()) as TimeEntryLean | null;
  return doc;
}

export async function GET(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const userId = await requireUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();
    const entryId = await getEntryId(params);

    if (!isValidObjectId(entryId)) {
      return NextResponse.json({ ok: false, error: "Invalid entryId" }, { status: 400 });
    }

    const entry = await loadEntry(entryId);
    if (!entry) {
      return NextResponse.json({ ok: false, error: "Time entry not found" }, { status: 404 });
    }

    const estateId = entry.estateId ? String(entry.estateId) : "";
    if (!estateId) {
      return NextResponse.json(
        { ok: false, error: "Time entry missing estateId" },
        { status: 500 }
      );
    }

    const access = await getEstateAccess({ estateId, userId });
    if (!access) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(
      { ok: true, data: { entry: serializeEntry(entry) } },
      { status: 200 }
    );
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
    const userId = await requireUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();
    const entryId = await getEntryId(params);

    if (!isValidObjectId(entryId)) {
      return NextResponse.json({ ok: false, error: "Invalid entryId" }, { status: 400 });
    }

    const existing = await loadEntry(entryId);
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Time entry not found" }, { status: 404 });
    }

    const estateId = existing.estateId ? String(existing.estateId) : "";
    if (!estateId) {
      return NextResponse.json(
        { ok: false, error: "Time entry missing estateId" },
        { status: 500 }
      );
    }

    const access = await getEstateAccess({ estateId, userId });
    if (!access) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    if (access.role === "VIEWER") {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const {
      date,
      minutes,
      hours,
      hourlyRate,
      rate,
      description,
      notes,
      billable,
      isBillable,
      activityType,
      invoiced,
    } = body as {
      date?: string | Date;
      minutes?: number;
      hours?: number;
      hourlyRate?: number | null;
      rate?: number | null;
      description?: string;
      notes?: string;
      billable?: boolean;
      isBillable?: boolean;
      activityType?: string;
      invoiced?: boolean;
    };

    const updates: Record<string, unknown> = {};

    if (date !== undefined) {
      const iso = toIso(date instanceof Date ? date : String(date));
      if (!iso) {
        return NextResponse.json(
          { ok: false, error: "date must be a valid ISO date" },
          { status: 400 }
        );
      }
      updates.date = new Date(iso);
    }

    if (typeof minutes === "number") {
      updates.minutes = minutes;
    } else if (typeof hours === "number") {
      updates.minutes = Math.round(hours * 60);
    }

    if (hourlyRate !== undefined) updates.hourlyRate = hourlyRate;
    else if (rate !== undefined) updates.hourlyRate = rate;

    if (description !== undefined) updates.description = description;
    if (notes !== undefined) updates.notes = notes;
    if (activityType !== undefined) updates.activityType = activityType;

    if (typeof billable === "boolean") updates.billable = billable;
    else if (typeof isBillable === "boolean") updates.billable = isBillable;

    if (typeof invoiced === "boolean") updates.invoiced = invoiced;

    const updated = (await TimeEntry.findByIdAndUpdate(entryId, updates, {
      new: true,
      runValidators: true,
    }).lean()) as TimeEntryLean | null;

    if (!updated) {
      return NextResponse.json({ ok: false, error: "Time entry not found" }, { status: 404 });
    }

    return NextResponse.json(
      { ok: true, data: { entry: serializeEntry(updated) } },
      { status: 200 }
    );
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
    const userId = await requireUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();
    const entryId = await getEntryId(params);

    if (!isValidObjectId(entryId)) {
      return NextResponse.json({ ok: false, error: "Invalid entryId" }, { status: 400 });
    }

    const existing = await loadEntry(entryId);
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Time entry not found" }, { status: 404 });
    }

    const estateId = existing.estateId ? String(existing.estateId) : "";
    if (!estateId) {
      return NextResponse.json(
        { ok: false, error: "Time entry missing estateId" },
        { status: 500 }
      );
    }

    const access = await getEstateAccess({ estateId, userId });
    if (!access) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    if (access.role === "VIEWER") {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const deleted = (await TimeEntry.findByIdAndDelete(entryId).lean()) as TimeEntryLean | null;

    if (!deleted) {
      return NextResponse.json({ ok: false, error: "Time entry not found" }, { status: 404 });
    }

    return NextResponse.json(
      { ok: true, data: { success: true } },
      { status: 200 }
    );
  } catch (error) {
    console.error("[TIME_ENTRY_DELETE_ERROR]", error);
    return NextResponse.json(
      { ok: false, error: "Failed to delete time entry" },
      { status: 500 }
    );
  }
}