import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import {
  EstateTask,
  type EstateTaskDocument,
  type TaskStatus,
} from "@/models/EstateTask";

type RouteContext = {
  params: {
    taskId: string;
  };
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
  req: Request,
  { params }: RouteContext,
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();

  const { taskId } = params;
  if (!taskId) {
    return NextResponse.json(
      { error: "Missing taskId in route params" },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Body must be an object" },
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

  const update: Partial<EstateTaskDocument> = {};

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
      update.completedAt = null as unknown as Date;
    }
  }

  if (dueDate !== undefined) {
    if (dueDate === null || dueDate === "") {
      update.dueDate = null as unknown as Date;
    } else {
      const d = new Date(dueDate);
      if (!Number.isNaN(d.getTime())) {
        update.dueDate = d;
      }
    }
  }

  if (completedAt !== undefined) {
    if (completedAt === null || completedAt === "") {
      update.completedAt = null as unknown as Date;
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

  const task = (await EstateTask.findOneAndUpdate(
    { _id: taskId, ownerId: session.user.id },
    update,
    { new: true },
  )) as EstateTaskDocument | null;

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json(serializeTask(task));
}

export async function DELETE(
  _req: Request,
  { params }: RouteContext,
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();

  const { taskId } = params;
  if (!taskId) {
    return NextResponse.json(
      { error: "Missing taskId in route params" },
      { status: 400 },
    );
  }

  const deleted = await EstateTask.findOneAndDelete({
    _id: taskId,
    ownerId: session.user.id,
  });

  if (!deleted) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}

export const dynamic = "force-dynamic";