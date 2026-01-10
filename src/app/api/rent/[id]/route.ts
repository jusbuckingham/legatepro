// src/app/api/rent/[id]/route.ts
// Single Rent Payment API (view, update, delete)

import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { RentPayment } from "@/models/RentPayment";

type RouteParams = {
  params: {
    id: string;
  };
};

export const dynamic = "force-dynamic";

/** TODO: Inject authenticated user ID from middleware/session */
const OWNER_ID_PLACEHOLDER = "demo-user";

/**
 * GET /api/rent/[id]
 * Fetch a single rent payment record
 */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Missing rent payment id" },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const ownerId = OWNER_ID_PLACEHOLDER;

    const payment = await RentPayment.findOne({
      _id: id,
      ownerId,
    }).lean();

    if (!payment) {
      return NextResponse.json(
        { ok: false, error: "Rent payment not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { ok: true, payment: { ...payment, _id: String(payment._id) } },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("GET /api/rent/[id] error", error);
    return NextResponse.json(
      { ok: false, error: "Unable to load rent payment" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/rent/[id]
 * Update a single rent payment record (partial update)
 */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Missing rent payment id" },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const ownerId = OWNER_ID_PLACEHOLDER;
    const allowedFields = [
      "tenantName",
      "paymentDate",
      "amount",
      "notes",
      "isPaid",
      "periodMonth",
      "periodYear",
      "method",
      "reference",
    ] as const;

    let updates: Partial<Record<typeof allowedFields[number], unknown>> = {};
    try {
      const parsed = await request.json();
      if (parsed && typeof parsed === "object") {
        updates = parsed;
      }
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON" },
        { status: 400 }
      );
    }

    const updatePayload: Record<string, unknown> = {};

    for (const key of allowedFields) {
      if (key in updates) {
        const value = updates[key];
        if (key === "paymentDate" && value != null) {
          if (
            typeof value === "string" ||
            typeof value === "number" ||
            value instanceof Date
          ) {
            updatePayload.paymentDate = new Date(value);
          }
        } else if (key === "amount" && value != null) {
          updatePayload.amount = Number(value);
        } else {
          updatePayload[key] = value;
        }
      }
    }

    const payment = await RentPayment.findOneAndUpdate(
      { _id: id, ownerId },
      { $set: updatePayload },
      { new: true }
    ).lean();

    if (!payment) {
      return NextResponse.json(
        { ok: false, error: "Rent payment not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { ok: true, payment: { ...payment, _id: String(payment._id) } },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("PATCH /api/rent/[id] error", error);
    return NextResponse.json(
      { ok: false, error: "Unable to update rent payment" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/rent/[id]
 * Delete a single rent payment record
 */
export async function DELETE(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Missing rent payment id" },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const ownerId = OWNER_ID_PLACEHOLDER;

    const payment = await RentPayment.findOneAndDelete({
      _id: id,
      ownerId,
    }).lean();

    if (!payment) {
      return NextResponse.json(
        { ok: false, error: "Rent payment not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { ok: true, id },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("DELETE /api/rent/[id] error", error);
    return NextResponse.json(
      { ok: false, error: "Unable to delete rent payment" },
      { status: 500 }
    );
  }
}
