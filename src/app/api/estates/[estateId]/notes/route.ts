import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { EstateNote } from "@/models/EstateNote";
import { requireEstateAccess, requireEstateEditAccess } from "@/lib/estateAccess";

type RouteParams = {
  params: Promise<{
    estateId: string;
  }>;
};

async function requireViewerAccess(
  estateId: string
): Promise<{ userId: string } | NextResponse> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const input = { estateId, userId } as unknown as Parameters<typeof requireEstateAccess>[0];
    const result = (await requireEstateAccess(input)) as unknown;

    // Some implementations may return a response directly.
    if (result instanceof NextResponse) return result;

    return { userId };
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

async function requireEditorAccess(
  estateId: string
): Promise<{ userId: string } | NextResponse> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const input = { estateId, userId } as unknown as Parameters<typeof requireEstateEditAccess>[0];
    const result = (await requireEstateEditAccess(input)) as unknown;

    // Some implementations may return a response directly.
    if (result instanceof NextResponse) return result;

    return { userId };
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}

async function safeLog(input: unknown) {
  try {
    await (logActivity as unknown as (args: unknown) => Promise<unknown>)(input);
  } catch {
    // swallow
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

    const access = await requireViewerAccess(estateId);
    if (access instanceof NextResponse) return access;

    const notes = await EstateNote.find({
      estateId,
    })
      .sort({ pinned: -1, createdAt: -1 })
      .lean();

    return NextResponse.json({ notes }, { status: 200 });
  } catch (error) {
    console.error("[GET /api/estates/[estateId]/notes] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch notes" },
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

    const access = await requireEditorAccess(estateId);
    if (access instanceof NextResponse) return access;

    const json = (await req.json()) as CreateNotePayload;

    if (!json.subject || !json.body) {
      return NextResponse.json(
        { error: "Subject and body are required" },
        { status: 400 }
      );
    }

    const note = await EstateNote.create({
      ownerId: access.userId,
      estateId,
      subject: json.subject,
      body: json.body,
      category: json.category ?? "GENERAL",
      pinned: Boolean(json.pinned),
    });

    // Activity log: note created
    const noteObj = typeof note.toObject === "function" ? (note.toObject() as unknown) : (note as unknown);

    const bodyRaw = getString(noteObj, "body") ?? "";
    const bodyText = bodyRaw.trim();

    const kind = "NOTE";

    const subject = getString(noteObj, "subject");
    const category = getString(noteObj, "category");
    const pinned = getBoolean(noteObj, "pinned");

    await safeLog({
      estateId: String(estateId),
      kind,
      action: "CREATED",
      entityId: String(note._id),
      message: "Note created",
      snapshot: {
        noteId: String(note._id),
        subject,
        category,
        pinned,
        bodyPreview: bodyText ? bodyText.slice(0, 240) : null,
      },
    });

    return NextResponse.json({ note }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/estates/[estateId]/notes] Error:", error);
    return NextResponse.json(
      { error: "Failed to create note" },
      { status: 500 }
    );
  }
}

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object") return v as Record<string, unknown>;
  return {};
}

function getString(obj: unknown, key: string): string | null {
  const rec = asRecord(obj);
  const val = rec[key];
  return typeof val === "string" ? val : null;
}

function getBoolean(obj: unknown, key: string): boolean {
  const rec = asRecord(obj);
  return Boolean(rec[key]);
}