import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";

import { connectToDatabase, serializeMongoDoc } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getEstateAccess } from "@/lib/estateAccess";
import { RentPayment } from "@/models/RentPayment";

type RouteParams = {
  params: Promise<{
    estateId: string;
  }>;
};

function isValidObjectId(value: string): boolean {
  return Types.ObjectId.isValid(value);
}

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  const userId = session?.user?.id;
  return typeof userId === "string" && userId.length > 0 ? userId : null;
}

async function getEstateId(paramsPromise: RouteParams["params"]): Promise<string> {
  const { estateId } = await paramsPromise;
  return estateId;
}

export async function GET(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const userId = await requireUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();
    const estateId = await getEstateId(params);

    if (!isValidObjectId(estateId)) {
      return NextResponse.json({ ok: false, error: "Invalid estateId" }, { status: 400 });
    }

    const access = await getEstateAccess({ estateId, userId });
    if (!access) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const payments = (await RentPayment.find({ estateId })
      .sort({ paymentDate: -1 })
      .lean()) as unknown[];

    type RentPaymentExportLean = Record<string, unknown> & {
      _id?: unknown;
      estateId?: unknown;
      propertyId?: unknown;
      createdAt?: unknown;
      updatedAt?: unknown;
      paymentDate?: unknown;
      receivedAt?: unknown;
      periodStart?: unknown;
      periodEnd?: unknown;
    };

    const toIsoSafe = (value: unknown): string | null => {
      if (value == null) return null;
      const d = value instanceof Date ? value : new Date(String(value));
      if (Number.isNaN(d.getTime())) return null;
      return d.toISOString();
    };

    const serializeRentPaymentForExport = (doc: RentPaymentExportLean): Record<string, unknown> => {
      const base = serializeMongoDoc(doc) as Record<string, unknown>;

      const rawId = doc._id ?? base.id ?? base._id;
      const estateId = (doc.estateId ?? base.estateId) as unknown;
      const propertyId = (doc.propertyId ?? base.propertyId) as unknown;

      // Normalize common date fields if present.
      const paymentDate = (doc.paymentDate ?? base.paymentDate) as unknown;
      const receivedAt = (doc.receivedAt ?? base.receivedAt) as unknown;
      const periodStart = (doc.periodStart ?? base.periodStart) as unknown;
      const periodEnd = (doc.periodEnd ?? base.periodEnd) as unknown;
      const createdAt = (doc.createdAt ?? base.createdAt) as unknown;
      const updatedAt = (doc.updatedAt ?? base.updatedAt) as unknown;

      return {
        ...base,
        // keep compatibility with any existing export consumers
        _id: rawId != null ? String(rawId) : "",
        id: rawId != null ? String(rawId) : undefined,
        estateId: estateId != null ? String(estateId) : null,
        propertyId: propertyId != null ? String(propertyId) : null,
        paymentDate: toIsoSafe(paymentDate),
        receivedAt: toIsoSafe(receivedAt),
        periodStart: toIsoSafe(periodStart),
        periodEnd: toIsoSafe(periodEnd),
        createdAt: toIsoSafe(createdAt),
        updatedAt: toIsoSafe(updatedAt),
      };
    };

    const exportRows = payments.map((p) => serializeRentPaymentForExport(p as unknown as RentPaymentExportLean));

    return NextResponse.json(
      { ok: true, data: { payments: exportRows } },
      { status: 200 }
    );
  } catch (error) {
    console.error("[RENT_EXPORT_GET_ERROR]", error);
    return NextResponse.json(
      { ok: false, error: "Failed to export rent payments" },
      { status: 500 }
    );
  }
}