import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getEstateAccess } from "@/lib/estateAccess";
import { EntitlementError, requireFeature, toEntitlementsUser } from "@/lib/entitlements";
import {
  jsonErr,
  noStoreHeaders,
  safeErrorMessage,
} from "@/lib/apiResponse";
import { User } from "@/models/User";
import { Types } from "mongoose";

import { connectToDatabase } from "@/lib/db";
import { RentPayment } from "@/models/RentPayment";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RentPaymentDoc {
  _id: unknown;
  estateId?: unknown;
  propertyId?: unknown;
  tenantName?: string;
  method?: string;
  amount?: number;
  periodLabel?: string;
  notes?: string;
  receivedDate?: string | Date | undefined;
  createdAt?: string | Date | undefined;
  propertyLabel?: string;
}

function formatDate(value?: string | Date) {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10); // yyyy-mm-dd
}

function csvEscape(value: string) {
  // Wrap in quotes and escape quotes as ""
  const safe = value.replace(/"/g, '""');
  return `"${safe}"`;
}

function buildEstateIdQuery(
  estateId: string
): string | { $in: Array<string | Types.ObjectId> } {
  // Some collections store `estateId` as an ObjectId; some as a string.
  // Accept both without breaking either storage format.
  if (Types.ObjectId.isValid(estateId)) {
    return { $in: [estateId, new Types.ObjectId(estateId)] };
  }
  return estateId;
}

type EstateAccessFlags = { ok?: boolean; canAccess?: boolean };

function getAccessFlag(value: unknown): boolean | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as EstateAccessFlags;
  if (typeof v.ok === "boolean") return v.ok;
  if (typeof v.canAccess === "boolean") return v.canAccess;
  return undefined;
}

export async function GET(request: NextRequest) {
  const headersNoStore = noStoreHeaders();

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return jsonErr("Unauthorized", 401, headersNoStore, "UNAUTHORIZED");
    }


    await connectToDatabase();

    const user = await User.findById(session.user.id).lean().exec();
    if (!user) {
      return jsonErr("User not found", 404, headersNoStore, "NOT_FOUND");
    }

    try {
      requireFeature(
        toEntitlementsUser(user),
        "exports"
      );
    } catch (e) {
      if (e instanceof EntitlementError) {
        return jsonErr("Pro subscription required", 402, headersNoStore, e.code);
      }
      throw e;
    }

    const { searchParams } = new URL(request.url);
    const estateId = searchParams.get("estateId");

    if (!estateId) {
      return jsonErr("Missing estateId", 400, headersNoStore, "BAD_REQUEST");
    }

    // Security: ensure the user can access this estate before exporting data
    const access = await getEstateAccess({ estateId, session });

    // `getEstateAccess` returns an EstateAccess object or null in this codebase.
    // Some callers expose an `ok` or `canAccess` flag; treat missing/false as denied.
    const flag = getAccessFlag(access);
    const denied = !access || flag === false;

    if (denied) {
      return jsonErr("Forbidden", 403, headersNoStore, "FORBIDDEN");
    }

    // Pull all rent payments for this estate
    const docsRaw = await RentPayment.find({ estateId: buildEstateIdQuery(estateId) })
      .sort({ receivedDate: 1, createdAt: 1 })
      .lean<Record<string, unknown>[]>()
      .exec();

    const toNumberIfPossible = (v: unknown): number | undefined => {
      if (typeof v === "number" && !Number.isNaN(v)) return v;
      if (typeof v === "string") {
        const n = Number(v);
        return Number.isNaN(n) ? undefined : n;
      }
      return undefined;
    };

    const toDateOrStringIfPossible = (v: unknown): string | Date | undefined => {
      if (v instanceof Date) return v;
      if (typeof v === "string") return v;
      return undefined;
    };

    const normalizeRentPayment = (raw: Record<string, unknown>): RentPaymentDoc => {
      return {
        _id: raw._id,
        estateId: raw.estateId,
        propertyId: raw.propertyId,
        tenantName: typeof raw.tenantName === "string" ? raw.tenantName : undefined,
        method: typeof raw.method === "string" ? raw.method : undefined,
        amount: toNumberIfPossible(raw.amount),
        periodLabel: typeof raw.periodLabel === "string" ? raw.periodLabel : undefined,
        notes: typeof raw.notes === "string" ? raw.notes : undefined,
        receivedDate: toDateOrStringIfPossible(raw.receivedDate),
        createdAt: toDateOrStringIfPossible(raw.createdAt),
        propertyLabel:
          typeof raw.propertyLabel === "string"
            ? raw.propertyLabel
            : (typeof raw.propertyName === "string" ? raw.propertyName : undefined),
      };
    };

    // Normalize lean results without unsafe casts
    const docs: RentPaymentDoc[] = docsRaw.map(normalizeRentPayment);

    const header = [
      "Date",
      "Period",
      "Tenant",
      "Property",
      "Method",
      "Amount",
      "Notes",
    ];

    const lines = [header.map(csvEscape).join(",")];

    for (const payment of docs) {
      const dateStr =
        formatDate(payment.receivedDate ?? payment.createdAt ?? undefined) || "";
      const period = payment.periodLabel ?? "";
      const tenant = payment.tenantName ?? "";
      const property = payment.propertyLabel ?? "";
      const method = payment.method ?? "";
      const amount =
        payment.amount != null && !Number.isNaN(payment.amount)
          ? payment.amount.toFixed(2)
          : "";
      const notes = payment.notes ?? "";

      const row = [
        dateStr,
        period,
        tenant,
        property,
        method,
        amount,
        notes,
      ].map(csvEscape);

      lines.push(row.join(","));
    }

    const csv = lines.join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        ...headersNoStore,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="estate-${estateId}-rent-ledger.csv"`,
      },
    });
  } catch (error) {
    console.error("GET /api/rent/export error:", safeErrorMessage(error));
    return jsonErr("Failed to export rent ledger", 500, headersNoStore, "INTERNAL_ERROR");
  }
}