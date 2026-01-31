import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
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

type RouteContext = {
  params: Promise<{
    estateId: string;
  }>;
};

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

function toObjectId(id: string) {
  return mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : null;
}

function isResponse(value: unknown): value is Response {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.status === "number" && "headers" in v;
}

function parseStatus(raw: unknown): TaskStatus | undefined {
  if (typeof raw !== "string") return undefined;
  const upper = raw.toUpperCase() as TaskStatus;
  return ALLOWED_STATUSES.includes(upper) ? upper : undefined;
}

async function requireAccess(
  estateId: string,
  userId: string,
  mode: "viewer" | "editor",
): Promise<Response | true> {
  const fn = mode === "editor" ? requireEstateEditAccess : requireEstateAccess;

  // Helpers have evolved; treat as unknown and gracefully handle Response returns.
  const result = (await fn({ estateId, userId })) as unknown;
  if (isResponse(result)) return result;

  // Some helpers wrap the response.
  if (result && typeof result === "object") {
    const obj = result as Record<string, unknown>;
    const r = obj.res ?? obj.response;
    if (isResponse(r)) return r;
  }

  return true;
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

export async function GET(
  _req: NextRequest,
  { params }: RouteContext,
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { estateId } = await params;
  if (!estateId) {
    return NextResponse.json(
      { error: "Missing estateId in route params" },
      { status: 400 },
    );
  }

  const estateObjectId = toObjectId(estateId);
  if (!estateObjectId) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }

  await connectToDatabase();

  const access = await requireAccess(estateId, session.user.id, "viewer");
  if (access instanceof Response) return access;

  const tasks = await EstateTask.find({ estateId: estateObjectId })
    .sort({ createdAt: -1 })
    .lean<EstateTaskLean[]>()
    .exec();

  return NextResponse.json(tasks.map(serializeTask), { status: 200 });
}

export async function POST(
  req: NextRequest,
  { params }: RouteContext,
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { estateId } = await params;
  if (!estateId) {
    return NextResponse.json(
      { error: "Missing estateId in route params" },
      { status: 400 },
    );
  }

  const estateObjectId = toObjectId(estateId);
  const ownerObjectId = toObjectId(session.user.id);
  if (!estateObjectId || !ownerObjectId) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }

  await connectToDatabase();

  const access = await requireAccess(estateId, session.user.id, "editor");
  if (access instanceof Response) return access;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const titleRaw = (body as { title?: unknown }).title;
  if (typeof titleRaw !== "string" || !titleRaw.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const {
    description,
    dueDate,
    status: rawStatus,
    relatedDocumentId,
    relatedInvoiceId,
  } = body as {
    description?: string;
    dueDate?: string | null;
    status?: string;
    relatedDocumentId?: string;
    relatedInvoiceId?: string;
  };

  const status: TaskStatus = parseStatus(rawStatus) ?? "NOT_STARTED";

  let parsedDueDate: Date | undefined;
  if (dueDate) {
    const d = new Date(dueDate);
    if (!Number.isNaN(d.getTime())) parsedDueDate = d;
  }

  const taskDoc: EstateTaskDocument = await EstateTask.create({
    estateId: estateObjectId,
    ownerId: ownerObjectId,
    title: titleRaw.trim(),
    description: typeof description === "string" ? description.trim() || undefined : undefined,
    status,
    dueDate: parsedDueDate,
    relatedDocumentId: relatedDocumentId || undefined,
    relatedInvoiceId: relatedInvoiceId || undefined,
  });

  // Best-effort estate event log
  try {
    await logEstateEvent({
      ownerId: session.user.id,
      estateId: String(estateObjectId),
      type: "TASK_CREATED",
      summary: "Task created",
      detail: `Task created: ${String(taskDoc.title ?? "Untitled")}`,
      meta: {
        taskId: String(taskDoc._id),
        title: taskDoc.title ?? null,
        status: taskDoc.status ?? null,
        dueDate: taskDoc.dueDate ?? null,
        relatedDocumentId: taskDoc.relatedDocumentId ?? null,
        relatedInvoiceId: taskDoc.relatedInvoiceId ?? null,
        actorId: session.user.id,
      },
    });
  } catch {
    // Do not block creation on logging failure
  }

  return NextResponse.json(
    {
      id: taskDoc.id,
      estateId: String(taskDoc.estateId),
      ownerId: String(taskDoc.ownerId),
      title: taskDoc.title,
      description: taskDoc.description ?? null,
      status: taskDoc.status,
      dueDate: taskDoc.dueDate ?? null,
      completedAt: taskDoc.completedAt ?? null,
      relatedDocumentId: taskDoc.relatedDocumentId ?? null,
      relatedInvoiceId: taskDoc.relatedInvoiceId ?? null,
      createdAt: taskDoc.createdAt,
      updatedAt: taskDoc.updatedAt,
    },
    { status: 201 },
  );
}

export const dynamic = "force-dynamic";