// src/app/api/rent/route.ts
// Unified Rent Payments API for LegatePro

import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/db";
import { RentPayment } from "../../../models/RentPayment";

type RentPaymentLean = {
  _id: unknown;
  estateId: string;
  propertyId: string;
  tenantName: string;
  paymentDate: Date;
  amount: number;
  notes?: string;
  isPaid: boolean;
  [key: string]: unknown;
};

/** ------------------------------------------------------------------------
 * GET /api/rent
 * Query params:
 *   estateId?: string
 *   propertyId?: string
 *   paid?: "true" | "false"
 *   from?: ISO date
 *   to?: ISO date
 *   q?: string (tenantName or notes)
 * ------------------------------------------------------------------------ */
export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();

    const ownerId = "demo-user"; // TODO: replace with authenticated user
    const { searchParams } = new URL(request.url);

    const estateId = searchParams.get("estateId") ?? undefined;
    const propertyId = searchParams.get("propertyId") ?? undefined;
    const paid = searchParams.get("paid") ?? undefined;
    const from = searchParams.get("from") ?? undefined;
    const to = searchParams.get("to") ?? undefined;
    const q = searchParams.get("q")?.trim() || "";

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

    if (q.length > 0) {
      filter.$or = [
        { tenantName: { $regex: q, $options: "i" } },
        { notes: { $regex: q, $options: "i" } },
      ];
    }

    const rawPayments = (await RentPayment.find(filter)
      .sort({ paymentDate: -1 })
      .lean() as unknown as RentPaymentLean[]);

    const payments = rawPayments.map((p: RentPaymentLean) => ({
      ...p,
      _id: String(p._id),
    }));

    return NextResponse.json({ payments }, { status: 200 });
  } catch (error) {
    console.error("GET /api/rent error", error);
    return NextResponse.json(
      { error: "Unable to load rent records" },
      { status: 500 }
    );
  }
}

/** ------------------------------------------------------------------------
 * POST /api/rent
 * Create a rent payment record
 * Body:
 *   estateId: string
 *   propertyId: string
 *   tenantName: string
 *   paymentDate: string | Date
 *   amount: number
 *   notes?: string
 *   isPaid?: boolean
 * ------------------------------------------------------------------------ */
export async function POST(request: NextRequest) {
  try {
    await connectToDatabase();
    const ownerId = "demo-user"; // TODO: replace with authenticated user

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

    // --- Validation ---
    if (!estateId)
      return NextResponse.json({ ok: false, error: "estateId is required" }, { status: 400 });

    if (!propertyId)
      return NextResponse.json(
        { error: "propertyId is required" },
        { status: 400 }
      );

    if (!tenantName)
      return NextResponse.json(
        { error: "tenantName is required" },
        { status: 400 }
      );

    if (!paymentDate)
      return NextResponse.json(
        { error: "paymentDate is required" },
        { status: 400 }
      );

    if (amount == null || Number.isNaN(Number(amount)))
      return NextResponse.json(
        { error: "Valid amount is required" },
        { status: 400 }
      );

    // --- Create Record ---
    const payment = await RentPayment.create({
      ownerId,
      estateId,
      propertyId,
      tenantName,
      paymentDate: new Date(paymentDate),
      amount: Number(amount),
      notes: notes || "",
      isPaid: typeof isPaid === "boolean" ? isPaid : true,
    });

    return NextResponse.json(
      { payment: { ...payment.toJSON(), _id: String(payment._id) } },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/rent error", error);
    return NextResponse.json(
      { error: "Unable to create rent record" },
      { status: 500 }
    );
  }
}