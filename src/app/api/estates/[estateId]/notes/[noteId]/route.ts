import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { requireEstateAccess, requireEstateEditAccess } from "@/lib/estateAccess";
import { EstateNote } from "@/models/EstateNote";
import { logEstateEvent } from "@/lib/estateEvents";

interface RouteParams {
  params: Promise<{
    estateId: string;
    noteId: string;
  }>;
}

type EstateRole = "OWNER" | "EDITOR" | "VIEWER";

type EstateNoteLean = {
  _id: unknown;
  estateId?: string | null;
  ownerId?: string | null;
  body?: string | null;
  pinned?: boolean | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
};

function isValidObjectIdString(id: unknown): id is string {
  return typeof id === "string" && mongoose.Types.ObjectId.isValid(id);
}

function toObjectId(id: unknown) {
  return isValidObjectIdString(id) ? new mongoose.Types.ObjectId(id) : null;
}

function getRoleFromAccess(access: unknown): EstateRole | undefined {
  if (!access || typeof access !== "object") return undefined;
  const role = (access as Record<string, unknown>).role;
  return role === "OWNER" || role === "EDITOR" || role === "VIEWER" ? role : undefined;
}

async function safeJson(
  request: NextRequest
): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    const value = await request.json();
    return { ok: true, value };
  } catch {
    return { ok: false };
  }
}

function normalizeBody(value: unknown, maxLen = 20_000): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  if (!v) return "";
  return v.length > maxLen ? v.slice(0, maxLen) : v;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { estateId, noteId } = await params;

    const estateObjectId = toObjectId(estateId);
    const noteObjectId = toObjectId(noteId);
    if (!estateObjectId || !noteObjectId) {
      return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    }

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    // Any estate member can view notes (VIEWER is read-only).
    await requireEstateAccess({ estateId, userId: session.user.id });

    const note = await EstateNote.findOne({ _id: noteObjectId, estateId: estateObjectId })
      .lean<EstateNoteLean>()
      .exec();

    if (!note) {
      return NextResponse.json({ ok: false, error: "Note not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, note }, { status: 200 });
  } catch (error) {
    console.error("[GET /api/estates/[estateId]/notes/[noteId]] Error:", error);
    return NextResponse.json({ ok: false, error: "Failed to fetch note" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { estateId, noteId } = await params;

    const estateObjectId = toObjectId(estateId);
    const noteObjectId = toObjectId(noteId);
    if (!estateObjectId || !noteObjectId) {
      return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    }

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    // Editors/owners only.
    const access = await requireEstateEditAccess({ estateId, userId: session.user.id });
    const role = getRoleFromAccess(access) ?? "VIEWER";

    // requireEstateEditAccess should only allow OWNER/EDITOR. Fail closed.
    if (role !== "OWNER" && role !== "EDITOR") {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const parsed = await safeJson(request);
    if (
      !parsed.ok ||
      !parsed.value ||
      typeof parsed.value !== "object" ||
      Array.isArray(parsed.value)
    ) {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const updateObj = parsed.value as Record<string, unknown>;

    const updates: Record<string, unknown> = {};
    const updatedFields: string[] = [];

    // body
    if ("body" in updateObj) {
      const nextBody = normalizeBody(updateObj.body);
      if (nextBody !== undefined) {
        updates.body = nextBody;
        updatedFields.push("body");
      }
    }

    // pinned
    if ("pinned" in updateObj) {
      const nextPinned = Boolean(updateObj.pinned);
      // Policy: only OWNER can pin/unpin.
      if (role !== "OWNER") {
        return NextResponse.json(
          { ok: false, error: "Only the owner can pin/unpin notes" },
          { status: 403 }
        );
      }
      updates.pinned = nextPinned;
      updatedFields.push("pinned");
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: false, error: "No valid fields provided" }, { status: 400 });
    }

    const existing = await EstateNote.findOne({ _id: noteObjectId, estateId: estateObjectId })
      .lean<EstateNoteLean>()
      .exec();

    if (!existing) {
      return NextResponse.json({ ok: false, error: "Note not found" }, { status: 404 });
    }

    const updated = await EstateNote.findOneAndUpdate(
      { _id: noteObjectId, estateId: estateObjectId },
      updates,
      { new: true, runValidators: true }
    )
      .lean<EstateNoteLean>()
      .exec();

    if (!updated) {
      return NextResponse.json({ ok: false, error: "Note not found" }, { status: 404 });
    }

    // Log events
    try {
      const didPinnedChange =
        "pinned" in updates && Boolean(existing.pinned) !== Boolean(updated.pinned);

      if (didPinnedChange) {
        await logEstateEvent({
          ownerId: session.user.id,
          estateId,
          type: Boolean(updated.pinned) ? "NOTE_PINNED" : "NOTE_UNPINNED",
          summary: Boolean(updated.pinned) ? "Note pinned" : "Note unpinned",
          detail: `Note ${noteId}`,
          meta: {
            noteId,
            pinned: Boolean(updated.pinned),
            actorId: session.user.id,
          },
        });
      }

      if (updatedFields.includes("body")) {
        await logEstateEvent({
          ownerId: session.user.id,
          estateId,
          type: "NOTE_UPDATED",
          summary: "Note updated",
          detail: `Updated note ${noteId}`,
          meta: {
            noteId,
            updatedFields,
            actorId: session.user.id,
          },
        });
      }
    } catch (e) {
      console.warn("[logEstateEvent NOTE_*] Error:", e);
    }

    return NextResponse.json({ ok: true, note: updated }, { status: 200 });
  } catch (error) {
    console.error("[PATCH /api/estates/[estateId]/notes/[noteId]] Error:", error);
    return NextResponse.json({ ok: false, error: "Failed to update note" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { estateId, noteId } = await params;

    const estateObjectId = toObjectId(estateId);
    const noteObjectId = toObjectId(noteId);
    if (!estateObjectId || !noteObjectId) {
      return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    }

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    // Editors/owners only.
    const access = await requireEstateEditAccess({ estateId, userId: session.user.id });
    const role = getRoleFromAccess(access) ?? "VIEWER";

    if (role !== "OWNER" && role !== "EDITOR") {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const deleted = await EstateNote.findOneAndDelete({
      _id: noteObjectId,
      estateId: estateObjectId,
    })
      .lean<EstateNoteLean>()
      .exec();

    if (!deleted) {
      return NextResponse.json({ ok: false, error: "Note not found" }, { status: 404 });
    }

    try {
      await logEstateEvent({
        ownerId: session.user.id,
        estateId,
        type: "NOTE_DELETED",
        summary: "Note deleted",
        detail: `Deleted note ${noteId}`,
        meta: {
          noteId,
          wasPinned: Boolean(deleted.pinned),
          actorId: session.user.id,
        },
      });
    } catch (e) {
      console.warn("[logEstateEvent NOTE_DELETED] Error:", e);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("[DELETE /api/estates/[estateId]/notes/[noteId]] Error:", error);
    return NextResponse.json({ ok: false, error: "Failed to delete note" }, { status: 500 });
  }
}