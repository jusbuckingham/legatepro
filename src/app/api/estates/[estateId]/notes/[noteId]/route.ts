import { NextRequest, NextResponse } from "next/server";

import { logActivity } from "@/lib/activity";
import { requireViewer, requireEditor } from "@/lib/estateAccess";
import { EstateNote } from "@/models/EstateNote";

type RouteParams = {
  params: Promise<{
    estateId: string;
    noteId: string;
  }>;
};

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

// GET /api/estates/[estateId]/notes/[noteId]
export async function GET(
  _req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { estateId, noteId } = await params;

    // Enforce estate access (collaborators allowed)
    const access = await requireViewer(estateId);
    if (!access.ok) return access.res;

    const note = await EstateNote.findOne({
      _id: noteId,
      estateId,
    }).lean();

    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    return NextResponse.json({ note }, { status: 200 });
  } catch (error) {
    console.error("[GET /api/estates/[estateId]/notes/[noteId]] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch note" },
      { status: 500 }
    );
  }
}

interface UpdateNotePayload {
  subject?: string;
  body?: string;
  category?: string;
  pinned?: boolean;
}

// PATCH /api/estates/[estateId]/notes/[noteId]
export async function PATCH(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { estateId, noteId } = await params;

    // Enforce estate access (collaborators allowed) + edit permission
    const access = await requireEditor(estateId);
    if (!access.ok) return access.res;

    const json = (await req.json()) as UpdateNotePayload;

    const update: UpdateNotePayload = {};
    if (typeof json.subject === "string") update.subject = json.subject;
    if (typeof json.body === "string") update.body = json.body;
    if (typeof json.category === "string") update.category = json.category;
    if (typeof json.pinned === "boolean") update.pinned = json.pinned;

    const noteDoc = await EstateNote.findOne({
      _id: noteId,
      estateId,
    });

    if (!noteDoc) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    const beforeObj = typeof noteDoc.toObject === "function" ? (noteDoc.toObject() as unknown) : (noteDoc as unknown);
    const previousSubject = getString(beforeObj, "subject");
    const previousCategory = getString(beforeObj, "category");
    const previousPinned = getBoolean(beforeObj, "pinned");
    const previousBody = getString(beforeObj, "body");

    Object.assign(noteDoc, update);
    await noteDoc.save();

    const afterObj = typeof noteDoc.toObject === "function" ? (noteDoc.toObject() as unknown) : (noteDoc as unknown);
    const nextSubject = getString(afterObj, "subject");
    const nextCategory = getString(afterObj, "category");
    const nextPinned = getBoolean(afterObj, "pinned");
    const nextBody = getString(afterObj, "body");

    const didPinnedChange = previousPinned !== nextPinned;

    // Activity log: note updated / pinned / unpinned
    try {
      const previousBodyPreview = previousBody ? previousBody.trim().slice(0, 240) : null;
      const newBodyPreview = nextBody ? nextBody.trim().slice(0, 240) : null;

      const kind = "NOTE" as unknown as Parameters<typeof logActivity>[0]["kind"];
      const action = didPinnedChange ? (nextPinned ? "PINNED" : "UNPINNED") : "UPDATED";

      await logActivity({
        ownerId: access.userId,
        estateId: String(estateId),
        kind,
        action,
        entityId: String(noteDoc._id),
        message: didPinnedChange ? (nextPinned ? "Note pinned" : "Note unpinned") : "Note updated",
        snapshot: {
          noteId: String(noteDoc._id),
          previousSubject,
          newSubject: nextSubject,
          previousCategory,
          newCategory: nextCategory,
          previousPinned,
          newPinned: nextPinned,
          previousBodyPreview,
          newBodyPreview,
        },
      });
    } catch {
      // Don't block note update if activity logging fails
    }

    const note = noteDoc.toObject();
    return NextResponse.json({ note }, { status: 200 });
  } catch (error) {
    console.error(
      "[PATCH /api/estates/[estateId]/notes/[noteId]] Error:",
      error
    );
    return NextResponse.json(
      { error: "Failed to update note" },
      { status: 500 }
    );
  }
}

// DELETE /api/estates/[estateId]/notes/[noteId]
export async function DELETE(
  _req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { estateId, noteId } = await params;

    // Enforce estate access (collaborators allowed) + edit permission
    const access = await requireEditor(estateId);
    if (!access.ok) return access.res;

    const deleted = await EstateNote.findOneAndDelete({
      _id: noteId,
      estateId,
    }).lean();

    if (!deleted) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    // Activity log: note deleted
    try {
      const kind = "NOTE" as unknown as Parameters<typeof logActivity>[0]["kind"];
      const deletedObj = deleted as unknown;

      const bodyRaw = getString(deletedObj, "body") ?? "";
      const bodyText = bodyRaw.trim();

      await logActivity({
        ownerId: access.userId,
        estateId: String(estateId),
        kind,
        action: "DELETED",
        entityId: String(asRecord(deletedObj)._id ?? noteId),
        message: "Note deleted",
        snapshot: {
          noteId: String(asRecord(deletedObj)._id ?? noteId),
          subject: getString(deletedObj, "subject"),
          category: getString(deletedObj, "category"),
          pinned: getBoolean(deletedObj, "pinned"),
          bodyPreview: bodyText ? bodyText.slice(0, 240) : null,
        },
      });
    } catch {
      // Don't block note deletion if activity logging fails
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error(
      "[DELETE /api/estates/[estateId]/notes/[noteId]] Error:",
      error
    );
    return NextResponse.json(
      { error: "Failed to delete note" },
      { status: 500 }
    );
  }
}