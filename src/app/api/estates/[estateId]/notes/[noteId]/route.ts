import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { requireEstateAccess, requireEstateEditAccess } from "@/lib/estateAccess";
import { EstateNote } from "@/models/EstateNote";

type RouteParams = {
  params: Promise<{
    estateId: string;
    noteId: string;
  }>;
};

function isResponseLike(v: unknown): v is Response {
  return v instanceof Response;
}

async function requireView(estateId: string, userId: string): Promise<Response | { estateId: string; userId: string }> {
  const res = await requireEstateAccess({ estateId, userId });
  if (isResponseLike(res)) return res;
  return { estateId, userId };
}

async function requireEdit(estateId: string, userId: string): Promise<Response | { estateId: string; userId: string }> {
  const res = await requireEstateEditAccess({ estateId, userId });
  if (isResponseLike(res)) return res;
  return { estateId, userId };
}

async function safeLog(input: Record<string, unknown>) {
  try {
    const fn = logActivity as unknown as (args: Record<string, unknown>) => Promise<unknown>;
    await fn(input);
  } catch {
    // never block API responses on activity logging
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

// GET /api/estates/[estateId]/notes/[noteId]
export async function GET(
  _req: NextRequest,
  { params }: RouteParams
): Promise<Response> {
  try {
    const { estateId, noteId } = await params;

    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Enforce estate access (collaborators allowed)
    const access = await requireView(estateId, userId);
    if (isResponseLike(access)) return access;

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
): Promise<Response> {
  try {
    const { estateId, noteId } = await params;

    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Enforce estate access (collaborators allowed) + edit permission
    const access = await requireEdit(estateId, userId);
    if (isResponseLike(access)) return access;

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
    const previousBodyPreview = previousBody ? previousBody.trim().slice(0, 240) : null;
    const newBodyPreview = nextBody ? nextBody.trim().slice(0, 240) : null;
    const action = didPinnedChange ? (nextPinned ? "PINNED" : "UNPINNED") : "UPDATED";

    await safeLog({
      estateId: String(estateId),
      kind: "NOTE",
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
): Promise<Response> {
  try {
    const { estateId, noteId } = await params;

    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Enforce estate access (collaborators allowed) + edit permission
    const access = await requireEdit(estateId, userId);
    if (isResponseLike(access)) return access;

    const deleted = await EstateNote.findOneAndDelete({
      _id: noteId,
      estateId,
    }).lean();

    if (!deleted) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    // Activity log: note deleted
    const deletedObj = deleted as unknown;

    const bodyRaw = getString(deletedObj, "body") ?? "";
    const bodyText = bodyRaw.trim();

    await safeLog({
      estateId: String(estateId),
      kind: "NOTE",
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