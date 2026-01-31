import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/lib/auth";
import { connectToDatabase, serializeMongoDoc } from "@/lib/db";
import { Expense } from "@/models/Expense";
import { logEstateEvent } from "@/lib/estateEvents";
import type { EstateEventType } from "@/models/EstateEvent";

/**
 * Helpers
 */
function toObjectId(id: string) {
  return mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : null;
}

function isValidObjectIdString(id: unknown): id is string {
  return typeof id === "string" && mongoose.Types.ObjectId.isValid(id);
}

function parseLimit(value: string | null, def = 100, max = 500): number {
  if (!value) return def;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), max);
}

/**
 * GET /api/estates/[estateId]/expenses
 * Fetch all expenses for a given estate (scoped to owner)
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ estateId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { estateId } = await params;

  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get("limit"), 100, 500);

  const estateObjectId = toObjectId(estateId);
  const ownerObjectId = isValidObjectIdString(session.user.id)
    ? new mongoose.Types.ObjectId(session.user.id)
    : null;

  if (!estateObjectId || !ownerObjectId) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }

  await connectToDatabase();

  const expensesRaw = await Expense.find({
    estateId: estateObjectId,
    ownerId: ownerObjectId,
  })
    .limit(limit)
    .sort({ date: -1 })
    .lean()
    .exec();

  const expenses = expensesRaw.map((d) => serializeMongoDoc(d));

  return NextResponse.json({ ok: true, expenses });
}

/**
 * POST /api/estates/[estateId]/expenses
 * Create a new expense for an estate
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ estateId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { estateId } = await params;

  const estateObjectId = toObjectId(estateId);
  const ownerObjectId = isValidObjectIdString(session.user.id)
    ? new mongoose.Types.ObjectId(session.user.id)
    : null;

  if (!estateObjectId || !ownerObjectId) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = (await req.json()) as unknown;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { ok: false, error: "Invalid request body" },
      { status: 400 }
    );
  }

  const payload = { ...(body as Record<string, unknown>) };

  // Never allow clients to override ownership/scoping fields.
  delete payload._id;
  delete payload.id;
  delete payload.estateId;
  delete payload.ownerId;
  delete payload.createdAt;
  delete payload.updatedAt;

  await connectToDatabase();

  const expenseDoc = await Expense.create({
    ...payload,
    estateId: estateObjectId,
    ownerId: ownerObjectId,
  });

  const expense = serializeMongoDoc(expenseDoc);

  try {
    await logEstateEvent({
      ownerId: session.user.id,
      estateId,
      type: "EXPENSE_CREATED" as const as EstateEventType,
      summary: "Expense created",
      detail: `Created expense ${String((expense as { id?: unknown }).id ?? "")}`,
      meta: {
        expenseId: String((expense as { id?: unknown }).id ?? ""),
        actorId: session.user.id,
      },
    });
  } catch (e) {
    console.warn(
      "[POST /api/estates/[estateId]/expenses] Failed to log event:",
      e
    );
  }

  return NextResponse.json({ ok: true, expense }, { status: 201 });
}
