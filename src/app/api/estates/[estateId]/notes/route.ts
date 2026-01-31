import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { logEstateEvent } from "@/lib/estateEvents";
import { EstateNote } from "@/models/EstateNote";
import { requireEstateAccess, requireEstateEditAccess } from "@/lib/estateAccess";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{
    estateId: string;
  }>;
};

const MAX_NOTES_LIST = 200;
const MAX_SUBJECT_LEN = 140;
const MAX_BODY_LEN = 10_000;
const MAX_CATEGORY_LEN = 32;

const MAX_BODY_PREVIEW_LEN = 500;

const MAX_QUERY_LEN = 64;

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function previewText(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "…";
}

async function safeLogEvent(args: Parameters<typeof logEstateEvent>[0]) {
  try {
    await logEstateEvent(args);
  } catch (e) {
    // Never block the API response if event logging fails
    console.warn("[notes] Failed to log estate event", e);
  }
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isValidEstateId(estateId: unknown): estateId is string {
  return typeof estateId === "string" && estateId.trim().length > 0 && estateId.trim().length <= 128;
}

function normalizeCategory(input: unknown): string {
  if (!isNonEmptyString(input)) return "GENERAL";
  const raw = input.trim().toUpperCase().slice(0, MAX_CATEGORY_LEN);

  // Keep categories predictable (alnum + underscore). Fallback to GENERAL.
  if (!/^[A-Z0-9_]+$/.test(raw)) return "GENERAL";
  return raw;
}

function isResponseLike(value: unknown): value is Response {
  return typeof value === "object" && value !== null && value instanceof Response;
}

function getFailureResponse(access: unknown): NextResponse | undefined {
  if (!access || typeof access !== "object") return undefined;
  const anyAccess = access as Record<string, unknown>;

  // Support older helper shape: { ok: boolean; res: NextResponse }
  if (anyAccess.ok === false && isResponseLike(anyAccess.res)) {
    return anyAccess.res as NextResponse;
  }

  // Support helpers that return a Response/NextResponse on failure
  if (isResponseLike(access)) {
    return access as NextResponse;
  }

  return undefined;
}

async function requireAccess(
  estateId: string,
  mode: "view" | "edit"
): Promise<{ userId: string } | NextResponse> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const input = { estateId, userId } as Parameters<typeof requireEstateAccess>[0];

    await connectToDatabase();

    const result =
      mode === "edit" ? await requireEstateEditAccess(input) : await requireEstateAccess(input);

    const failure = getFailureResponse(result);
    if (failure) return failure;

    // If the helper didn't throw and didn't return a failure response, treat as authorized.
    return { userId };
  } catch {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
}

async function safeJson<T>(req: NextRequest): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    const value = (await req.json()) as T;
    return { ok: true, value };
  } catch {
    return { ok: false };
  }
}

// GET /api/estates/[estateId]/notes
// List notes for an estate
export async function GET(
  _req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { estateId } = await params;

    if (!isValidEstateId(estateId)) {
      return NextResponse.json({ ok: false, error: "Invalid estateId" }, { status: 400 });
    }

    const access = await requireAccess(estateId, "view");
    if (access instanceof NextResponse) return access;

    const { searchParams } = new URL(_req.url);
    const q = (searchParams.get("q")?.trim() ?? "").slice(0, MAX_QUERY_LEN);
    const category = searchParams.get("category")?.trim() ?? "";
    const pinnedParam = searchParams.get("pinned")?.trim() ?? "";

    const where: Record<string, unknown> = { estateId };

    if (isNonEmptyString(category)) {
      where.category = normalizeCategory(category);
    }

    if (pinnedParam === "1" || pinnedParam === "true") {
      where.pinned = true;
    } else if (pinnedParam === "0" || pinnedParam === "false") {
      where.pinned = false;
    }

    if (isNonEmptyString(q)) {
      const safeQ = escapeRegex(q);
      where.$or = [
        { subject: { $regex: safeQ, $options: "i" } },
        { body: { $regex: safeQ, $options: "i" } },
      ];
    }

    await connectToDatabase();
    const notes = await EstateNote.find(
      where,
      { subject: 1, body: 1, category: 1, pinned: 1, createdAt: 1, updatedAt: 1, ownerId: 1 }
    )
      .sort({ pinned: -1, createdAt: -1 })
      .limit(MAX_NOTES_LIST)
      .lean();

    return NextResponse.json({ ok: true, notes }, { status: 200 });
  } catch (error) {
    console.error("[GET /api/estates/[estateId]/notes] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch notes" },
      { status: 500 }
    );
  }
}

interface CreateNotePayload {
  subject: string;
  body: string;
  category?: string;
  pinned?: boolean;
}

// POST /api/estates/[estateId]/notes
// Create a new note
export async function POST(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { estateId } = await params;

    if (!isValidEstateId(estateId)) {
      return NextResponse.json({ ok: false, error: "Invalid estateId" }, { status: 400 });
    }

    const access = await requireAccess(estateId, "edit");
    if (access instanceof NextResponse) return access;

    const parsed = await safeJson<CreateNotePayload>(req);
    if (!parsed.ok) {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const json = parsed.value;

    const subjectRaw = isNonEmptyString(json.subject) ? json.subject.trim() : "";
    const bodyTrimmed = isNonEmptyString(json.body) ? json.body.trim() : "";

    if (!subjectRaw || !bodyTrimmed) {
      return NextResponse.json(
        { ok: false, error: "Subject and body are required" },
        { status: 400 }
      );
    }

    if (subjectRaw.length > MAX_SUBJECT_LEN) {
      return NextResponse.json(
        { ok: false, error: `Subject is too long (max ${MAX_SUBJECT_LEN})` },
        { status: 400 }
      );
    }

    if (bodyTrimmed.length > MAX_BODY_LEN) {
      return NextResponse.json(
        { ok: false, error: `Body is too long (max ${MAX_BODY_LEN})` },
        { status: 400 }
      );
    }

    const categoryUpper = normalizeCategory(json.category);

    await connectToDatabase();

    const note = await EstateNote.create({
      ownerId: access.userId,
      estateId,
      subject: subjectRaw,
      body: bodyTrimmed,
      category: categoryUpper,
      pinned: Boolean(json.pinned),
    });

    await safeLogEvent({
      ownerId: access.userId,
      estateId,
      type: "NOTE_CREATED",
      summary: "Note created",
      detail: subjectRaw,
      meta: {
        noteId: String(note._id),
        actorId: access.userId,
        subject: subjectRaw,
        category: categoryUpper,
        pinned: Boolean(json.pinned),
        bodyPreview: previewText(bodyTrimmed, MAX_BODY_PREVIEW_LEN),
      },
    });

    return NextResponse.json({ ok: true, note }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/estates/[estateId]/notes] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to create note" },
      { status: 500 }
    );
  }
}