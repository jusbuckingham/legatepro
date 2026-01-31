import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getEstateAccess } from "@/lib/estateAccess";
import { getEstateEvents, logEstateEvent } from "@/lib/estateEvents";
import type { EstateEventType } from "@/models/EstateEvent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseLimit(value: string | null, fallback = 25) {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(100, n));
}

function parseTypes(value: string | null): EstateEventType[] | undefined {
  if (!value) return undefined;

  const raw = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (raw.length === 0) return undefined;

  // De-dupe while preserving order
  const seen = new Set<string>();
  const out: EstateEventType[] = [];
  for (const t of raw) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t as EstateEventType);
  }

  return out;
}

function parseCursor(value: string | null): string | undefined {
  if (!value) return undefined;
  const v = value.trim();
  if (!v) return undefined;

  // Accept ISO timestamps that Date.parse can understand.
  const ms = Date.parse(v);
  if (!Number.isFinite(ms)) return undefined;

  return v;
}

function mergeTypes(
  repeated: string[],
  csv: string | null
): EstateEventType[] | undefined {
  const fromRepeated =
    repeated.length > 0
      ? parseTypes(repeated.join(","))
      : undefined;
  const fromCsv = parseTypes(csv);

  if (!fromRepeated && !fromCsv) return undefined;

  const merged: EstateEventType[] = [];
  const seen = new Set<string>();

  for (const list of [fromRepeated ?? [], fromCsv ?? []]) {
    for (const t of list) {
      if (seen.has(t)) continue;
      seen.add(t);
      merged.push(t);
    }
  }

  return merged.length > 0 ? merged : undefined;
}

/**
 * GET /api/estates/[estateId]/activity
 * Requires VIEWER access.
 * Query params:
 * - limit: number (1..100), default 25
 * - cursor: ISO timestamp (createdAt), exclusive; for pagination
 * - types: CSV of event types (optional)
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ estateId: string }> }
) {
  const { estateId } = await ctx.params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const access = await getEstateAccess({
    estateId,
    userId: session.user.id,
    atLeastRole: "VIEWER",
  });

  if (!access) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);

  const limit = parseLimit(searchParams.get("limit"), 25);

  const cursorRaw = searchParams.get("cursor");
  const cursor = parseCursor(cursorRaw);
  if (cursorRaw && !cursor) {
    return NextResponse.json(
      { ok: false, error: "Invalid cursor" },
      { status: 400 }
    );
  }

  // Supports both CSV (?types=A,B) and repeated params (?types=A&types=B)
  const typesRepeated = searchParams.getAll("types").filter(Boolean);
  const typesCsv = searchParams.get("types");
  const types = mergeTypes(typesRepeated, typesCsv);

  const { rows, nextCursor } = await getEstateEvents({
    estateId,
    types,
    limit,
    cursor,
  });

  return NextResponse.json(
    { ok: true, estateId, events: rows, nextCursor },
    { status: 200 }
  );
}

type AddNoteBody = {
  note?: string;
  meta?: Record<string, unknown>;
};

/**
 * POST /api/estates/[estateId]/activity
 * Add a note to the activity timeline.
 * Requires EDITOR access.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ estateId: string }> }
) {
  const { estateId } = await ctx.params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const access = await getEstateAccess({
    estateId,
    userId: session.user.id,
    atLeastRole: "EDITOR",
  });

  if (!access) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let body: AddNoteBody;
  try {
    body = (await req.json()) as AddNoteBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (!note) {
    return NextResponse.json({ ok: false, error: "Missing note" }, { status: 400 });
  }
  if (note.length > 5000) {
    return NextResponse.json({ ok: false, error: "Note is too long" }, { status: 400 });
  }

  if (body.meta && typeof body.meta !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid meta" }, { status: 400 });
  }

  await logEstateEvent({
    ownerId: session.user.id,
    estateId,
    type: "NOTE_ADDED" as const as EstateEventType,
    summary: "Note added",
    detail: note,
    meta: body.meta,
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}