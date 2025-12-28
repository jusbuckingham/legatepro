import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { logActivity } from "@/lib/activity";
import { requireEstateAccess, requireEstateEditAccess } from "@/lib/estateAccess";
import { connectToDatabase } from "@/lib/db";
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

type AccessOk = { userId: string };

function toObjectId(id: string) {
  return mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : null;
}

function isResponse(value: unknown): value is Response {
  return (
    !!value &&
    typeof value === "object" &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    typeof (value as any).headers !== "undefined" &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    typeof (value as any).status === "number"
  );
}

function extractUserId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;

  // Common shapes across our access helpers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = value as any;
  const direct =
    (typeof v.userId === "string" && v.userId) ||
    (typeof v.viewerId === "string" && v.viewerId) ||
    (typeof v.ownerId === "string" && v.ownerId);
  if (direct) return direct;

  const nested = v.session?.user?.id ?? v.user?.id;
  return typeof nested === "string" && nested ? nested : null;
}

async function requireAccess(
  estateId: string,
  mode: "viewer" | "editor",
): Promise<AccessOk | Response> {
  const fn = mode === "editor" ? requireEstateEditAccess : requireEstateAccess;

  // We intentionally treat the result as unknown because these helpers have evolved
  // and we want the route to be resilient.
  const result = (await fn({ estateId })) as unknown;

  // Some helpers return a Response/NextResponse directly.
  if (isResponse(result)) return result;

  // Some helpers return an object wrapper that contains a Response.
  if (result && typeof result === "object") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = (result as any).res ?? (result as any).response;
    if (isResponse(r)) return r;
  }

  const userId = extractUserId(result);
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  return { userId };
}

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

export async function GET(
  _req: NextRequest,
  { params }: RouteContext,
): Promise<Response> {
  const { estateId } = await params;

  if (!estateId) {
    return NextResponse.json(
      { error: "Missing estateId in route params" },
      { status: 400 },
    );
  }

  // Enforce estate access (collaborators allowed)
  const access = await requireAccess(estateId, "viewer");
  if (isResponse(access)) return access;

  const estateObjectId = toObjectId(estateId);
  if (!estateObjectId) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }

  await connectToDatabase();

  const tasks = await EstateTask.find({ estateId: estateObjectId })
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json(
    tasks.map((t) => ({
      id: String((t as { _id: unknown })._id),
      estateId: String(t.estateId),
      ownerId: String(t.ownerId),
      title: t.title,
      description: (t as { description?: string | null }).description ?? null,
      status: t.status,
      dueDate: (t as { dueDate?: Date | null }).dueDate ?? null,
      completedAt: (t as { completedAt?: Date | null }).completedAt ?? null,
      relatedDocumentId: (t as { relatedDocumentId?: string | null }).relatedDocumentId ?? null,
      relatedInvoiceId: (t as { relatedInvoiceId?: string | null }).relatedInvoiceId ?? null,
      createdAt: (t as { createdAt?: Date }).createdAt,
      updatedAt: (t as { updatedAt?: Date }).updatedAt,
    })),
    { status: 200 },
  );
}

export async function POST(
  req: NextRequest,
  { params }: RouteContext,
): Promise<Response> {
  const { estateId } = await params;

  if (!estateId) {
    return NextResponse.json(
      { error: "Missing estateId in route params" },
      { status: 400 },
    );
  }

  // Enforce estate access + edit permission
  const access = await requireAccess(estateId, "editor");
  if (isResponse(access)) return access;

  const estateObjectId = toObjectId(estateId);
  const ownerObjectId = toObjectId(access.userId);

  if (!estateObjectId || !ownerObjectId) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }

  await connectToDatabase();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as { title?: unknown }).title !== "string" ||
    !(body as { title: string }).title.trim()
  ) {
    return NextResponse.json(
      { error: "Title is required" },
      { status: 400 },
    );
  }

  const {
    title,
    description,
    dueDate,
    status: rawStatus,
    relatedDocumentId,
    relatedInvoiceId,
  } = body as {
    title: string;
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
    if (!Number.isNaN(d.getTime())) {
      parsedDueDate = d;
    }
  }

  const taskDoc: EstateTaskDocument = await EstateTask.create({
    estateId: estateObjectId,
    ownerId: ownerObjectId,
    title: title.trim(),
    description: description?.trim() || undefined,
    status,
    dueDate: parsedDueDate,
    relatedDocumentId: relatedDocumentId || undefined,
    relatedInvoiceId: relatedInvoiceId || undefined,
  });

  // Activity log: task created
  try {
    await logActivity({
      estateId: String(estateObjectId),
      kind: "TASK",
      action: "created",
      entityId: String(taskDoc._id),
      message: `Task created: ${String(taskDoc.title ?? "Untitled")}`,
      snapshot: {
        title: taskDoc.title ?? null,
        status: taskDoc.status ?? null,
        dueDate: taskDoc.dueDate ?? null,
        relatedDocumentId: taskDoc.relatedDocumentId ?? null,
        relatedInvoiceId: taskDoc.relatedInvoiceId ?? null,
      },
    });
  } catch {
    // Don't block task creation if activity logging fails
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