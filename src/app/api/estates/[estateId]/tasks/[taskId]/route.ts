import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Task } from "@/models/Task";

type RouteParams = {
  estateId: string;
  taskId: string;
};

async function requireSession() {
  const session = await auth();
  if (!session || !session.user || !session.user.id) {
    return null;
  }
  return session;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: RouteParams },
) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { estateId, taskId } = params;

  await connectToDatabase();

  const task = await Task.findOne({
    _id: taskId,
    estateId,
    ownerId: session.user.id,
  });

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json({ task }, { status: 200 });
}

/**
 * Shared update logic used by both PUT and POST so the UI can hit this
 * endpoint with either verb.
 */
async function updateTask(
  req: NextRequest,
  { params }: { params: RouteParams },
) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { estateId, taskId } = params;

  await connectToDatabase();

  let body: {
    subject?: string;
    description?: string;
    status?: string;
    priority?: string;
    date?: string;
    notes?: string;
  };

  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const update: Record<string, unknown> = {};

  if (body.subject !== undefined) update.subject = body.subject;
  if (body.description !== undefined) update.description = body.description;
  if (body.status !== undefined) update.status = body.status;
  if (body.priority !== undefined) update.priority = body.priority;
  if (body.notes !== undefined) update.notes = body.notes;
  if (body.date !== undefined) {
    const parsed = new Date(body.date);
    if (!Number.isNaN(parsed.getTime())) {
      update.date = parsed;
    }
  }

  // Optionally track completion timestamp
  if (body.status === "DONE") {
    update.completedAt = new Date();
  }

  const updated = await Task.findOneAndUpdate(
    {
      _id: taskId,
      estateId,
      ownerId: session.user.id,
    },
    { $set: update },
    { new: true },
  );

  if (!updated) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json({ task: updated }, { status: 200 });
}

export async function PUT(
  req: NextRequest,
  ctx: { params: RouteParams },
) {
  return updateTask(req, ctx);
}

// ✅ This is what fixes your 405 for POST
export async function POST(
  req: NextRequest,
  ctx: { params: RouteParams },
) {
  return updateTask(req, ctx);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: RouteParams },
) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { estateId, taskId } = params;

  await connectToDatabase();

  const deleted = await Task.findOneAndDelete({
    _id: taskId,
    estateId,
    ownerId: session.user.id,
  });

  if (!deleted) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true }, { status: 200 });
}