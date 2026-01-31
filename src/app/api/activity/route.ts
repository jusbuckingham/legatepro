// src/app/api/activity/route.ts
// Unified activity feed for estates (read-only)

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { buildEstateAccessOr, requireEstateAccess } from "@/lib/estateAccess";
import { EstateActivity } from "@/models/EstateActivity";
import { Estate } from "@/models/Estate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function idToString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);

  // Mongoose ObjectId and many doc-like values
  if (value && typeof value === "object") {
    const maybeId = (value as { _id?: unknown })._id;
    if (maybeId && typeof maybeId === "object" && typeof (maybeId as { toString?: unknown }).toString === "function") {
      const s = String(maybeId);
      return s === "[object Object]" ? "" : s;
    }

    if (typeof (value as { toString?: unknown }).toString === "function") {
      const s = String(value);
      return s === "[object Object]" ? "" : s;
    }
  }

  return "";
}

function stripMongoMeta<T extends Record<string, unknown>>(
  doc: T,
): Omit<T, "_id" | "__v"> & { id: string } {
  const { _id, ...rest } = doc as T & { _id?: unknown };
  return {
    ...(rest as Omit<T, "_id" | "__v">),
    id: idToString(_id),
  };
}

function jsonError(status: number, message: string): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function parsePositiveInt(
  value: string | null,
  fallback: number,
  max: number,
): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

// GET /api/activity
// Optional query params:
//   estateId: string  -> filter activity for a single estate
//   limit: number     -> max number of events (default 50, max 200)
export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return jsonError(401, "Unauthorized");

  try {
    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const estateId = searchParams.get("estateId") ?? undefined;
    const limit = parsePositiveInt(searchParams.get("limit"), 50, 200);

    // If requesting a specific estate, enforce viewer access
    if (estateId) {
      await requireEstateAccess({ estateId, userId });
    }

    // Otherwise, only return activity for estates the user can access
    let estateIds: string[];

    if (estateId) {
      estateIds = [estateId];
    } else {
      const estates = await Estate.find<{ _id: unknown }>(
        { $or: buildEstateAccessOr(userId) },
        { _id: 1 },
      )
        .lean()
        .exec();

      estateIds = estates.map((e) => idToString(e._id)).filter(Boolean);
    }

    if (estateIds.length === 0) {
      return NextResponse.json({ ok: true, activity: [] }, { status: 200 });
    }

    const activityRaw = await EstateActivity.find<Record<string, unknown>>({
      estateId: { $in: estateIds },
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();

    const activity = activityRaw.map((row) => {
      const base = stripMongoMeta(row);
      // Normalize common id fields if present
      const estateIdValue = (row as { estateId?: unknown }).estateId;
      return {
        ...base,
        ...(estateIdValue != null ? { estateId: idToString(estateIdValue) } : {}),
      };
    });

    return NextResponse.json({ ok: true, activity }, { status: 200 });
  } catch (error) {
    console.error("GET /api/activity error", error);
    return jsonError(500, "Unable to load activity");
  }
}
