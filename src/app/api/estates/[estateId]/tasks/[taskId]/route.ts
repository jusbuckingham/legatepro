import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase, serializeMongoDoc } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { Task } from "@/models/Task";
import { requireEstateAccess, requireEstateEditAccess } from "@/lib/estateAccess";

type RouteParams = {
  estateId: string;
  taskId: string;
};

type RouteContext = { params: Promise<RouteParams> };

type AccessResult = {
  userId?: string;
  estateId?: string;
  role?: string;
  permission?: string;
};

function isResponse(value: unknown): value is Response {
  return typeof Response !== "undefined" && value instanceof Response;
}

function pickResponse(value: unknown): Response | null {
  if (!value) return null;
  if (isResponse(value)) return value;
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    const res = (v.res ?? v.response) as unknown;
    if (isResponse(res)) return res;
  }
  return null;
}

async function requireAccess(opts: { estateId: string; mode: "view" | "edit" }) {
  const fn = opts.mode === "edit" ? requireEstateEditAccess : requireEstateAccess;
  const out = await fn({ estateId: opts.estateId });

  const maybeRes = pickResponse(out);
  if (maybeRes) return { ok: false as const, res: maybeRes };

  // If your helper returns a structured object, we pass it through.
  return { ok: true as const, data: out as AccessResult };
}

type UpdateTaskBody = {
  subject?: string;
  description?: string;
  status?: string;
  priority?: string;
  date?: string;
  notes?: string;
};

function getStr(obj: unknown, key: string): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "string" ? v : undefined;
}

type ActivityKind = Parameters<typeof logActivity>[0]["kind"];
const TASK_KIND = "TASK" as const satisfies ActivityKind;

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { estateId, taskId } = await params;

  // Viewer access is sufficient to read tasks
  const access = await requireAccess({ estateId, mode: "view" });
  if (!access.ok) return access.res;

  await connectToDatabase();

  const taskRaw = (await Task.findOne({ _id: taskId, estateId }).lean().exec()) as unknown;

  if (!taskRaw) {
    return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });
  }

  const task = serializeMongoDoc(taskRaw);

  return NextResponse.json({ ok: true, task }, { status: 200 });
}

/**
 * Shared update logic used by both PUT and POST so the UI can hit this
 * endpoint with either verb.
 */
async function updateTask(req: NextRequest, { params }: RouteContext) {
  const { estateId, taskId } = await params;

  // Owner/Editor required to modify tasks
  const access = await requireAccess({ estateId, mode: "edit" });
  if (!access.ok) return access.res;

  const userId = access.data.userId;
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();

  let body: UpdateTaskBody;

  try {
    body = (await req.json()) as UpdateTaskBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  // Load before-state for comparison / logging
  const beforeRaw = (await Task.findOne({ _id: taskId, estateId }).lean().exec()) as unknown;
  const before = beforeRaw ? serializeMongoDoc(beforeRaw) : null;

  if (!before) {
    return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });
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

  const updatedRaw = (await Task.findOneAndUpdate(
    { _id: taskId, estateId },
    { $set: update },
    { new: true }
  )
    .lean()
    .exec()) as unknown;

  if (!updatedRaw) {
    return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });
  }

  const updated = serializeMongoDoc(updatedRaw);

  // Activity logging
  const prevStatus = getStr(before, "status");
  const nextStatus = getStr(updated, "status");
  const title = getStr(updated, "title") ?? getStr(updated, "subject");

  const snapshotBase = {
    taskId: String(taskId),
    title,
    actorId: userId,
  } satisfies Record<string, unknown>;

  if (prevStatus !== nextStatus) {
    await logActivity({
      estateId,
      kind: TASK_KIND,
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
      kind: TASK_KIND,
      action: "UPDATED",
      entityId: String(taskId),
      message: "Task updated",
      snapshot: {
        ...snapshotBase,
      },
    });
  }

  return NextResponse.json({ ok: true, task: updated }, { status: 200 });
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  return updateTask(req, ctx);
}

// ✅ This supports older UI calls that POST updates
export async function POST(req: NextRequest, ctx: RouteContext) {
  return updateTask(req, ctx);
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { estateId, taskId } = await params;

  // Owner/Editor required to delete tasks
  const access = await requireAccess({ estateId, mode: "edit" });
  if (!access.ok) return access.res;

  const userId = access.data.userId;
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();

  const deletedRaw = (await Task.findOneAndDelete({ _id: taskId, estateId }).lean().exec()) as unknown;

  if (!deletedRaw) {
    return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });
  }

  const deleted = serializeMongoDoc(deletedRaw);
  const title = getStr(deleted, "title") ?? getStr(deleted, "subject");

  await logActivity({
    estateId,
    kind: TASK_KIND,
    action: "DELETED",
    entityId: String(taskId),
    message: "Task deleted",
    snapshot: {
      taskId: String(taskId),
      title,
      actorId: userId,
    },
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}