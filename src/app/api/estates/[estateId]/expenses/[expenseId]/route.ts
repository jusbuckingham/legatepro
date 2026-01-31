import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase, serializeMongoDoc } from "@/lib/db";
import { Expense } from "@/models/Expense";
import { logEstateEvent } from "@/lib/estateEvents";
import type { EstateEventType } from "@/models/EstateEvent";
import { Types } from "mongoose";

function isValidObjectId(value: unknown): value is string {
  return typeof value === "string" && Types.ObjectId.isValid(value);
}

type RouteParams = {
  params: Promise<{
    estateId: string;
    expenseId: string;
  }>;
};

type PatchBody = {
  description?: unknown;
  amount?: unknown;
  category?: unknown;
  incurredAt?: unknown;
  payee?: unknown;
  reference?: unknown;
  notes?: unknown;
  status?: unknown;
  propertyId?: unknown;
};

function asPatchBody(value: unknown): PatchBody {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as PatchBody)
    : {};
}

async function getSessionUserId(): Promise<string | null> {
  const session = await auth();
  const id = session?.user?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/**
 * GET /api/estates/[estateId]/expenses/[expenseId]
 * Fetch a single expense for an estate
 */
export async function GET(
  _req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { estateId, expenseId } = await params;

    if (!estateId || !expenseId) {
      return NextResponse.json(
        { ok: false, error: "Missing estateId or expenseId" },
        { status: 400 }
      );
    }

    if (!isValidObjectId(estateId) || !isValidObjectId(expenseId)) {
      return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    }

    if (!isValidObjectId(userId)) {
      return NextResponse.json({ ok: false, error: "Invalid userId" }, { status: 400 });
    }

    const estateObjectId = new Types.ObjectId(estateId);
    const expenseObjectId = new Types.ObjectId(expenseId);
    const ownerObjectId = new Types.ObjectId(userId);

    await connectToDatabase();

    const expense = await Expense.findOne({
      _id: expenseObjectId,
      estateId: estateObjectId,
      ownerId: ownerObjectId,
    }).lean();

    if (!expense) {
      return NextResponse.json({ ok: false, error: "Expense not found" }, { status: 404 });
    }

    const expenseOut = serializeMongoDoc(expense as unknown as Record<string, unknown>);

    return NextResponse.json({ ok: true, expense: expenseOut }, { status: 200 });
  } catch (error) {
    console.error(
      "[GET /api/estates/[estateId]/expenses/[expenseId]] Error:",
      error
    );
    return NextResponse.json(
      { ok: false, error: "Failed to fetch expense" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/estates/[estateId]/expenses/[expenseId]
 * Update an expense
 */
export async function PATCH(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { estateId, expenseId } = await params;

    if (!estateId || !expenseId) {
      return NextResponse.json(
        { ok: false, error: "Missing estateId or expenseId" },
        { status: 400 }
      );
    }

    if (!isValidObjectId(estateId) || !isValidObjectId(expenseId)) {
      return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    }

    if (!isValidObjectId(userId)) {
      return NextResponse.json({ ok: false, error: "Invalid userId" }, { status: 400 });
    }

    const estateObjectId = new Types.ObjectId(estateId);
    const expenseObjectId = new Types.ObjectId(expenseId);
    const ownerObjectId = new Types.ObjectId(userId);

    const raw = await req.json().catch(() => undefined);
    if (raw === undefined) {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const body = asPatchBody(raw);

    const update: Record<string, unknown> = {};

    if (typeof body.description === "string") update.description = body.description;
    if (typeof body.amount === "number") update.amount = body.amount;
    if (typeof body.category === "string") update.category = body.category;

    if (body.incurredAt !== undefined) {
      if (body.incurredAt === null || body.incurredAt === "") {
        update.incurredAt = null;
      } else if (typeof body.incurredAt === "string" || typeof body.incurredAt === "number") {
        const d = new Date(body.incurredAt);
        if (!Number.isNaN(d.getTime())) update.incurredAt = d;
      }
    }

    if (typeof body.payee === "string") update.payee = body.payee;
    if (typeof body.reference === "string") update.reference = body.reference;
    if (typeof body.notes === "string") update.notes = body.notes;
    if (typeof body.status === "string") update.status = body.status;

    if (body.propertyId !== undefined) {
      if (body.propertyId === null || body.propertyId === "") {
        update.propertyId = null;
      } else if (typeof body.propertyId === "string") {
        if (!isValidObjectId(body.propertyId)) {
          return NextResponse.json({ ok: false, error: "Invalid propertyId" }, { status: 400 });
        }
        update.propertyId = body.propertyId;
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ ok: false, error: "No valid fields provided" }, { status: 400 });
    }

    await connectToDatabase();

    const updated = await Expense.findOneAndUpdate(
      {
        _id: expenseObjectId,
        estateId: estateObjectId,
        ownerId: ownerObjectId,
      },
      update,
      {
        new: true,
        runValidators: true,
      }
    ).lean();

    if (!updated) {
      return NextResponse.json({ ok: false, error: "Expense not found" }, { status: 404 });
    }

    const expenseOut = serializeMongoDoc(updated as unknown as Record<string, unknown>);

    try {
      await logEstateEvent({
        ownerId: userId,
        estateId,
        type: "EXPENSE_UPDATED" as const as EstateEventType,
        summary: "Expense updated",
        detail: `Updated expense ${expenseId}`,
        meta: {
          expenseId,
          updatedFields: Object.keys(update),
          actorId: userId,
        },
      });
    } catch (e) {
      console.warn(
        "[PATCH /api/estates/[estateId]/expenses/[expenseId]] Failed to log event:",
        e
      );
    }

    return NextResponse.json({ ok: true, expense: expenseOut }, { status: 200 });
  } catch (error) {
    if (typeof error === "object" && error !== null && "name" in error) {
      const name = (error as { name?: unknown }).name;
      if (name === "ValidationError") {
        return NextResponse.json(
          { ok: false, error: "Invalid expense fields" },
          { status: 400 }
        );
      }
    }
    console.error(
      "[PATCH /api/estates/[estateId]/expenses/[expenseId]] Error:",
      error
    );
    return NextResponse.json(
      { ok: false, error: "Failed to update expense" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/estates/[estateId]/expenses/[expenseId]
 * Delete an expense
 */
export async function DELETE(
  _req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { estateId, expenseId } = await params;

    if (!estateId || !expenseId) {
      return NextResponse.json(
        { ok: false, error: "Missing estateId or expenseId" },
        { status: 400 }
      );
    }

    if (!isValidObjectId(estateId) || !isValidObjectId(expenseId)) {
      return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    }

    if (!isValidObjectId(userId)) {
      return NextResponse.json({ ok: false, error: "Invalid userId" }, { status: 400 });
    }

    const estateObjectId = new Types.ObjectId(estateId);
    const expenseObjectId = new Types.ObjectId(expenseId);
    const ownerObjectId = new Types.ObjectId(userId);

    await connectToDatabase();

    const deleted = await Expense.findOneAndDelete({
      _id: expenseObjectId,
      estateId: estateObjectId,
      ownerId: ownerObjectId,
    }).lean();

    if (!deleted) {
      return NextResponse.json({ ok: false, error: "Expense not found" }, { status: 404 });
    }

    try {
      await logEstateEvent({
        ownerId: userId,
        estateId,
        type: "EXPENSE_DELETED" as const as EstateEventType,
        summary: "Expense deleted",
        detail: `Deleted expense ${expenseId}`,
        meta: {
          expenseId,
          actorId: userId,
        },
      });
    } catch (e) {
      console.warn(
        "[DELETE /api/estates/[estateId]/expenses/[expenseId]] Failed to log event:",
        e
      );
    }

    return NextResponse.json(
      { ok: true, data: { success: true, id: String((deleted as { _id?: unknown })._id ?? "") } },
      { status: 200 }
    );
  } catch (error) {
    console.error(
      "[DELETE /api/estates/[estateId]/expenses/[expenseId]] Error:",
      error
    );
    return NextResponse.json(
      { ok: false, error: "Failed to delete expense" },
      { status: 500 }
    );
  }
}