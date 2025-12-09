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
    estateId: string;
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

export async function POST(
  req: Request,
  { params }: RouteContext,
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();

  const { estateId } = params;
  if (!estateId) {
    return NextResponse.json(
      { error: "Missing estateId in route params" },
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
    estateId,
    ownerId: session.user.id,
    title: title.trim(),
    description: description?.trim() || undefined,
    status,
    dueDate: parsedDueDate,
    relatedDocumentId: relatedDocumentId || undefined,
    relatedInvoiceId: relatedInvoiceId || undefined,
  });

  return NextResponse.json(
    {
      id: taskDoc.id,
      estateId: taskDoc.estateId,
      ownerId: taskDoc.ownerId,
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