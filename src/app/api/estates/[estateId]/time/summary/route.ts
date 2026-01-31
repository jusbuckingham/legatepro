

import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { requireEstateAccess } from "@/lib/estateAccess";
import { TimeEntry } from "@/models/TimeEntry";

type RouteContext = {
  params: Promise<{
    estateId: string;
  }>;
};

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

function isValidObjectId(id: string): boolean {
  return Types.ObjectId.isValid(id);
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

async function enforceEstateView(opts: {
  estateId: string;
  userId: string;
}): Promise<Response | true> {
  const out = (await requireEstateAccess({
    estateId: opts.estateId,
    userId: opts.userId,
  })) as unknown;
  const maybe = pickResponse(out);
  if (maybe) return maybe;
  return true;
}

function parseDateParam(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

/**
 * GET /api/estates/:estateId/time/summary
 *
 * Optional query params:
 *   - start: ISO date/time
 *   - end: ISO date/time
 *
 * Notes:
 * - Owner scoped (only the current user's entries).
 * - Uses `minutes` as the duration field (matches existing time endpoints).
 */
export async function GET(req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const { estateId } = await params;
  if (!isValidObjectId(estateId)) {
    return NextResponse.json(
      { ok: false, error: "Invalid id" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  await connectToDatabase();

  const access = await enforceEstateView({ estateId, userId: session.user.id });
  if (access instanceof Response) {
    const cloned = new Response(access.body, access);
    cloned.headers.set("Cache-Control", "no-store");
    return cloned;
  }

  const url = new URL(req.url);
  const start = parseDateParam(url.searchParams.get("start"));
  const end = parseDateParam(url.searchParams.get("end"));

  if (url.searchParams.has("start") && !start) {
    return NextResponse.json(
      { ok: false, error: "Invalid start" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  if (url.searchParams.has("end") && !end) {
    return NextResponse.json(
      { ok: false, error: "Invalid end" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const match: Record<string, unknown> = {
    estateId,
    ownerId: session.user.id,
  };

  // If your TimeEntry model uses a different date field, adjust here.
  if (start || end) {
    match.date = {};
    if (start) (match.date as Record<string, unknown>).$gte = start;
    if (end) (match.date as Record<string, unknown>).$lte = end;
  }

  // Summary aggregation. Assumes `minutes` is a Number.
  const [row] = await TimeEntry.aggregate<{
    totalEntries: number;
    totalMinutes: number;
    billableMinutes: number;
    nonBillableMinutes: number;
    billedMinutes: number;
    unbilledBillableMinutes: number;
    invoicedMinutes: number;
  }>([
    { $match: match },
    {
      $group: {
        _id: null,
        totalEntries: { $sum: 1 },
        totalMinutes: { $sum: { $ifNull: ["$minutes", 0] } },
        billableMinutes: {
          $sum: {
            $cond: [{ $eq: ["$billable", true] }, { $ifNull: ["$minutes", 0] }, 0],
          },
        },
        nonBillableMinutes: {
          $sum: {
            $cond: [{ $ne: ["$billable", true] }, { $ifNull: ["$minutes", 0] }, 0],
          },
        },
        billedMinutes: {
          $sum: {
            $cond: [{ $eq: ["$billed", true] }, { $ifNull: ["$minutes", 0] }, 0],
          },
        },
        unbilledBillableMinutes: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ["$billable", true] }, { $ne: ["$billed", true] }] },
              { $ifNull: ["$minutes", 0] },
              0,
            ],
          },
        },
        invoicedMinutes: {
          $sum: {
            $cond: [{ $eq: ["$invoiced", true] }, { $ifNull: ["$minutes", 0] }, 0],
          },
        },
      },
    },
    { $project: { _id: 0 } },
  ]);

  const safe = row ?? {
    totalEntries: 0,
    totalMinutes: 0,
    billableMinutes: 0,
    nonBillableMinutes: 0,
    billedMinutes: 0,
    unbilledBillableMinutes: 0,
    invoicedMinutes: 0,
  };

  const summary = {
    range: {
      start: start ? start.toISOString() : null,
      end: end ? end.toISOString() : null,
    },
    totalEntries: safe.totalEntries,
    totalMinutes: safe.totalMinutes,
    totalHours: minutesToHours(safe.totalMinutes),

    billableMinutes: safe.billableMinutes,
    billableHours: minutesToHours(safe.billableMinutes),

    nonBillableMinutes: safe.nonBillableMinutes,
    nonBillableHours: minutesToHours(safe.nonBillableMinutes),

    billedMinutes: safe.billedMinutes,
    billedHours: minutesToHours(safe.billedMinutes),

    unbilledBillableMinutes: safe.unbilledBillableMinutes,
    unbilledBillableHours: minutesToHours(safe.unbilledBillableMinutes),

    invoicedMinutes: safe.invoicedMinutes,
    invoicedHours: minutesToHours(safe.invoicedMinutes),
  };

  return NextResponse.json(
    { ok: true, summary },
    { status: 200, headers: NO_STORE_HEADERS },
  );
}

export const dynamic = "force-dynamic";