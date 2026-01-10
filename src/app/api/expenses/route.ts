// src/app/api/expenses/route.ts
// Estate expenses API for LegatePro

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase, serializeMongoDoc } from "@/lib/db";
import { Expense } from "@/models/Expense";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function toObjectId(id: string) {
  return mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : null;
}

// GET /api/expenses
// Optional query params:
//   estateId: string          -> filter by estate
//   category: string          -> filter by category
//   isPaid: "true" | "false"  -> filter by paid status
//   from: string (ISO date)   -> filter expenses on/after this date
//   to: string (ISO date)     -> filter expenses on/before this date
//   q: string                 -> search description, payee, notes
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const ownerObjectId = toObjectId(session.user.id);
  if (!ownerObjectId) {
    return NextResponse.json({ ok: false, error: "Invalid user id" }, { status: 400 });
  }

  try {
    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const estateId = searchParams.get("estateId");
    const category = searchParams.get("category");
    const isPaidParam = searchParams.get("isPaid");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const q = searchParams.get("q")?.trim() ?? "";

    const filter: Record<string, unknown> = {
      ownerId: ownerObjectId,
    };

    if (estateId) {
      const estateObjectId = toObjectId(estateId);
      if (!estateObjectId) {
        return NextResponse.json({ ok: false, error: "Invalid estateId" }, { status: 400 });
      }
      filter.estateId = estateObjectId;
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
        const d = new Date(from);
        if (!Number.isNaN(d.getTime())) dateFilter.$gte = d;
      }
      if (to) {
        const d = new Date(to);
        if (!Number.isNaN(d.getTime())) dateFilter.$lte = d;
      }
      if (Object.keys(dateFilter).length > 0) {
        filter.date = dateFilter;
      }
    }

    if (q) {
      filter.$or = [
        { description: { $regex: q, $options: "i" } },
        { payee: { $regex: q, $options: "i" } },
        { notes: { $regex: q, $options: "i" } },
      ];
    }

    const expensesRaw = await Expense.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .lean()
      .exec();

    const expenses = expensesRaw.map((e) => serializeMongoDoc(e));

    return NextResponse.json({ ok: true, expenses }, { status: 200 });
  } catch (error) {
    console.error("GET /api/expenses error", error);
    return NextResponse.json(
      { ok: false, error: "Unable to load expenses" },
      { status: 500 }
    );
  }
}

// POST /api/expenses
// Creates a new expense entry for an estate
interface CreateExpensePayload {
  estateId: string;
  date: string;
  category?: string;
  description: string;
  amount: number | string;
  payee?: string;
  notes?: string;
  isPaid?: boolean;
  propertyId?: string;
  utilityAccountId?: string;
  documentId?: string;
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const ownerObjectId = toObjectId(session.user.id);
  if (!ownerObjectId) {
    return NextResponse.json({ ok: false, error: "Invalid user id" }, { status: 400 });
  }

  try {
    await connectToDatabase();

    const body = (await request.json()) as Partial<CreateExpensePayload> | null;

    if (!body) {
      return NextResponse.json(
        { ok: false, error: "Request body is required" },
        { status: 400 }
      );
    }

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
    } = body;

    if (!estateId) {
      return NextResponse.json({ ok: false, error: "estateId is required" }, { status: 400 });
    }

    const estateObjectId = toObjectId(estateId);
    if (!estateObjectId) {
      return NextResponse.json({ ok: false, error: "Invalid estateId" }, { status: 400 });
    }

    if (!date) {
      return NextResponse.json({ ok: false, error: "date is required" }, { status: 400 });
    }

    const parsedDate = new Date(date);
    if (Number.isNaN(parsedDate.getTime())) {
      return NextResponse.json({ ok: false, error: "date must be a valid ISO date" }, { status: 400 });
    }

    if (!description) {
      return NextResponse.json({ ok: false, error: "description is required" }, { status: 400 });
    }

    if (amount == null || Number.isNaN(Number(amount))) {
      return NextResponse.json({ ok: false, error: "A valid amount is required" }, { status: 400 });
    }

    const expense = await Expense.create({
      ownerId: ownerObjectId,
      estateId: estateObjectId,
      date: parsedDate,
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

    const expenseOut = serializeMongoDoc(expense.toObject());

    return NextResponse.json({ ok: true, expense: expenseOut }, { status: 201 });
  } catch (error) {
    console.error("POST /api/expenses error", error);
    return NextResponse.json(
      { ok: false, error: "Unable to create expense" },
      { status: 500 }
    );
  }
}