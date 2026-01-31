import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { requireEstateAccess, requireEstateEditAccess } from "@/lib/estateAccess";
import { logEstateEvent } from "@/lib/estateEvents";
import {
  EstateTask,
  type EstateTaskDocument,
  type TaskStatus,
} from "@/models/EstateTask";

type RouteParams = {
  estateId: string;
  taskId: string;
};

type RouteContext = { params: Promise<RouteParams> };

type EstateTaskLean = {
  _id: unknown;
  estateId: unknown;
  ownerId: unknown;
  title: string;
  description?: string | null;
  status: TaskStatus;
  dueDate?: Date | null;
  completedAt?: Date | null;
  relatedDocumentId?: string | null;
  relatedInvoiceId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
};

const ALLOWED_STATUSES: TaskStatus[] = ["NOT_STARTED", "IN_PROGRESS", "DONE"];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isResponse(value: unknown): value is Response {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.status === "number" && "headers" in v;
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

async function requireAccess(opts: {
  estateId: string;
  userId: string;
  mode: "view" | "edit";
}): Promise<Response | true> {
  const fn = opts.mode === "edit" ? requireEstateEditAccess : requireEstateAccess;
  const out = (await fn({ estateId: opts.estateId, userId: opts.userId })) as unknown;

  const maybeRes = pickResponse(out);
  if (maybeRes) return maybeRes;

  return true;
}

function toObjectId(id: string): mongoose.Types.ObjectId | null {
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
}

function parseStatus(raw: unknown): TaskStatus | undefined {
  if (typeof raw !== "string") return undefined;
  const upper = raw.toUpperCase() as TaskStatus;
  return ALLOWED_STATUSES.includes(upper) ? upper : undefined;
}

function serializeTask(t: EstateTaskLean) {
  return {
    id: String(t._id),
    estateId: String(t.estateId),
    ownerId: String(t.ownerId),
    title: t.title,
    description: t.description ?? null,
    status: t.status,
    dueDate: t.dueDate ?? null,
    completedAt: t.completedAt ?? null,
    relatedDocumentId: t.relatedDocumentId ?? null,
    relatedInvoiceId: t.relatedInvoiceId ?? null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { estateId, taskId } = await params;

  const estateObjectId = toObjectId(estateId);
  const taskObjectId = toObjectId(taskId);
  if (!estateObjectId || !taskObjectId) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }

  await connectToDatabase();

  const access = await requireAccess({ estateId, userId: session.user.id, mode: "view" });
  if (access instanceof Response) return access;

  const task = await EstateTask.findOne({ _id: taskObjectId, estateId: estateObjectId })
    .lean<EstateTaskLean | null>()
    .exec();

  if (!task) {
    return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, task: serializeTask(task) }, { status: 200 });
}

type UpdateTaskBody = {
  title?: string;
  description?: string;
  status?: string;
  dueDate?: string | null;
  completedAt?: string | null;
  relatedDocumentId?: string | null;
  relatedInvoiceId?: string | null;
};

/**
 * Shared update logic used by both PUT and POST so older UI calls still work.
 */
async function updateTask(req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { estateId, taskId } = await params;

  const estateObjectId = toObjectId(estateId);
  const taskObjectId = toObjectId(taskId);
  if (!estateObjectId || !taskObjectId) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }

  const raw = await req.json().catch(() => null);
  if (!isPlainObject(raw)) {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const body = raw as UpdateTaskBody;

  const update: Partial<
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
  > = {};

  if (body.title !== undefined) {
    if (typeof body.title !== "string" || !body.title.trim()) {
      return NextResponse.json({ ok: false, error: "Title is required" }, { status: 400 });
    }
    update.title = body.title.trim();
  }

  if (body.description !== undefined) {
    if (typeof body.description === "string") update.description = body.description.trim();
  }

  const parsedStatus = parseStatus(body.status);
  if (parsedStatus) {
    update.status = parsedStatus;
    if (parsedStatus === "DONE" && body.completedAt === undefined) {
      update.completedAt = new Date();
    }
  }

  if (body.dueDate !== undefined) {
    if (body.dueDate === null || body.dueDate === "") {
      update.dueDate = null;
    } else if (typeof body.dueDate === "string") {
      const d = new Date(body.dueDate);
      if (!Number.isNaN(d.getTime())) update.dueDate = d;
    }
  }

  if (body.completedAt !== undefined) {
    if (body.completedAt === null || body.completedAt === "") {
      update.completedAt = null;
    } else if (typeof body.completedAt === "string") {
      const d = new Date(body.completedAt);
      if (!Number.isNaN(d.getTime())) update.completedAt = d;
    }
  }

  if (body.relatedDocumentId !== undefined) {
    if (body.relatedDocumentId === null) update.relatedDocumentId = null;
    else if (typeof body.relatedDocumentId === "string") {
      update.relatedDocumentId = body.relatedDocumentId.trim() || null;
    }
  }

  if (body.relatedInvoiceId !== undefined) {
    if (body.relatedInvoiceId === null) update.relatedInvoiceId = null;
    else if (typeof body.relatedInvoiceId === "string") {
      update.relatedInvoiceId = body.relatedInvoiceId.trim() || null;
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { ok: false, error: "No valid fields provided" },
      { status: 400 },
    );
  }

  await connectToDatabase();

  const access = await requireAccess({ estateId, userId: session.user.id, mode: "edit" });
  if (access instanceof Response) return access;

  // Load before-state
  const before = await EstateTask.findOne({ _id: taskObjectId, estateId: estateObjectId })
    .lean<EstateTaskLean | null>()
    .exec();

  if (!before) {
    return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });
  }

  const prevStatus = before.status ? String(before.status) : null;
  const prevTitle = before.title ? String(before.title) : null;
  const prevDueDate = before.dueDate ?? null;

  const updated = await EstateTask.findOneAndUpdate(
    { _id: taskObjectId, estateId: estateObjectId },
    { $set: update },
    { new: true, runValidators: true }
  )
    .lean<EstateTaskLean | null>()
    .exec();

  if (!updated) {
    return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });
  }

  const nextStatus = updated.status ? String(updated.status) : null;
  const nextTitle = updated.title ? String(updated.title) : null;
  const nextDueDate = updated.dueDate ?? null;

  const didStatusChange = prevStatus !== nextStatus;

  try {
    if (didStatusChange) {
      await logEstateEvent({
        ownerId: session.user.id,
        estateId,
        type: "TASK_STATUS_CHANGED",
        summary: "Task status changed",
        detail: `Task ${taskId} status changed`,
        meta: {
          taskId,
          previousStatus: prevStatus,
          status: nextStatus,
          previousTitle: prevTitle,
          title: nextTitle,
          previousDueDate: prevDueDate,
          dueDate: nextDueDate,
          actorId: session.user.id,
        },
      });
    } else {
      await logEstateEvent({
        ownerId: session.user.id,
        estateId,
        type: "TASK_UPDATED",
        summary: "Task updated",
        detail: `Task ${taskId} updated`,
        meta: {
          taskId,
          previousTitle: prevTitle,
          title: nextTitle,
          previousDueDate: prevDueDate,
          dueDate: nextDueDate,
          actorId: session.user.id,
        },
      });
    }
  } catch (e) {
    console.warn(
      "[PATCH/PUT/POST /api/estates/[estateId]/tasks/[taskId]] Failed to log estate event:",
      e
    );
  }

  return NextResponse.json({ ok: true, task: serializeTask(updated) }, { status: 200 });
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  return updateTask(req, ctx);
}

// ✅ Supports older UI calls that POST updates
export async function POST(req: NextRequest, ctx: RouteContext) {
  return updateTask(req, ctx);
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { estateId, taskId } = await params;

  const estateObjectId = toObjectId(estateId);
  const taskObjectId = toObjectId(taskId);
  if (!estateObjectId || !taskObjectId) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }

  await connectToDatabase();

  const access = await requireAccess({ estateId, userId: session.user.id, mode: "edit" });
  if (access instanceof Response) return access;

  const deleted = await EstateTask.findOneAndDelete({
    _id: taskObjectId,
    estateId: estateObjectId,
  })
    .lean<EstateTaskLean | null>()
    .exec();

  if (!deleted) {
    return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });
  }

  try {
    await logEstateEvent({
      ownerId: session.user.id,
      estateId,
      type: "TASK_DELETED",
      summary: "Task deleted",
      detail: `Task ${taskId} deleted`,
      meta: {
        taskId,
        title: deleted.title ?? null,
        status: deleted.status ?? null,
        dueDate: deleted.dueDate ?? null,
        actorId: session.user.id,
      },
    });
  } catch (e) {
    console.warn(
      "[DELETE /api/estates/[estateId]/tasks/[taskId]] Failed to log estate event:",
      e
    );
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

export const dynamic = "force-dynamic";