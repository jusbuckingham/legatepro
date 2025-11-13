// src/app/api/expenses/route.ts
// Estate expenses API for LegatePro

import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/db";
import { Expense } from "../../../models/Expense";

// GET /api/expenses
// Optional query params:
//   estateId: string          -> filter by estate
//   category: string          -> filter by category
//   isPaid: "true" | "false"  -> filter by paid status
//   from: string (ISO date)   -> filter expenses on/after this date
//   to: string (ISO date)     -> filter expenses on/before this date
//   q: string                 -> search description, payee, notes
export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();

    // TODO: replace with real ownerId from auth/session
    const ownerId = "demo-user";

    const { searchParams } = new URL(request.url);
    const estateId = searchParams.get("estateId");
    const category = searchParams.get("category");
    const isPaidParam = searchParams.get("isPaid");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const q = searchParams.get("q")?.trim() ?? "";

    const filter: Record<string, unknown> = { ownerId };

    if (estateId) {
      filter.estateId = estateId;
    }

    if (category) {
      filter.category = category;
    }

    if (isPaidParam === "true") {
      filter.isPaid = true;
    } else if (isPaidParam === "false") {
      filter.isPaid = false;
    }

    if (from || to) {
      const dateFilter: Record<string, Date> = {};
      if (from) {
        dateFilter.$gte = new Date(from);
      }
      if (to) {
        dateFilter.$lte = new Date(to);
      }
      filter.date = dateFilter;
    }

    if (q) {
      filter.$or = [
        { description: { $regex: q, $options: "i" } },
        { payee: { $regex: q, $options: "i" } },
        { notes: { $regex: q, $options: "i" } },
      ];
    }

    const expenses = await Expense.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .lean();

    return NextResponse.json({ expenses }, { status: 200 });
  } catch (error) {
    console.error("GET /api/expenses error", error);
    return NextResponse.json(
      { error: "Unable to load expenses" },
      { status: 500 }
    );
  }
}

// POST /api/expenses
// Creates a new expense entry for an estate
export async function POST(request: NextRequest) {
  try {
    await connectToDatabase();

    // TODO: replace with real ownerId from auth/session
    const ownerId = "demo-user";

    const body = await request.json();

    const {
      estateId,
      date,
      category,
      description,
      amount,
      payee,
      notes,
      isPaid,
      propertyId,
      utilityAccountId,
      documentId,
    } = body ?? {};

    if (!estateId) {
      return NextResponse.json(
        { error: "estateId is required" },
        { status: 400 }
      );
    }

    if (!date) {
      return NextResponse.json(
        { error: "date is required" },
        { status: 400 }
      );
    }

    if (!description) {
      return NextResponse.json(
        { error: "description is required" },
        { status: 400 }
      );
    }

    if (amount == null || Number.isNaN(Number(amount))) {
      return NextResponse.json(
        { error: "A valid amount is required" },
        { status: 400 }
      );
    }

    const expense = await Expense.create({
      ownerId,
      estateId,
      date: new Date(date),
      category: category || "OTHER",
      description,
      amount: Number(amount),
      payee,
      notes,
      isPaid: typeof isPaid === "boolean" ? isPaid : true,
      propertyId,
      utilityAccountId,
      documentId,
    });

    return NextResponse.json({ expense }, { status: 201 });
  } catch (error) {
    console.error("POST /api/expenses error", error);
    return NextResponse.json(
      { error: "Unable to create expense" },
      { status: 500 }
    );
  }
}
