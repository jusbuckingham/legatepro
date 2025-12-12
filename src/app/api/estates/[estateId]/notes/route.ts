import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { connectToDatabase } from "@/lib/db";
import { EstateNote } from "@/models/EstateNote";
import { requireEstateAccess } from "@/lib/validators";

type RouteParams = {
  params: Promise<{
    estateId: string;
  }>;
};

// GET /api/estates/[estateId]/notes
// List notes for an estate
export async function GET(
  _req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { estateId } = await params;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await requireEstateAccess(estateId, session.user.id);

    await connectToDatabase();

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

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await requireEstateAccess(estateId, session.user.id);
    if (!access.canEdit) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const json = (await req.json()) as CreateNotePayload;

    if (!json.subject || !json.body) {
      return NextResponse.json(
        { error: "Subject and body are required" },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const note = await EstateNote.create({
      ownerId: session.user.id,
      estateId,
      subject: json.subject,
      body: json.body,
      category: json.category ?? "GENERAL",
      pinned: Boolean(json.pinned),
    });

    // Activity log: note created
    try {
      const bodyText = typeof note.body === "string" ? note.body.trim() : "";
      await logActivity({
        ownerId: session.user.id,
        estateId: String(estateId),
        kind: "note",
        action: "created",
        entityId: String(note._id),
        message: "Note created",
        snapshot: {
          subject: (note as { subject?: unknown }).subject ?? null,
          category: (note as { category?: unknown }).category ?? null,
          pinned: Boolean((note as { pinned?: unknown }).pinned),
          bodyPreview: bodyText ? bodyText.slice(0, 240) : null,
        },
      });
    } catch {
      // Don't block note creation if activity logging fails
    }

    return NextResponse.json({ note }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/estates/[estateId]/notes] Error:", error);
    return NextResponse.json(
      { error: "Failed to create note" },
      { status: 500 }
    );
  }
}