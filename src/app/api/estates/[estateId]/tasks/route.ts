import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Task } from "@/models/Task";

/**
 * GET /api/estates/[estateId]/tasks
 * List tasks for a specific estate belonging to the logged-in user
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ estateId: string }> },
) {
  const { estateId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();

  try {
    const tasks = await Task.find({
      estateId,
      ownerId: session.user.id,
    })
      .sort({ date: -1, createdAt: -1 })
      .lean();

    return NextResponse.json({ tasks }, { status: 200 });
  } catch (error) {
    console.error("[GET /api/estates/[estateId]/tasks] Error:", error);
    return NextResponse.json(
      { error: "Failed to load tasks" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/estates/[estateId]/tasks
 * Create a new task for a specific estate
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ estateId: string }> },
) {
  const { estateId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();

  try {
    const body = (await req.json()) as {
      subject?: string;
      description?: string;
      date?: string;
      status?: string;
      priority?: string;
      notes?: string;
    };

    const subject = body.subject?.trim();
    if (!subject) {
      return NextResponse.json(
        { error: "Subject is required" },
        { status: 400 },
      );
    }

    const task = await Task.create({
      estateId,
      ownerId: session.user.id,
      subject,
      description: body.description ?? "",
      notes: body.notes ?? "",
      date: body.date ? new Date(body.date) : new Date(),
      status: body.status ?? "OPEN",
      priority: body.priority ?? "MEDIUM",
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/estates/[estateId]/tasks] Error:", error);
    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 },
    );
  }
}