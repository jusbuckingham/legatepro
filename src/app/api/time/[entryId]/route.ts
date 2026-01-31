import type { NextRequest } from "next/server";

import { jsonErr, jsonOk, noStoreHeaders, safeErrorMessage } from "@/lib/apiResponse";
import { Types } from "mongoose";
import { TimeEntry } from "@/models/TimeEntry";
import { connectToDatabase, serializeMongoDoc } from "@/lib/db";

// Next's generated route validator (in .next/dev/types/validator.ts) currently expects
// `context.params` to be a Promise for dynamic segments.
type RouteContext = {
  params: Promise<{
    entryId: string;
  }>;
};

function isValidObjectId(value: string): boolean {
  return Types.ObjectId.isValid(value);
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { headers: noStoreHeaders() } as const;

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { entryId } = await params;

    await connectToDatabase();

    if (!entryId || entryId.trim().length === 0) {
      return jsonOk({ ok: false, error: "Missing entryId" }, 400, NO_STORE.headers);
    }

    if (!isValidObjectId(entryId)) {
      return jsonOk({ ok: false, error: "Invalid entryId" }, 400, NO_STORE.headers);
    }

    const doc = await TimeEntry.findById(entryId).lean().exec();
    if (!doc) {
      return jsonOk({ ok: false, error: "Time entry not found" }, 404, NO_STORE.headers);
    }

    const out = serializeMongoDoc(doc);
    return jsonOk({ ok: true, entry: out }, 200, NO_STORE.headers);
  } catch (error) {
    console.error("[GET /api/time/[entryId]] Error:", safeErrorMessage(error));
    return jsonErr("Failed to load time entry", 500, NO_STORE.headers, "INTERNAL_ERROR");
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { entryId } = await params;

    await connectToDatabase();

    if (!entryId || entryId.trim().length === 0) {
      return jsonOk({ ok: false, error: "Missing entryId" }, 400, NO_STORE.headers);
    }

    if (!isValidObjectId(entryId)) {
      return jsonOk({ ok: false, error: "Invalid entryId" }, 400, NO_STORE.headers);
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return jsonOk({ ok: false, error: "Invalid body" }, 400, NO_STORE.headers);
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
      return jsonOk({ ok: false, error: "Time entry not found" }, 404, NO_STORE.headers);
    }

    const out = serializeMongoDoc(updated);
    return jsonOk({ ok: true, entry: out }, 200, NO_STORE.headers);
  } catch (error) {
    console.error("[PATCH /api/time/[entryId]] Error:", safeErrorMessage(error));
    return jsonErr("Failed to update time entry", 500, NO_STORE.headers, "INTERNAL_ERROR");
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const { entryId } = await params;

    await connectToDatabase();

    if (!entryId || entryId.trim().length === 0) {
      return jsonOk({ ok: false, error: "Missing entryId" }, 400, NO_STORE.headers);
    }

    if (!isValidObjectId(entryId)) {
      return jsonOk({ ok: false, error: "Invalid entryId" }, 400, NO_STORE.headers);
    }

    const deleted = await TimeEntry.findByIdAndDelete(entryId).lean().exec();
    if (!deleted) {
      return jsonOk({ ok: false, error: "Time entry not found" }, 404, NO_STORE.headers);
    }

    const out = serializeMongoDoc(deleted);
    return jsonOk({ ok: true, entry: out }, 200, NO_STORE.headers);
  } catch (error) {
    console.error("[DELETE /api/time/[entryId]] Error:", safeErrorMessage(error));
    return jsonErr("Failed to delete time entry", 500, NO_STORE.headers, "INTERNAL_ERROR");
  }
}