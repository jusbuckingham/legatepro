import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { TimeEntry } from "@/models/TimeEntry";
import { serializeMongoDoc } from "@/lib/db";

// Next's generated route validator (in .next/dev/types/validator.ts) currently expects
// `context.params` to be a Promise for dynamic segments.
type RouteContext = {
  params: Promise<{
    entryId: string;
  }>;
};

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { entryId } = await params;

  if (!entryId || entryId.trim().length === 0) {
    return NextResponse.json({ ok: false, error: "Missing entryId" }, { status: 400 });
  }

  const doc = await TimeEntry.findById(entryId).lean().exec();
  if (!doc) {
    return NextResponse.json({ ok: false, error: "Time entry not found" }, { status: 404 });
  }

  const out = serializeMongoDoc(doc);
  return NextResponse.json({ ok: true, entry: out });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { entryId } = await params;

  if (!entryId || entryId.trim().length === 0) {
    return NextResponse.json({ ok: false, error: "Missing entryId" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  // Only allow updating known fields; keep this conservative.
  const update: Record<string, unknown> = {};
  if ("date" in body) update.date = body.date;
  if ("hours" in body) update.hours = body.hours;
  if ("minutes" in body) update.minutes = body.minutes;
  if ("rate" in body) update.rate = body.rate;
  if ("description" in body) update.description = body.description;
  if ("notes" in body) update.notes = body.notes;
  if ("taskId" in body) update.taskId = body.taskId;

  const updated = await TimeEntry.findByIdAndUpdate(entryId, update, { new: true }).lean().exec();
  if (!updated) {
    return NextResponse.json({ ok: false, error: "Time entry not found" }, { status: 404 });
  }

  const out = serializeMongoDoc(updated);
  return NextResponse.json({ ok: true, entry: out });
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { entryId } = await params;

  if (!entryId || entryId.trim().length === 0) {
    return NextResponse.json({ ok: false, error: "Missing entryId" }, { status: 400 });
  }

  const deleted = await TimeEntry.findByIdAndDelete(entryId).lean().exec();
  if (!deleted) {
    return NextResponse.json({ ok: false, error: "Time entry not found" }, { status: 404 });
  }

  const out = serializeMongoDoc(deleted);
  return NextResponse.json({ ok: true, entry: out });
}