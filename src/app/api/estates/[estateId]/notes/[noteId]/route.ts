import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { connectToDatabase } from "@/lib/db";
import { EstateNote } from "@/models/EstateNote";

type RouteParams = {
  params: Promise<{
    estateId: string;
    noteId: string;
  }>;
};

// GET /api/estates/[estateId]/notes/[noteId]
export async function GET(
  _req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { estateId, noteId } = await params;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const note = await EstateNote.findOne({
      _id: noteId,
      estateId,
      ownerId: session.user.id,
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

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const json = (await req.json()) as UpdateNotePayload;

    await connectToDatabase();

    const update: UpdateNotePayload = {};
    if (typeof json.subject === "string") update.subject = json.subject;
    if (typeof json.body === "string") update.body = json.body;
    if (typeof json.category === "string") update.category = json.category;
    if (typeof json.pinned === "boolean") update.pinned = json.pinned;

    const noteDoc = await EstateNote.findOne({
      _id: noteId,
      estateId,
      ownerId: session.user.id,
    });

    if (!noteDoc) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    const previousSubject = typeof (noteDoc as { subject?: unknown }).subject === "string" ? String((noteDoc as { subject?: unknown }).subject) : null;
    const previousCategory = typeof (noteDoc as { category?: unknown }).category === "string" ? String((noteDoc as { category?: unknown }).category) : null;
    const previousPinned = Boolean((noteDoc as { pinned?: unknown }).pinned);
    const previousBody = typeof (noteDoc as { body?: unknown }).body === "string" ? String((noteDoc as { body?: unknown }).body) : null;

    Object.assign(noteDoc, update);
    await noteDoc.save();

    const nextSubject = typeof (noteDoc as { subject?: unknown }).subject === "string" ? String((noteDoc as { subject?: unknown }).subject) : null;
    const nextCategory = typeof (noteDoc as { category?: unknown }).category === "string" ? String((noteDoc as { category?: unknown }).category) : null;
    const nextPinned = Boolean((noteDoc as { pinned?: unknown }).pinned);
    const nextBody = typeof (noteDoc as { body?: unknown }).body === "string" ? String((noteDoc as { body?: unknown }).body) : null;

    const didPinnedChange = previousPinned !== nextPinned;

    // Activity log: note updated / pinned / unpinned
    try {
      const previousBodyPreview = previousBody ? previousBody.trim().slice(0, 240) : null;
      const newBodyPreview = nextBody ? nextBody.trim().slice(0, 240) : null;

      await logActivity({
        ownerId: session.user.id,
        estateId: String(estateId),
        kind: "note",
        action: didPinnedChange ? (nextPinned ? "pinned" : "unpinned") : "updated",
        entityId: String(noteDoc._id),
        message: didPinnedChange ? (nextPinned ? "Note pinned" : "Note unpinned") : "Note updated",
        snapshot: {
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

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const deleted = await EstateNote.findOneAndDelete({
      _id: noteId,
      estateId,
      ownerId: session.user.id,
    }).lean();

    if (!deleted) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    // Activity log: note deleted
    try {
      const bodyText = typeof (deleted as { body?: unknown }).body === "string" ? String((deleted as { body?: unknown }).body).trim() : "";
      await logActivity({
        ownerId: session.user.id,
        estateId: String(estateId),
        kind: "note",
        action: "deleted",
        entityId: String((deleted as { _id: unknown })._id),
        message: "Note deleted",
        snapshot: {
          subject: (deleted as { subject?: unknown }).subject ?? null,
          category: (deleted as { category?: unknown }).category ?? null,
          pinned: Boolean((deleted as { pinned?: unknown }).pinned),
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