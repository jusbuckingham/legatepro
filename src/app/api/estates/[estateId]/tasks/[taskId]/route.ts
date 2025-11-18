import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Task } from "@/models/Task";

interface RouteParams {
  params: Promise<{
    estateId: string;
    taskId: string;
  }>;
}

export async function GET(
  _req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    await connectToDatabase();
    const { estateId, taskId } = await params;

    if (!estateId || !taskId) {
      return NextResponse.json(
        { error: "Missing estateId or taskId" },
        { status: 400 }
      );
    }

    const task = await Task.findOne({ _id: taskId, estateId }).lean();

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ task }, { status: 200 });
  } catch (error) {
    console.error(
      "[GET /api/estates/[estateId]/tasks/[taskId]] Error:",
      error
    );
    return NextResponse.json(
      { error: "Failed to fetch task" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    await connectToDatabase();
    const { estateId, taskId } = await params;

    if (!estateId || !taskId) {
      return NextResponse.json(
        { error: "Missing estateId or taskId" },
        { status: 400 }
      );
    }

    const body = (await req.json()) as {
      subject?: string;
      description?: string;
      notes?: string;
      status?: "OPEN" | "DONE";
      priority?: "LOW" | "MEDIUM" | "HIGH";
      date?: string | null;
    };

    const update: Record<string, unknown> = {};

    if (typeof body.subject === "string") {
      update.subject = body.subject.trim();
    }
    if (typeof body.description === "string") {
      update.description = body.description;
    }
    if (typeof body.notes === "string") {
      update.notes = body.notes;
    }
    if (typeof body.status === "string") {
      update.status = body.status;
    }
    if (typeof body.priority === "string") {
      update.priority = body.priority;
    }
    if (Object.prototype.hasOwnProperty.call(body, "date")) {
      update.date = body.date ? new Date(body.date) : null;
    }

    const updated = await Task.findOneAndUpdate(
      { _id: taskId, estateId },
      update,
      { new: true }
    ).lean();

    if (!updated) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ task: updated }, { status: 200 });
  } catch (error) {
    console.error(
      "[PATCH /api/estates/[estateId]/tasks/[taskId]] Error:",
      error
    );
    return NextResponse.json(
      { error: "Failed to update task" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    await connectToDatabase();
    const { estateId, taskId } = await params;

    if (!estateId || !taskId) {
      return NextResponse.json(
        { error: "Missing estateId or taskId" },
        { status: 400 }
      );
    }

    const deleted = await Task.findOneAndDelete({
      _id: taskId,
      estateId,
    }).lean();

    if (!deleted) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error(
      "[DELETE /api/estates/[estateId]/tasks/[taskId]] Error:",
      error
    );
    return NextResponse.json(
      { error: "Failed to delete task" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    await connectToDatabase();
    const { estateId, taskId } = await params;

    if (!estateId || !taskId) {
      return NextResponse.json(
        { error: "Missing estateId or taskId" },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const intent = formData.get("intent");

    if (intent !== "toggleStatus") {
      return NextResponse.json(
        { error: "Unsupported intent" },
        { status: 400 }
      );
    }

    const task = await Task.findOne({ _id: taskId, estateId });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const isDone = task.status === "DONE";
    task.status = isDone ? "OPEN" : "DONE";

    if (!isDone) {
      // Marking as DONE now
      task.completedAt = new Date();
    } else {
      // Reopening the task
      task.completedAt = undefined;
    }

    await task.save();

    return NextResponse.redirect(
      new URL(`/app/estates/${estateId}/tasks/${taskId}`, req.url)
    );
  } catch (error) {
    console.error(
      "[POST /api/estates/[estateId]/tasks/[taskId]] Error:",
      error
    );
    return NextResponse.json(
      { error: "Failed to update task status" },
      { status: 500 }
    );
  }
}