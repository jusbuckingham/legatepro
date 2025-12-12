// src/app/api/estates/[estateId]/tasks/[taskId]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { Task } from "@/models/Task";
import { requireViewer, requireEditor } from "@/lib/estateAccess";

type RouteParams = {
  estateId: string;
  taskId: string;
};

type UpdateTaskBody = {
  subject?: string;
  description?: string;
  status?: string;
  priority?: string;
  date?: string;
  notes?: string;
};

type TaskLite = {
  status?: unknown;
  title?: unknown;
};

function getStr(obj: unknown, key: keyof TaskLite): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const v = (obj as Record<string, unknown>)[key as string];
  return typeof v === "string" ? v : undefined;
}

export async function GET(_req: NextRequest, { params }: { params: RouteParams }) {
  const { estateId, taskId } = params;

  // Viewer access is sufficient to read tasks
  const access = await requireViewer(estateId);
  if (!access.ok) return access.res;

  await connectToDatabase();

  const task = await Task.findOne({ _id: taskId, estateId });

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json({ task }, { status: 200 });
}

/**
 * Shared update logic used by both PUT and POST so the UI can hit this
 * endpoint with either verb.
 */
async function updateTask(req: NextRequest, { params }: { params: RouteParams }) {
  const { estateId, taskId } = params;

  // Owner/Editor required to modify tasks
  const access = await requireEditor(estateId);
  if (!access.ok) return access.res;

  await connectToDatabase();

  let body: UpdateTaskBody;

  try {
    body = (await req.json()) as UpdateTaskBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Load before-state for comparison / logging
  const before = (await Task.findOne({ _id: taskId, estateId }).lean().exec()) as unknown as TaskLite | null;
  if (!before) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
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
    { _id: taskId, estateId },
    { $set: update },
    { new: true }
  );

  if (!updated) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  // Activity logging
  const prevStatus = getStr(before, "status");
  const nextStatus = getStr(updated.toObject?.() ?? updated, "status");
  const title = getStr(updated.toObject?.() ?? updated, "title");

  const kind = "TASK" as unknown as Parameters<typeof logActivity>[0]["kind"];
  const snapshotBase = {
    taskId: String(taskId),
    title,
  } satisfies Record<string, unknown>;

  if (prevStatus !== nextStatus) {
    await logActivity({
      estateId,
      ownerId: access.userId,
      kind,
      action: "STATUS_CHANGED",
      entityId: String(taskId),
      message: `Task status changed: ${prevStatus ?? ""} → ${nextStatus ?? ""}`,
      snapshot: {
        ...snapshotBase,
        from: prevStatus ?? null,
        to: nextStatus ?? null,
      },
    });
  } else {
    await logActivity({
      estateId,
      ownerId: access.userId,
      kind,
      action: "UPDATED",
      entityId: String(taskId),
      message: "Task updated",
      snapshot: {
        ...snapshotBase,
      },
    });
  }

  return NextResponse.json({ task: updated }, { status: 200 });
}

export async function PUT(req: NextRequest, ctx: { params: RouteParams }) {
  return updateTask(req, ctx);
}

// ✅ This supports older UI calls that POST updates
export async function POST(req: NextRequest, ctx: { params: RouteParams }) {
  return updateTask(req, ctx);
}

export async function DELETE(_req: NextRequest, { params }: { params: RouteParams }) {
  const { estateId, taskId } = params;

  // Owner/Editor required to delete tasks
  const access = await requireEditor(estateId);
  if (!access.ok) return access.res;

  await connectToDatabase();

  const deleted = await Task.findOneAndDelete({ _id: taskId, estateId });

  if (!deleted) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const title = getStr(deleted.toObject?.() ?? deleted, "title");

  const kind = "TASK" as unknown as Parameters<typeof logActivity>[0]["kind"];

  await logActivity({
    estateId,
    ownerId: access.userId,
    kind,
    action: "DELETED",
    entityId: String(taskId),
    message: "Task deleted",
    snapshot: {
      taskId: String(taskId),
      title,
    },
  });

  return NextResponse.json({ success: true }, { status: 200 });
}