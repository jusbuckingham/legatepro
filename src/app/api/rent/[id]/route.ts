// src/app/api/rent/[id]/route.ts
// Single Rent Payment API (view, update, delete)

import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/db";
import { RentPayment } from "../../../../models/RentPayment";

interface RouteParams {
  params: {
    id: string;
  };
}

const OWNER_ID_PLACEHOLDER = "demo-user"; // TODO: replace with authenticated user id

/**
 * GET /api/rent/[id]
 * Fetch a single rent payment record
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json(
        { error: "Missing rent payment id" },
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
        { error: "Rent payment not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { payment: { ...payment, _id: String(payment._id) } },
      { status: 200 }
    );
  } catch (error) {
    console.error("GET /api/rent/[id] error", error);
    return NextResponse.json(
      { error: "Unable to load rent payment" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/rent/[id]
 * Update a single rent payment record (partial update)
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json(
        { error: "Missing rent payment id" },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const ownerId = OWNER_ID_PLACEHOLDER;
    const updates = await request.json();

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

    const updatePayload: Record<string, unknown> = {};

    for (const key of allowedFields) {
      if (key in updates) {
        if (key === "paymentDate") {
          updatePayload.paymentDate = new Date(updates[key]);
        } else if (key === "amount") {
          updatePayload.amount = Number(updates[key]);
        } else {
          updatePayload[key] = updates[key];
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
        { error: "Rent payment not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { payment: { ...payment, _id: String(payment._id) } },
      { status: 200 }
    );
  } catch (error) {
    console.error("PATCH /api/rent/[id] error", error);
    return NextResponse.json(
      { error: "Unable to update rent payment" },
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
) {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json(
        { error: "Missing rent payment id" },
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
        { error: "Rent payment not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, id },
      { status: 200 }
    );
  } catch (error) {
    console.error("DELETE /api/rent/[id] error", error);
    return NextResponse.json(
      { error: "Unable to delete rent payment" },
      { status: 500 }
    );
  }
}
