

// src/app/api/rent/route.ts
// Rent payments API for LegatePro

import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/db";
import { RentPayment } from "../../../models/RentPayment";

// GET /api/rent
// Optional query params:
//   estateId: string          -> filter by estate
//   propertyId: string        -> filter by property
//   paid: "true" | "false"    -> filter by paid status
//   from: ISO date            -> payments from this date onward
//   to: ISO date              -> payments up to this date
//   q: string                 -> search tenantName or notes
export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();

    const ownerId = "demo-user"; // TODO: replace with real auth

    const { searchParams } = new URL(request.url);
    const estateId = searchParams.get("estateId");
    const propertyId = searchParams.get("propertyId");
    const paid = searchParams.get("paid");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const q = searchParams.get("q")?.trim() ?? "";

    const filter: Record<string, unknown> = { ownerId };

    if (estateId) filter.estateId = estateId;
    if (propertyId) filter.propertyId = propertyId;

    if (paid === "true") filter.isPaid = true;
    if (paid === "false") filter.isPaid = false;

    if (from || to) {
      const dateFilter: Record<string, Date> = {};
      if (from) dateFilter.$gte = new Date(from);
      if (to) dateFilter.$lte = new Date(to);
      filter.paymentDate = dateFilter;
    }

    if (q) {
      filter.$or = [
        { tenantName: { $regex: q, $options: "i" } },
        { notes: { $regex: q, $options: "i" } },
      ];
    }

    const payments = await RentPayment.find(filter)
      .sort({ paymentDate: -1 })
      .lean();

    return NextResponse.json({ payments }, { status: 200 });
  } catch (error) {
    console.error("GET /api/rent error", error);
    return NextResponse.json({ error: "Unable to load rent records" }, { status: 500 });
  }
}

// POST /api/rent
// Creates a rent payment entry
export async function POST(request: NextRequest) {
  try {
    await connectToDatabase();

    const ownerId = "demo-user"; // TODO: replace with real auth

    const body = await request.json();

    const {
      estateId,
      propertyId,
      tenantName,
      paymentDate,
      amount,
      notes,
      isPaid,
    } = body ?? {};

    if (!estateId) {
      return NextResponse.json({ error: "estateId is required" }, { status: 400 });
    }

    if (!propertyId) {
      return NextResponse.json({ error: "propertyId is required" }, { status: 400 });
    }

    if (!tenantName) {
      return NextResponse.json({ error: "tenantName is required" }, { status: 400 });
    }

    if (!paymentDate) {
      return NextResponse.json({ error: "paymentDate is required" }, { status: 400 });
    }

    if (amount == null || Number.isNaN(Number(amount))) {
      return NextResponse.json({ error: "Valid amount is required" }, { status: 400 });
    }

    const payment = await RentPayment.create({
      ownerId,
      estateId,
      propertyId,
      tenantName,
      paymentDate: new Date(paymentDate),
      amount: Number(amount),
      notes,
      isPaid: typeof isPaid === "boolean" ? isPaid : true,
    });

    return NextResponse.json({ payment }, { status: 201 });
  } catch (error) {
    console.error("POST /api/rent error", error);
    return NextResponse.json({ error: "Unable to create rent record" }, { status: 500 });
  }
}