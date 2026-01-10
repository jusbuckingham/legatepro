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

export async function GET(_request: NextRequest, context: RouteContext): Promise<Response> {
  try {
    const headers = noStoreHeaders();
    const session = await auth();
    if (!session?.user?.id) {
      return jsonUnauthorized();
    }

    const { estateId, paymentId } = await context.params;

    if (!requireObjectIdLike(estateId)) {
      return jsonErr("Invalid estateId", 400, "BAD_REQUEST", { headers });
    }
    if (!requireObjectIdLike(paymentId)) {
      return jsonErr("Invalid paymentId", 400, "BAD_REQUEST", { headers });
    }

    await connectToDatabase();

    const payment = await RentPayment.findOne({
      _id: paymentId,
      estateId,
      ownerId: session.user.id,
    }).lean();

    if (!payment) {
      return jsonNotFound("Payment not found");
    }

    return jsonOk(
      { payment: { ...payment, _id: idToString((payment as { _id?: unknown })._id) } },
      { headers },
    );
  } catch (error) {
    console.error("[GET /api/estates/[estateId]/rent/[paymentId]] Error:", safeErrorMessage(error));
    return jsonErr("Failed to fetch payment", 500, "INTERNAL_ERROR", { headers: noStoreHeaders() });
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
      return jsonErr("Invalid estateId", 400, "BAD_REQUEST", { headers });
    }
    if (!requireObjectIdLike(paymentId)) {
      return jsonErr("Invalid paymentId", 400, "BAD_REQUEST", { headers });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonErr("Invalid JSON", 400, "BAD_REQUEST", { headers });
    }

    const update: Record<string, unknown> = {};
    if ("amount" in body) update.amount = body.amount;
    if ("date" in body) update.date = body.date;
    if ("notes" in body) update.notes = body.notes;
    if ("method" in body) update.method = body.method;
    if ("propertyId" in body) update.propertyId = body.propertyId;

    await connectToDatabase();

    const updated = await RentPayment.findOneAndUpdate(
      {
        _id: paymentId,
        estateId,
        ownerId: session.user.id,
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

    return jsonOk(
      { payment: { ...updated, _id: idToString((updated as { _id?: unknown })._id) } },
      { headers },
    );
  } catch (error) {
    console.error("[PATCH /api/estates/[estateId]/rent/[paymentId]] Error:", safeErrorMessage(error));
    return jsonErr("Failed to update payment", 500, "INTERNAL_ERROR", { headers: noStoreHeaders() });
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
      return jsonErr("Invalid estateId", 400, "BAD_REQUEST", { headers });
    }
    if (!requireObjectIdLike(paymentId)) {
      return jsonErr("Invalid paymentId", 400, "BAD_REQUEST", { headers });
    }

    await connectToDatabase();

    const deleted = await RentPayment.findOneAndDelete({
      _id: paymentId,
      estateId,
      ownerId: session.user.id,
    }).lean();

    if (!deleted) {
      return jsonNotFound("Payment not found");
    }

    return jsonOk({ success: true }, { headers });
  } catch (error) {
    console.error("[DELETE /api/estates/[estateId]/rent/[paymentId]] Error:", safeErrorMessage(error));
    return jsonErr("Failed to delete payment", 500, "INTERNAL_ERROR", { headers: noStoreHeaders() });
  }
}