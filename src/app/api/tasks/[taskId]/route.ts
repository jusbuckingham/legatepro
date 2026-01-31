import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { logEstateEvent } from "@/lib/estateEvents";
import { requireEstateAccess, requireEstateEditAccess } from "@/lib/estateAccess";
import {
  EstateTask,
  type EstateTaskDocument,
  type TaskStatus,
} from "@/models/EstateTask";

type RouteContext = {
  params: Promise<{
    taskId: string;
  }>;
};

const ALLOWED_STATUSES: TaskStatus[] = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "DONE",
];

function isValidObjectIdString(id: unknown): id is string {
  return typeof id === "string" && mongoose.Types.ObjectId.isValid(id);
}

function toObjectId(id: unknown): mongoose.Types.ObjectId | null {
  return isValidObjectIdString(id) ? new mongoose.Types.ObjectId(id) : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseStatus(raw: unknown): TaskStatus | undefined {
  if (typeof raw !== "string") return undefined;
  const upper = raw.toUpperCase() as TaskStatus;
  return ALLOWED_STATUSES.includes(upper) ? upper : undefined;
}

function serializeTask(task: EstateTaskDocument) {
  return {
    id: task.id ?? String(task._id),
    estateId: String(task.estateId),
    ownerId: String(task.ownerId),
    title: task.title,
    description: task.description ?? null,
    status: task.status,
    dueDate: task.dueDate ?? null,
    completedAt: task.completedAt ?? null,
    relatedDocumentId: task.relatedDocumentId ?? null,
    relatedInvoiceId: task.relatedInvoiceId ?? null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: RouteContext,
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  await connectToDatabase();

  const { taskId } = await params;
  if (!taskId) {
    return NextResponse.json(
      { ok: false, error: "Missing taskId in route params" },
      { status: 400 },
    );
  }

  const taskObjectId = toObjectId(taskId);
  if (!taskObjectId) {
    return NextResponse.json(
      { ok: false, error: "Invalid taskId" },
      { status: 400 }
    );
  }

  const task = (await EstateTask.findById(taskObjectId)) as EstateTaskDocument | null;
  if (!task) {
    return NextResponse.json(
      { ok: false, error: "Task not found" },
      { status: 404 },
    );
  }

  const access = await requireEstateAccess({
    estateId: String(task.estateId),
    userId: session.user.id,
  });

  if (access instanceof Response) {
    return access;
  }

  return NextResponse.json(
    { ok: true, data: { task: serializeTask(task) } },
    { status: 200 },
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext,
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();

  const { taskId } = await params;
  if (!taskId) {
    return NextResponse.json(
      { ok: false, error: "Missing taskId in route params" },
      { status: 400 },
    );
  }

  const taskObjectId = toObjectId(taskId);
  if (!taskObjectId) {
    return NextResponse.json(
      { ok: false, error: "Invalid taskId" },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => null);
  if (body === null) {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!isPlainObject(body)) {
    return NextResponse.json(
      { ok: false, error: "Body must be an object" },
      { status: 400 }
    );
  }

  const {
    title,
    description,
    status: rawStatus,
    dueDate,
    completedAt,
    relatedDocumentId,
    relatedInvoiceId,
  } = body as {
    title?: string;
    description?: string;
    status?: string;
    dueDate?: string | null;
    completedAt?: string | null;
    relatedDocumentId?: string | null;
    relatedInvoiceId?: string | null;
  };

  type TaskUpdate = Partial<
    Pick<
      EstateTaskDocument,
      | "title"
      | "description"
      | "status"
      | "dueDate"
      | "completedAt"
      | "relatedDocumentId"
      | "relatedInvoiceId"
    >
  >;

  const update: TaskUpdate = {};

  if (typeof title === "string") {
    update.title = title.trim();
    if (!update.title) {
      return NextResponse.json(
        { ok: false, error: "Title is required" },
        { status: 400 },
      );
    }
  }

  if (typeof description === "string") {
    update.description = description.trim();
  }

  const status = parseStatus(rawStatus);
  if (status) {
    update.status = status;
    if (status === "DONE" && !completedAt) {
      // auto-set completedAt if marking DONE and caller didn't explicitly send completedAt
      update.completedAt = new Date();
    }
    if (status !== "DONE" && completedAt === null) {
      // allow clearing completedAt if status moved away from DONE and caller sends null
      update.completedAt = null;
    }
  }

  if (dueDate !== undefined) {
    if (dueDate === null || dueDate === "") {
      update.dueDate = null;
    } else {
      const d = new Date(dueDate);
      if (!Number.isNaN(d.getTime())) {
        update.dueDate = d;
      }
    }
  }

  if (completedAt !== undefined) {
    if (completedAt === null || completedAt === "") {
      update.completedAt = null;
    } else {
      const d = new Date(completedAt);
      if (!Number.isNaN(d.getTime())) {
        update.completedAt = d;
      }
    }
  }

  if (typeof relatedDocumentId === "string") {
    update.relatedDocumentId = relatedDocumentId.trim() ? relatedDocumentId : null;
  }

  if (typeof relatedInvoiceId === "string") {
    update.relatedInvoiceId = relatedInvoiceId.trim() ? relatedInvoiceId : null;
  }

  const existingTask = (await EstateTask.findById(taskObjectId)) as EstateTaskDocument | null;

  if (!existingTask) {
    return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });
  }

  const access = await requireEstateEditAccess({
    estateId: String(existingTask.estateId),
    userId: session.user.id,
  });

  // `requireEstateEditAccess` returns either a Response (deny) or an ok result.
  if (access instanceof Response) {
    return access;
  }

  const previousStatus = existingTask.status ? String(existingTask.status) : null;
  const previousTitle = existingTask.title ? String(existingTask.title) : null;
  const previousDueDate = existingTask.dueDate ?? null;

  // Apply updates and persist
  Object.assign(existingTask, update);
  await existingTask.save();

  const nextStatus = existingTask.status ? String(existingTask.status) : null;
  const nextTitle = existingTask.title ? String(existingTask.title) : null;
  const nextDueDate = existingTask.dueDate ?? null;

  const didStatusChange = previousStatus !== nextStatus;

  // Activity log (best-effort)
  try {
    if (didStatusChange) {
      await logEstateEvent({
        ownerId: session.user.id,
        estateId: String(existingTask.estateId),
        type: "TASK_STATUS_CHANGED",
        summary: "Task status changed",
        detail: `Task ${String(existingTask._id)} status changed`,
        meta: {
          taskId: String(existingTask._id),
          previousStatus,
          status: nextStatus,
          previousTitle,
          title: nextTitle,
          previousDueDate,
          dueDate: nextDueDate,
          actorId: session.user.id,
        },
      });
    } else {
      await logEstateEvent({
        ownerId: session.user.id,
        estateId: String(existingTask.estateId),
        type: "TASK_UPDATED",
        summary: "Task updated",
        detail: `Task ${String(existingTask._id)} updated`,
        meta: {
          taskId: String(existingTask._id),
          previousTitle,
          title: nextTitle,
          previousDueDate,
          dueDate: nextDueDate,
          actorId: session.user.id,
        },
      });
    }
  } catch (e) {
    // Don't block task updates if event logging fails
    console.warn("[PATCH /api/tasks/[taskId]] Failed to log estate event:", e);
  }

  return NextResponse.json(
    { ok: true, data: { task: serializeTask(existingTask) } },
    { status: 200 },
  );
}

export async function DELETE(
  _req: NextRequest,
  { params }: RouteContext,
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();

  const { taskId } = await params;
  if (!taskId) {
    return NextResponse.json(
      { ok: false, error: "Missing taskId in route params" },
      { status: 400 },
    );
  }
  const taskObjectId = toObjectId(taskId);
  if (!taskObjectId) {
    return NextResponse.json(
      { ok: false, error: "Invalid taskId" },
      { status: 400 }
    );
  }

  const existingTask = (await EstateTask.findById(taskObjectId)) as EstateTaskDocument | null;
  if (!existingTask) {
    return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });
  }

  const access = await requireEstateEditAccess({
    estateId: String(existingTask.estateId),
    userId: session.user.id,
  });

  // `requireEstateEditAccess` returns either a Response (deny) or an ok result.
  if (access instanceof Response) {
    return access;
  }
  const deleted = await EstateTask.findByIdAndDelete(taskObjectId);
  if (!deleted) {
    return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });
  }

  // Activity log (best-effort): task deleted
  try {
    await logEstateEvent({
      ownerId: session.user.id,
      estateId: String(deleted.estateId),
      type: "TASK_DELETED",
      summary: "Task deleted",
      detail: `Deleted task ${String(deleted._id)}`,
      meta: {
        taskId: String(deleted._id),
        title: deleted.title ?? null,
        status: deleted.status ?? null,
        dueDate: deleted.dueDate ?? null,
        actorId: session.user.id,
      },
    });
  } catch (e) {
    // Don't block task deletion if event logging fails
    console.warn("[DELETE /api/tasks/[taskId]] Failed to log estate event:", e);
  }

  return NextResponse.json(
    { ok: true, data: { success: true, id: String(taskId) } },
    { status: 200 },
  );
}

export const dynamic = "force-dynamic";