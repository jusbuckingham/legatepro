import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Expense } from "@/models/Expense";

type RouteContext = {
  params: Promise<{
    expenseId: string;
  }>;
};

type UpdateExpensePayload = {
  estateId?: string;
  description?: string;
  category?: string;
  status?: string;
  payee?: string;
  notes?: string;
  reimbursable?: boolean;
  incurredAt?: string | Date | null;
  amountCents?: number;
  receiptUrl?: string;
};

type LeanExpenseShape = {
  _id?: unknown;
  estateId?: unknown;
  description?: string;
  category?: string;
  status?: string;
  payee?: string;
  notes?: string;
  reimbursable?: boolean;
  incurredAt?: Date | null;
  amountCents?: number;
  receiptUrl?: string;
  createdAt?: Date | null;
  updatedAt?: Date | null;
};

function normalizeAmountCents(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.round(raw);
  }
  if (typeof raw === "string") {
    const cleaned = raw.replace(/[,$]/g, "").trim();
    if (!cleaned) return undefined;
    const asNumber = Number.parseFloat(cleaned);
    if (!Number.isFinite(asNumber)) return undefined;

    // If this looks like a dollar amount, convert to cents; if it's a large int, assume cents.
    if (asNumber < 10_000) {
      return Math.round(asNumber * 100);
    }
    return Math.round(asNumber);
  }
  return undefined;
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { expenseId } = await params;

  await connectToDatabase();

  const expenseDoc = await Expense.findOne({
    _id: expenseId,
    ownerId: session.user.id,
  })
    .lean()
    .exec();

  if (!expenseDoc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const expense = expenseDoc as unknown as LeanExpenseShape;

  return NextResponse.json({
    id: String(expense._id),
    estateId: String(expense.estateId),
    description: expense.description ?? "",
    category: expense.category ?? "",
    status: expense.status ?? "PENDING",
    payee: expense.payee ?? "",
    notes: expense.notes ?? "",
    reimbursable: Boolean(expense.reimbursable),
    incurredAt: expense.incurredAt ?? null,
    amountCents:
      typeof expense.amountCents === "number" ? expense.amountCents : 0,
    receiptUrl: expense.receiptUrl ?? "",
    createdAt: expense.createdAt ?? null,
    updatedAt: expense.updatedAt ?? null,
  });
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { expenseId } = await params;

  await connectToDatabase();

  let body: UpdateExpensePayload;
  try {
    body = (await req.json()) as UpdateExpensePayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updateDoc: Record<string, unknown> = {};

  if (typeof body.description === "string") {
    updateDoc.description = body.description.trim();
  }

  if (typeof body.category === "string") {
    updateDoc.category = body.category.trim();
  }

  if (typeof body.status === "string") {
    updateDoc.status = body.status.trim();
  }

  if (typeof body.payee === "string") {
    updateDoc.payee = body.payee.trim();
  }

  if (typeof body.notes === "string") {
    updateDoc.notes = body.notes.trim();
  }

  if (typeof body.reimbursable === "boolean") {
    updateDoc.reimbursable = body.reimbursable;
  }

  if (typeof body.receiptUrl === "string") {
    const trimmed = body.receiptUrl.trim();
    updateDoc.receiptUrl = trimmed || undefined;
  }

  if (body.incurredAt) {
    const asDate =
      body.incurredAt instanceof Date
        ? body.incurredAt
        : new Date(body.incurredAt);
    if (!Number.isNaN(asDate.getTime())) {
      updateDoc.incurredAt = asDate;
    }
  }

  const normalizedAmount = normalizeAmountCents(body.amountCents);
  if (typeof normalizedAmount === "number" && normalizedAmount >= 0) {
    updateDoc.amountCents = normalizedAmount;
  }

  try {
    const updatedDoc = await Expense.findOneAndUpdate(
      {
        _id: expenseId,
        ownerId: session.user.id,
      },
      { $set: updateDoc },
      { new: true },
    )
      .lean()
      .exec();

    if (!updatedDoc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updated = updatedDoc as unknown as LeanExpenseShape;

    return NextResponse.json({
      id: String(updated._id),
      estateId: String(updated.estateId),
      description: updated.description ?? "",
      category: updated.category ?? "",
      status: updated.status ?? "PENDING",
      payee: updated.payee ?? "",
      notes: updated.notes ?? "",
      reimbursable: Boolean(updated.reimbursable),
      incurredAt: updated.incurredAt ?? null,
      amountCents:
        typeof updated.amountCents === "number" ? updated.amountCents : 0,
      receiptUrl: updated.receiptUrl ?? "",
      createdAt: updated.createdAt ?? null,
      updatedAt: updated.updatedAt ?? null,
    });
  } catch (err) {
    console.error("Error updating expense", err);
    return NextResponse.json(
      { error: "Failed to update expense" },
      { status: 500 },
    );
  }
}