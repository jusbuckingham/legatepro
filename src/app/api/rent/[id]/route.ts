// src/app/api/rent/[id]/route.ts
// Single Rent Payment API (view, update, delete)

import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { RentPayment } from "@/models/RentPayment";
import { auth } from "@/lib/auth";
import {
  jsonErr,
  jsonNotFound,
  jsonOk,
  jsonUnauthorized,
  noStoreHeaders,
  requireObjectIdLike,
  safeErrorMessage,
} from "@/lib/apiResponse";

type RouteParams = {
  id: string;
};

type RouteContext = {
  params: Promise<RouteParams>;
};

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, context: RouteContext): Promise<Response> {
  try {
    const headers = noStoreHeaders();
    const session = await auth();
    if (!session?.user?.id) return jsonUnauthorized();

    const { id } = await context.params;

    if (!id) return jsonErr("Missing rent payment id", 400, "BAD_REQUEST", { headers });
    if (!requireObjectIdLike(id)) return jsonErr("Invalid rent payment id", 400, "BAD_REQUEST", { headers });

    await connectToDatabase();

    const ownerId = session.user.id;

    const payment = await RentPayment.findOne({
      _id: id,
      ownerId,
    }).lean();

    if (!payment) return jsonNotFound("Rent payment not found");

    return jsonOk(
      { payment: { ...payment, _id: String(payment._id) } },
      { headers },
    );
  } catch (error) {
    console.error("GET /api/rent/[id] error:", safeErrorMessage(error));
    return jsonErr("Unable to load rent payment", 500, "INTERNAL_ERROR", { headers: noStoreHeaders() });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext): Promise<Response> {
  try {
    const headers = noStoreHeaders();
    const session = await auth();
    if (!session?.user?.id) return jsonUnauthorized();

    const { id } = await context.params;

    if (!id) return jsonErr("Missing rent payment id", 400, "BAD_REQUEST", { headers });
    if (!requireObjectIdLike(id)) return jsonErr("Invalid rent payment id", 400, "BAD_REQUEST", { headers });

    await connectToDatabase();

    const ownerId = session.user.id;
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
      return jsonErr("Invalid JSON", 400, "BAD_REQUEST", { headers });
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

    if (!payment) return jsonNotFound("Rent payment not found");

    return jsonOk(
      { payment: { ...payment, _id: String(payment._id) } },
      { headers },
    );
  } catch (error) {
    console.error("PATCH /api/rent/[id] error:", safeErrorMessage(error));
    return jsonErr("Unable to update rent payment", 500, "INTERNAL_ERROR", { headers: noStoreHeaders() });
  }
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext
): Promise<Response> {
  try {
    const headers = noStoreHeaders();
    const session = await auth();
    if (!session?.user?.id) return jsonUnauthorized();

    const { id } = await context.params;

    if (!id) return jsonErr("Missing rent payment id", 400, "BAD_REQUEST", { headers });
    if (!requireObjectIdLike(id)) return jsonErr("Invalid rent payment id", 400, "BAD_REQUEST", { headers });

    await connectToDatabase();

    const ownerId = session.user.id;

    const payment = await RentPayment.findOneAndDelete({
      _id: id,
      ownerId,
    }).lean();

    if (!payment) return jsonNotFound("Rent payment not found");

    return jsonOk({ id }, { headers });
  } catch (error) {
    console.error("DELETE /api/rent/[id] error:", safeErrorMessage(error));
    return jsonErr("Unable to delete rent payment", 500, "INTERNAL_ERROR", { headers: noStoreHeaders() });
  }
}
