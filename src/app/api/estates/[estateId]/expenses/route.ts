import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Expense } from "@/models/Expense";

/**
 * Helpers
 */
function toObjectId(id: string) {
  return mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : null;
}

/**
 * GET /api/estates/[estateId]/expenses
 * Fetch all expenses for a given estate (scoped to owner)
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ estateId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { estateId } = await params;

  const estateObjectId = toObjectId(estateId);
  const ownerObjectId = toObjectId(session.user.id);

  if (!estateObjectId || !ownerObjectId) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  await connectToDatabase();

  const expenses = await Expense.find({
    estateId: estateObjectId,
    ownerId: ownerObjectId,
  })
    .sort({ date: -1 })
    .lean()
    .exec();

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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { estateId } = await params;

  const estateObjectId = toObjectId(estateId);
  const ownerObjectId = toObjectId(session.user.id);

  if (!estateObjectId || !ownerObjectId) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = (await req.json()) as Record<string, unknown>;

  await connectToDatabase();

  const expense = await Expense.create({
    ...body,
    estateId: estateObjectId,
    ownerId: ownerObjectId,
  });

  return NextResponse.json({ ok: true, expense }, { status: 201 });
}
