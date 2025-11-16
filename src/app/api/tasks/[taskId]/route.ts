import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Task } from "@/models/Task";

type RouteParams = { taskId: string };

export async function GET(
  _req: NextRequest,
  context: { params: Promise<RouteParams> }
) {
  try {
    const { taskId } = await context.params;

    await connectToDatabase();
    const task = await Task.findById(taskId);

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ task }, { status: 200 });
  } catch (error) {
    console.error("[TASK_GET]", error);
    return NextResponse.json(
      { error: "Failed to fetch task" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<RouteParams> }
) {
  try {
    const { taskId } = await context.params;
    const body = await req.json();

    await connectToDatabase();
    const task = await Task.findByIdAndUpdate(taskId, body, {
      new: true,
      runValidators: true,
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ task }, { status: 200 });
  } catch (error) {
    console.error("[TASK_PUT]", error);
    return NextResponse.json(
      { error: "Failed to update task" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<RouteParams> }
) {
  try {
    const { taskId } = await context.params;

    await connectToDatabase();
    const task = await Task.findByIdAndDelete(taskId);

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("[TASK_DELETE]", error);
    return NextResponse.json(
      { error: "Failed to delete task" },
      { status: 500 }
    );
  }
}