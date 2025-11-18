import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { EstateNote, NoteCategory } from "@/models/EstateNote";

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

    await connectToDatabase();

    const notes = await EstateNote.find({
      estateId,
      ownerId: session.user.id,
    })
      .sort({ isPinned: -1, createdAt: -1 })
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
  category?: NoteCategory;
  isPinned?: boolean;
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
      isPinned: Boolean(json.isPinned),
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