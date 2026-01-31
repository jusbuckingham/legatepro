import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { auth } from "@/lib/auth";
import { requireEstateAccess, requireEstateEditAccess } from "@/lib/estateAccess";
import { Expense } from "@/models/Expense";

type RouteContext = {
  params: Promise<{
    expenseId: string;
  }>;
};

type UpdateExpensePayload = {
  description?: string;
  category?: string;
  status?: string;
  payee?: string;
  notes?: string;
  reimbursable?: boolean;
  incurredAt?: string | Date | null;
  amountCents?: number | string;
  receiptUrl?: string;
};

type LeanExpenseShape = {
  _id: unknown;
  estateId: unknown;
  description?: string;
  category?: string;
  status?: string;
  payee?: string;
  notes?: string;
  reimbursable?: boolean;
  incurredAt?: Date | null;
  amountCents?: number;
  receiptUrl?: string | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
};

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

function isValidObjectId(id: string): boolean {
  return Types.ObjectId.isValid(id);
}

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
    const r = (v.res ?? v.response) as unknown;
    if (isResponse(r)) return r;
  }
  return null;
}

async function enforceEstateAccess(opts: {
  estateId: string;
  userId: string;
  mode: "viewer" | "editor";
}): Promise<Response | true> {
  const fn = opts.mode === "editor" ? requireEstateEditAccess : requireEstateAccess;
  const out = (await fn({ estateId: opts.estateId, userId: opts.userId })) as unknown;
  const maybe = pickResponse(out);
  if (maybe) return maybe;
  return true;
}

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

function serializeExpense(expense: LeanExpenseShape) {
  return {
    ok: true as const,
    id: String(expense._id),
    estateId: String(expense.estateId),
    description: expense.description ?? "",
    category: expense.category ?? "",
    status: expense.status ?? "PENDING",
    payee: expense.payee ?? "",
    notes: expense.notes ?? "",
    reimbursable: Boolean(expense.reimbursable),
    incurredAt: expense.incurredAt ?? null,
    amountCents: typeof expense.amountCents === "number" ? expense.amountCents : 0,
    receiptUrl: expense.receiptUrl ?? "",
    createdAt: expense.createdAt ?? null,
    updatedAt: expense.updatedAt ?? null,
  };
}

async function loadExpense(opts: {
  expenseId: string;
  userId: string;
}): Promise<LeanExpenseShape | null> {
  return Expense.findOne({ _id: opts.expenseId, ownerId: opts.userId })
    .lean<LeanExpenseShape | null>()
    .exec();
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const { expenseId } = await params;
  if (!isValidObjectId(expenseId)) {
    return NextResponse.json(
      { ok: false, error: "Invalid id" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  await connectToDatabase();

  const expense = await loadExpense({ expenseId, userId: session.user.id });
  if (!expense) {
    return NextResponse.json(
      { ok: false, error: "Not found" },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  // Enforce estate access based on the expense's estateId
  const estateId = String(expense.estateId);
  if (isValidObjectId(estateId)) {
    const access = await enforceEstateAccess({
      estateId,
      userId: session.user.id,
      mode: "viewer",
    });
    if (access instanceof Response) {
      const cloned = new Response(access.body, access);
      cloned.headers.set("Cache-Control", "no-store");
      return cloned;
    }
  }

  return NextResponse.json(serializeExpense(expense), {
    status: 200,
    headers: NO_STORE_HEADERS,
  });
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const { expenseId } = await params;
  if (!isValidObjectId(expenseId)) {
    return NextResponse.json(
      { ok: false, error: "Invalid id" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const raw = await req.json().catch(() => null);
  if (!isPlainObject(raw)) {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const body = raw as UpdateExpensePayload;

  await connectToDatabase();

  // Load first to enforce estate edit access against the correct estate.
  const existing = await loadExpense({ expenseId, userId: session.user.id });
  if (!existing) {
    return NextResponse.json(
      { ok: false, error: "Not found" },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  const estateId = String(existing.estateId);
  if (isValidObjectId(estateId)) {
    const access = await enforceEstateAccess({
      estateId,
      userId: session.user.id,
      mode: "editor",
    });
    if (access instanceof Response) {
      const cloned = new Response(access.body, access);
      cloned.headers.set("Cache-Control", "no-store");
      return cloned;
    }
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
    updateDoc.receiptUrl = trimmed.length ? trimmed : null;
  }

  if (body.incurredAt === null) {
    updateDoc.incurredAt = null;
  } else if (body.incurredAt) {
    const asDate =
      body.incurredAt instanceof Date ? body.incurredAt : new Date(body.incurredAt);
    if (!Number.isNaN(asDate.getTime())) {
      updateDoc.incurredAt = asDate;
    }
  }

  const normalizedAmount = normalizeAmountCents(body.amountCents);
  if (typeof normalizedAmount === "number" && normalizedAmount >= 0) {
    updateDoc.amountCents = normalizedAmount;
  }

  if (Object.keys(updateDoc).length === 0) {
    return NextResponse.json(
      { ok: false, error: "No valid fields to update" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const updated = await Expense.findOneAndUpdate(
      { _id: expenseId, ownerId: session.user.id },
      { $set: updateDoc },
      { new: true, runValidators: true },
    )
      .lean<LeanExpenseShape | null>()
      .exec();

    if (!updated) {
      return NextResponse.json(
        { ok: false, error: "Not found" },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    }

    return NextResponse.json(serializeExpense(updated), {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (err) {
    console.error("Error updating expense", err);
    return NextResponse.json(
      { ok: false, error: "Failed to update expense" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
} 

export const dynamic = "force-dynamic";