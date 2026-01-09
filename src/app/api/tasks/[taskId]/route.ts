import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { requireEstateEditAccess } from "@/lib/estateAccess";
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

function parseStatus(raw: unknown): TaskStatus | undefined {
  if (typeof raw !== "string") return undefined;
  const upper = raw.toUpperCase() as TaskStatus;
  return ALLOWED_STATUSES.includes(upper) ? upper : undefined;
}

function serializeTask(task: EstateTaskDocument) {
  return {
    id: task.id,
    estateId: task.estateId,
    ownerId: task.ownerId,
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { ok: false, error: "Body must be an object" },
      { status: 400 },
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
    update.relatedDocumentId = relatedDocumentId || undefined;
  }

  if (typeof relatedInvoiceId === "string") {
    update.relatedInvoiceId = relatedInvoiceId || undefined;
  }

  const existingTask = (await EstateTask.findById(taskId)) as EstateTaskDocument | null;

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

  // Activity log
  try {
    if (didStatusChange) {
      await logActivity({
        estateId: String(existingTask.estateId),
        kind: "TASK",
        action: "status_changed",
        entityId: String(existingTask._id),
        message: `Task status changed: ${String(existingTask.title ?? "Untitled")}`,
        snapshot: {
          previousStatus,
          newStatus: nextStatus,
          previousTitle,
          newTitle: nextTitle,
          previousDueDate,
          newDueDate: nextDueDate,
        },
      });
    } else {
      await logActivity({
        estateId: String(existingTask.estateId),
        kind: "TASK",
        action: "updated",
        entityId: String(existingTask._id),
        message: `Task updated: ${String(existingTask.title ?? "Untitled")}`,
        snapshot: {
          previousTitle,
          newTitle: nextTitle,
          previousDueDate,
          newDueDate: nextDueDate,
        },
      });
    }
  } catch {
    // Don't block task updates if activity logging fails
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

  const existingTask = (await EstateTask.findById(taskId)) as EstateTaskDocument | null;
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

  const deleted = await EstateTask.findByIdAndDelete(taskId);
  if (!deleted) {
    return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });
  }

  // Activity log: task deleted
  try {
    await logActivity({
      estateId: String(deleted.estateId),
      kind: "TASK",
      action: "deleted",
      entityId: String(deleted._id),
      message: `Task deleted: ${String(deleted.title ?? "Untitled")}`,
      snapshot: {
        title: deleted.title ?? null,
        status: deleted.status ?? null,
        dueDate: deleted.dueDate ?? null,
      },
    });
  } catch {
    // Don't block task deletion if activity logging fails
  }

  return NextResponse.json(
    { ok: true, data: { success: true, id: String(taskId) } },
    { status: 200 },
  );
}

export const dynamic = "force-dynamic";