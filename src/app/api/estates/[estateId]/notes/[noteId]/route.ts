import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
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
  isPinned?: boolean;
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
    if (typeof json.isPinned === "boolean") update.isPinned = json.isPinned;

    const note = await EstateNote.findOneAndUpdate(
      { _id: noteId, estateId, ownerId: session.user.id },
      update,
      { new: true }
    ).lean();

    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

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