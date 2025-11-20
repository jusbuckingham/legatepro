

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Expense } from "@/models/Expense";

type RouteParams = {
  params: Promise<{
    estateId: string;
    expenseId: string;
  }>;
};

async function getSessionUserId() {
  const session = await auth();
  return session?.user?.id as string | undefined;
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { estateId, expenseId } = await params;

    if (!estateId || !expenseId) {
      return NextResponse.json(
        { error: "Missing estateId or expenseId" },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const expense = await Expense.findOne({
      _id: expenseId,
      estateId,
      ownerId: userId,
    }).lean();

    if (!expense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    return NextResponse.json({ expense }, { status: 200 });
  } catch (error) {
    console.error(
      "[GET /api/estates/[estateId]/expenses/[expenseId]] Error:",
      error
    );
    return NextResponse.json(
      { error: "Failed to fetch expense" },
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { estateId, expenseId } = await params;

    if (!estateId || !expenseId) {
      return NextResponse.json(
        { error: "Missing estateId or expenseId" },
        { status: 400 }
      );
    }

    const body = await req.json();

    const {
      description,
      amount,
      category,
      incurredAt,
      payee,
      reference,
      notes,
      status,
      propertyId,
    } = body as {
      description?: string;
      amount?: number;
      category?: string;
      incurredAt?: string;
      payee?: string;
      reference?: string;
      notes?: string;
      status?: string;
      propertyId?: string | null;
    };

    const update: Record<string, unknown> = {};

    if (description !== undefined) update.description = description;
    if (amount !== undefined) update.amount = amount;
    if (category !== undefined) update.category = category;
    if (incurredAt !== undefined) {
      update.incurredAt = incurredAt ? new Date(incurredAt) : null;
    }
    if (payee !== undefined) update.payee = payee;
    if (reference !== undefined) update.reference = reference;
    if (notes !== undefined) update.notes = notes;
    if (status !== undefined) update.status = status;
    if (propertyId !== undefined) {
      update.propertyId = propertyId || null;
    }

    await connectToDatabase();

    const updated = await Expense.findOneAndUpdate(
      {
        _id: expenseId,
        estateId,
        ownerId: userId,
      },
      update,
      {
        new: true,
      }
    ).lean();

    if (!updated) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    return NextResponse.json({ expense: updated }, { status: 200 });
  } catch (error) {
    console.error(
      "[PATCH /api/estates/[estateId]/expenses/[expenseId]] Error:",
      error
    );
    return NextResponse.json(
      { error: "Failed to update expense" },
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { estateId, expenseId } = await params;

    if (!estateId || !expenseId) {
      return NextResponse.json(
        { error: "Missing estateId or expenseId" },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const deleted = await Expense.findOneAndDelete({
      _id: expenseId,
      estateId,
      ownerId: userId,
    }).lean();

    if (!deleted) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error(
      "[DELETE /api/estates/[estateId]/expenses/[expenseId]] Error:",
      error
    );
    return NextResponse.json(
      { error: "Failed to delete expense" },
      { status: 500 }
    );
  }
}