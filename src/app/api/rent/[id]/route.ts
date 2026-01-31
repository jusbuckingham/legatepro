// src/app/api/rent/[id]/route.ts
// Rent Payments API (read, update, delete a single payment)

import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { RentPayment } from "@/models/RentPayment";
import { User } from "@/models/User";
import { EntitlementError, requirePro, toEntitlementsUser } from "@/lib/entitlements";
import { auth } from "@/lib/auth";
import {
  jsonErr,
  jsonOk,
  noStoreHeaders,
  requireObjectIdLike,
  safeErrorMessage,
} from "@/lib/apiResponse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

function parseDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export async function GET(_request: NextRequest, ctx: RouteParams): Promise<Response> {
  const headers = noStoreHeaders();

  try {
    const session = await auth();
    if (!session?.user?.id) return jsonErr("Unauthorized", 401, headers, "UNAUTHORIZED");

    const { id } = await ctx.params;
    if (!id || !requireObjectIdLike(id)) {
      return jsonErr("Invalid id", 400, headers);
    }

    await connectToDatabase();

    const payment = await RentPayment.findOne({ _id: id, ownerId: session.user.id }).lean();

    if (!payment) {
      return jsonErr("Not found", 404, headers);
    }

    return jsonOk(
      { payment: { ...payment, _id: String(payment._id) } },
      200,
      headers,
    );
  } catch (error) {
    console.error("GET /api/rent/[id] error:", safeErrorMessage(error));
    return jsonErr("Unable to load rent payment", 500, headers);
  }
}

export async function PATCH(request: NextRequest, ctx: RouteParams): Promise<Response> {
  const headers = noStoreHeaders();

  try {
    const session = await auth();
    if (!session?.user?.id) return jsonErr("Unauthorized", 401, headers, "UNAUTHORIZED");

    const { id } = await ctx.params;
    if (!id || !requireObjectIdLike(id)) {
      return jsonErr("Invalid id", 400, headers);
    }

    const payload: unknown = await request.json().catch(() => null);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return jsonErr("Invalid JSON", 400, headers);
    }

    const body = payload as Record<string, unknown>;

    // Only allow specific fields to be updated
    const update: Record<string, unknown> = {};

    if ("tenantName" in body) update.tenantName = body.tenantName;
    if ("notes" in body) update.notes = body.notes;
    if ("isPaid" in body) update.isPaid = Boolean(body.isPaid);
    if ("periodMonth" in body) update.periodMonth = body.periodMonth;
    if ("periodYear" in body) update.periodYear = body.periodYear;
    if ("method" in body) update.method = body.method;
    if ("reference" in body) update.reference = body.reference;

    if ("amount" in body) {
      const amountNum = Number(body.amount);
      if (!Number.isFinite(amountNum)) {
        return jsonErr("Invalid amount", 400, headers);
      }
      update.amount = amountNum;
    }

    if ("paymentDate" in body) {
      const d = parseDate(body.paymentDate);
      if (!d) {
        return jsonErr("Invalid payment date", 400, headers);
      }
      update.paymentDate = d;
    }

    if (Object.keys(update).length === 0) {
      return jsonErr("No updates provided", 400, headers);
    }

    await connectToDatabase();

    // Billing enforcement: editing rent payments is Pro-only
    const user = await User.findById(session.user.id).lean().exec();
    if (!user) {
      return jsonErr("Unauthorized", 401, headers, "UNAUTHORIZED");
    }

    try {
      requirePro(toEntitlementsUser(user));
    } catch (e) {
      if (e instanceof EntitlementError) {
        return jsonErr("Pro subscription required", 402, headers, e.code);
      }
      throw e;
    }

    const updated = await RentPayment.findOneAndUpdate(
      { _id: id, ownerId: session.user.id },
      { $set: update },
      { new: true },
    ).lean();

    if (!updated) {
      return jsonErr("Not found", 404, headers);
    }

    return jsonOk(
      { payment: { ...updated, _id: String((updated as { _id: unknown })._id) } },
      200,
      headers,
    );
  } catch (error) {
    console.error("PATCH /api/rent/[id] error:", safeErrorMessage(error));
    return jsonErr("Unable to update rent payment", 500, headers);
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteParams): Promise<Response> {
  const headers = noStoreHeaders();

  try {
    const session = await auth();
    if (!session?.user?.id) return jsonErr("Unauthorized", 401, headers, "UNAUTHORIZED");

    const { id } = await ctx.params;
    if (!id || !requireObjectIdLike(id)) {
      return jsonErr("Invalid id", 400, headers);
    }

    await connectToDatabase();

    // Billing enforcement: deleting rent payments is Pro-only
    const user = await User.findById(session.user.id).lean().exec();
    if (!user) {
      return jsonErr("Unauthorized", 401, headers, "UNAUTHORIZED");
    }

    try {
      requirePro(toEntitlementsUser(user));
    } catch (e) {
      if (e instanceof EntitlementError) {
        return jsonErr("Pro subscription required", 402, headers, e.code);
      }
      throw e;
    }

    const deleted = await RentPayment.findOneAndDelete({ _id: id, ownerId: session.user.id }).lean();

    if (!deleted) {
      return jsonErr("Not found", 404, headers);
    }

    return jsonOk(
      { deleted: true, id },
      200,
      headers,
    );
  } catch (error) {
    console.error("DELETE /api/rent/[id] error:", safeErrorMessage(error));
    return jsonErr("Unable to delete rent payment", 500, headers);
  }
}
