import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Expense } from "@/models/Expense";

type RouteParams = { expenseId: string };

export async function GET(
  _req: NextRequest,
  context: { params: Promise<RouteParams> }
) {
  try {
    const { expenseId } = await context.params;

    await connectToDatabase();
    const expense = await Expense.findById(expenseId);

    if (!expense) {
      return NextResponse.json(
        { error: "Expense not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ expense }, { status: 200 });
  } catch (error) {
    console.error("[EXPENSE_GET]", error);
    return NextResponse.json(
      { error: "Failed to fetch expense" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<RouteParams> }
) {
  try {
    const { expenseId } = await context.params;
    const body = await req.json();

    await connectToDatabase();
    const expense = await Expense.findByIdAndUpdate(expenseId, body, {
      new: true,
      runValidators: true,
    });

    if (!expense) {
      return NextResponse.json(
        { error: "Expense not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ expense }, { status: 200 });
  } catch (error) {
    console.error("[EXPENSE_PUT]", error);
    return NextResponse.json(
      { error: "Failed to update expense" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<RouteParams> }
) {
  try {
    const { expenseId } = await context.params;

    await connectToDatabase();
    const expense = await Expense.findByIdAndDelete(expenseId);

    if (!expense) {
      return NextResponse.json(
        { error: "Expense not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("[EXPENSE_DELETE]", error);
    return NextResponse.json(
      { error: "Failed to delete expense" },
      { status: 500 }
    );
  }
}