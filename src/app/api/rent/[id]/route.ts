// src/app/api/rent/route.ts
// Rent Payments API (list, create)

import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { RentPayment } from "@/models/RentPayment";
import { auth } from "@/lib/auth";
import {
  jsonErr,
  jsonOk,
  jsonUnauthorized,
  noStoreHeaders,
  requireObjectIdLike,
  safeErrorMessage,
} from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const headers = noStoreHeaders();
    const session = await auth();
    if (!session?.user?.id) return jsonUnauthorized();

    const { searchParams } = new URL(request.url);

    const limitParam = Number(searchParams.get("limit"));
    const limit = Number.isFinite(limitParam) ? Math.min(limitParam, 100) : 25;

    const cursor = searchParams.get("cursor");
    const fromDateParam = searchParams.get("fromDate");
    const toDateParam = searchParams.get("toDate");

    await connectToDatabase();

    const ownerId = session.user.id;

    const query: Record<string, unknown> = { ownerId };

    if (cursor && requireObjectIdLike(cursor)) {
      query._id = { $lt: cursor };
    }

    if (fromDateParam || toDateParam) {
      const range: Record<string, Date> = {};
      if (fromDateParam) {
        const d = new Date(fromDateParam);
        if (!isNaN(d.getTime())) range.$gte = d;
      }
      if (toDateParam) {
        const d = new Date(toDateParam);
        if (!isNaN(d.getTime())) range.$lte = d;
      }
      if (Object.keys(range).length > 0) {
        query.paymentDate = range;
      }
    }

    const payments = await RentPayment.find(query)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean();

    const hasMore = payments.length > limit;
    const sliced = hasMore ? payments.slice(0, limit) : payments;
    const nextCursor = hasMore ? String(sliced[sliced.length - 1]._id) : null;

    return jsonOk(
      {
        payments: sliced.map(p => ({ ...p, _id: String(p._id) })),
        nextCursor,
      },
      { headers }
    );
  } catch (error) {
    console.error("GET /api/rent error:", safeErrorMessage(error));
    return jsonErr("Unable to load rent payments", 500, "INTERNAL_ERROR", { headers: noStoreHeaders() });
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const headers = noStoreHeaders();
    const session = await auth();
    if (!session?.user?.id) return jsonUnauthorized();

    await connectToDatabase();

    const ownerId = session.user.id;

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return jsonErr("Invalid JSON", 400, "BAD_REQUEST", { headers });
    }

    if (!payload || typeof payload !== "object") {
      return jsonErr("Invalid JSON", 400, "BAD_REQUEST", { headers });
    }

    const body = payload as Record<string, unknown>;

    const tenantName = body.tenantName;
    const paymentDate = body.paymentDate;
    const amount = body.amount;
    const notes = body.notes;
    const isPaid = body.isPaid;
    const periodMonth = body.periodMonth;
    const periodYear = body.periodYear;
    const method = body.method;
    const reference = body.reference;

    if (!tenantName || !paymentDate || amount == null) {
      return jsonErr("Missing required fields", 400, "BAD_REQUEST", { headers });
    }

    let paymentDateObj: Date;
    if (paymentDate instanceof Date) {
      paymentDateObj = paymentDate;
    } else if (typeof paymentDate === "string" || typeof paymentDate === "number") {
      paymentDateObj = new Date(paymentDate);
    } else {
      return jsonErr("Invalid payment date", 400, "BAD_REQUEST", { headers });
    }

    if (isNaN(paymentDateObj.getTime())) {
      return jsonErr("Invalid payment date", 400, "BAD_REQUEST", { headers });
    }

    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum)) {
      return jsonErr("Invalid amount", 400, "BAD_REQUEST", { headers });
    }

    const newPayment = await RentPayment.create({
      ownerId,
      tenantName,
      paymentDate: paymentDateObj,
      amount: amountNum,
      notes,
      isPaid: Boolean(isPaid),
      periodMonth,
      periodYear,
      method,
      reference,
    });

    return jsonOk(
      { payment: { ...newPayment.toObject(), _id: String(newPayment._id) } },
      { headers }
    );
  } catch (error) {
    console.error("POST /api/rent error:", safeErrorMessage(error));
    return jsonErr("Unable to create rent payment", 500, "INTERNAL_ERROR", { headers: noStoreHeaders() });
  }
}
