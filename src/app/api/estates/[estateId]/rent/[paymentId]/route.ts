import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { RentPayment } from "@/models/RentPayment";
import {
  jsonErr,
  jsonNotFound,
  jsonOk,
  jsonUnauthorized,
  noStoreHeaders,
  requireObjectIdLike,
  safeErrorMessage,
} from "@/lib/apiResponse";

import { requireEstateAccess, requireEstateEditAccess } from "@/lib/estateAccess";
import { logEstateEvent } from "@/lib/estateEvents";

type RouteParams = {
  estateId: string;
  paymentId: string;
};

type RouteContext = {
  params: Promise<RouteParams>;
};

function idToString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "toString" in value) {
    return String((value as { toString: () => string }).toString());
  }
  return "";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function GET(_request: NextRequest, context: RouteContext): Promise<Response> {
  try {
    const headers = noStoreHeaders();
    const session = await auth();
    if (!session?.user?.id) {
      return jsonUnauthorized();
    }

    const { estateId, paymentId } = await context.params;

    if (!requireObjectIdLike(estateId)) {
      return jsonErr("Invalid estateId", 400, headers);
    }
    if (!requireObjectIdLike(paymentId)) {
      return jsonErr("Invalid paymentId", 400, headers);
    }

    await connectToDatabase();
    await requireEstateAccess({ estateId, userId: session.user.id });

    const payment = await RentPayment.findOne({
      _id: paymentId,
      estateId,
    }).lean();

    if (!payment) {
      return jsonNotFound("Payment not found");
    }

    return jsonOk(
      { payment: { ...payment, _id: idToString((payment as { _id?: unknown })._id) } },
      200,
      headers,
    );
  } catch (error) {
    console.error("[GET /api/estates/[estateId]/rent/[paymentId]] Error:", safeErrorMessage(error));
    return jsonErr("Failed to fetch payment", 500, noStoreHeaders());
  }
}

export async function PATCH(request: NextRequest, context: RouteContext): Promise<Response> {
  try {
    const headers = noStoreHeaders();
    const session = await auth();
    if (!session?.user?.id) {
      return jsonUnauthorized();
    }

    const { estateId, paymentId } = await context.params;

    if (!requireObjectIdLike(estateId)) {
      return jsonErr("Invalid estateId", 400, headers);
    }
    if (!requireObjectIdLike(paymentId)) {
      return jsonErr("Invalid paymentId", 400, headers);
    }
    const raw = await request.json().catch(() => null);
    if (!isPlainObject(raw)) {
      return jsonErr("Invalid JSON", 400, headers);
    }

    const update: Record<string, unknown> = {};

    if ("amount" in raw) {
      const n = Number((raw as Record<string, unknown>).amount);
      if (Number.isFinite(n) && n >= 0) update.amount = n;
    }

    if ("date" in raw) {
      const v = (raw as Record<string, unknown>).date;
      if (typeof v === "string" || v instanceof Date) {
        const d = new Date(v);
        if (!Number.isNaN(d.getTime())) update.date = d;
      }
    }

    if ("notes" in raw) {
      const v = (raw as Record<string, unknown>).notes;
      if (typeof v === "string") update.notes = v.trim();
    }

    if ("method" in raw) {
      const v = (raw as Record<string, unknown>).method;
      if (typeof v === "string") update.method = v.trim();
    }

    if ("propertyId" in raw) {
      const v = (raw as Record<string, unknown>).propertyId;
      if (v === null) {
        update.propertyId = null;
      } else if (typeof v === "string" && requireObjectIdLike(v)) {
        update.propertyId = v;
      }
    }

    if (Object.keys(update).length === 0) {
      return jsonErr("No valid fields provided", 400, headers);
    }

    await connectToDatabase();
    await requireEstateEditAccess({ estateId, userId: session.user.id });

    const updated = await RentPayment.findOneAndUpdate(
      {
        _id: paymentId,
        estateId,
      },
      update,
      {
        new: true,
        runValidators: true,
      }
    ).lean();

    if (!updated) {
      return jsonNotFound("Payment not found");
    }

    try {
      await logEstateEvent({
        ownerId: session.user.id,
        estateId,
        type: "RENT_PAYMENT_UPDATED",
        summary: "Rent payment updated",
        detail: `Updated rent payment ${paymentId}`,
        meta: {
          paymentId,
          updatedFields: Object.keys(update),
          actorId: session.user.id,
        },
      });
    } catch (e) {
      console.warn(
        "[PATCH /api/estates/[estateId]/rent/[paymentId]] Failed to log event:",
        e
      );
    }

    return jsonOk(
      { payment: { ...updated, _id: idToString((updated as { _id?: unknown })._id) } },
      200,
      headers,
    );
  } catch (error) {
    console.error("[PATCH /api/estates/[estateId]/rent/[paymentId]] Error:", safeErrorMessage(error));
    return jsonErr("Failed to update payment", 500, noStoreHeaders());
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext): Promise<Response> {
  try {
    const headers = noStoreHeaders();
    const session = await auth();
    if (!session?.user?.id) {
      return jsonUnauthorized();
    }

    const { estateId, paymentId } = await context.params;

    if (!requireObjectIdLike(estateId)) {
      return jsonErr("Invalid estateId", 400, headers);
    }
    if (!requireObjectIdLike(paymentId)) {
      return jsonErr("Invalid paymentId", 400, headers);
    }

    await connectToDatabase();
    await requireEstateEditAccess({ estateId, userId: session.user.id });

    const deleted = await RentPayment.findOneAndDelete({
      _id: paymentId,
      estateId,
    }).lean();

    if (!deleted) {
      return jsonNotFound("Payment not found");
    }

    try {
      await logEstateEvent({
        ownerId: session.user.id,
        estateId,
        type: "RENT_PAYMENT_DELETED",
        summary: "Rent payment deleted",
        detail: `Deleted rent payment ${paymentId}`,
        meta: {
          paymentId,
          actorId: session.user.id,
        },
      });
    } catch (e) {
      console.warn(
        "[DELETE /api/estates/[estateId]/rent/[paymentId]] Failed to log event:",
        e
      );
    }

    return jsonOk({ success: true }, 200, headers);
  } catch (error) {
    console.error("[DELETE /api/estates/[estateId]/rent/[paymentId]] Error:", safeErrorMessage(error));
    return jsonErr("Failed to delete payment", 500, noStoreHeaders());
  }
}