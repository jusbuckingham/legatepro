// src/app/api/rent/route.ts
// Unified Rent Payments API for LegatePro

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

import { auth } from "../../../lib/auth";
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

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isValidObjectId(value: string): boolean {
  return mongoose.Types.ObjectId.isValid(value);
}

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
    const session = await auth();
    const ownerId = session?.user?.id;
    if (!ownerId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const { searchParams } = new URL(request.url);

    const estateId = searchParams.get("estateId") ?? undefined;
    const propertyId = searchParams.get("propertyId") ?? undefined;

    if (estateId && !isValidObjectId(estateId)) {
      return NextResponse.json({ ok: false, error: "Invalid estateId" }, { status: 400 });
    }

    if (propertyId && !isValidObjectId(propertyId)) {
      return NextResponse.json({ ok: false, error: "Invalid propertyId" }, { status: 400 });
    }

    const paid = searchParams.get("paid") ?? undefined;
    const from = searchParams.get("from") ?? undefined;
    const to = searchParams.get("to") ?? undefined;
    const q = searchParams.get("q")?.trim() || "";
    const qSafe = q ? escapeRegex(q) : "";

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
        { tenantName: { $regex: qSafe, $options: "i" } },
        { notes: { $regex: qSafe, $options: "i" } },
      ];
    }

    const rawPayments = (await RentPayment.find(filter)
      .sort({ paymentDate: -1 })
      .lean()
      .exec()) as unknown as RentPaymentLean[];

    const payments = rawPayments.map((p: RentPaymentLean) => ({
      ...p,
      _id: String(p._id),
    }));

    return NextResponse.json({ ok: true, payments }, { status: 200 });
  } catch (error) {
    console.error("GET /api/rent error", error);
    return NextResponse.json(
      { ok: false, error: "Unable to load rent records" },
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
    const session = await auth();
    const ownerId = session?.user?.id;
    if (!ownerId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    let body: unknown = null;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const {
      estateId,
      propertyId,
      tenantName,
      paymentDate,
      amount,
      notes,
      isPaid,
    } = (body ?? {}) as Record<string, unknown>;

    // --- Validation ---
    if (!estateId)
      return NextResponse.json({ ok: false, error: "estateId is required" }, { status: 400 });

    if (!isValidObjectId(String(estateId))) {
      return NextResponse.json({ ok: false, error: "Invalid estateId" }, { status: 400 });
    }

    if (!propertyId)
      return NextResponse.json(
        { ok: false, error: "propertyId is required" },
        { status: 400 }
      );

    if (!isValidObjectId(String(propertyId))) {
      return NextResponse.json({ ok: false, error: "Invalid propertyId" }, { status: 400 });
    }

    if (!tenantName)
      return NextResponse.json(
        { ok: false, error: "tenantName is required" },
        { status: 400 }
      );

    if (!paymentDate)
      return NextResponse.json(
        { ok: false, error: "paymentDate is required" },
        { status: 400 }
      );

    if (amount == null || Number.isNaN(Number(amount)))
      return NextResponse.json(
        { ok: false, error: "Valid amount is required" },
        { status: 400 }
      );

    // --- Parse paymentDate safely (avoid `new Date({})`) ---
    let parsedPaymentDate: Date | null = null;

    if (paymentDate instanceof Date) {
      parsedPaymentDate = paymentDate;
    } else if (typeof paymentDate === "string" || typeof paymentDate === "number") {
      const d = new Date(paymentDate);
      if (!Number.isNaN(d.getTime())) {
        parsedPaymentDate = d;
      }
    }

    if (!parsedPaymentDate) {
      return NextResponse.json(
        { ok: false, error: "paymentDate must be a valid date" },
        { status: 400 }
      );
    }

    // --- Create Record ---
    const payment = await RentPayment.create({
      ownerId,
      estateId: String(estateId),
      propertyId: String(propertyId),
      tenantName,
      paymentDate: parsedPaymentDate,
      amount: Number(amount),
      notes: notes || "",
      isPaid: typeof isPaid === "boolean" ? isPaid : true,
    });

    return NextResponse.json(
      { ok: true, payment: { ...payment.toJSON(), _id: String(payment._id) } },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/rent error", error);
    return NextResponse.json(
      { ok: false, error: "Unable to create rent record" },
      { status: 500 }
    );
  }
}