import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";

import { connectToDatabase } from "@/lib/db";
import { RentPayment } from "@/models/RentPayment";

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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const estateId = searchParams.get("estateId");

  if (!estateId) {
    return new NextResponse("Missing estateId", { status: 400 });
  }

  await connectToDatabase();

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
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="estate-${estateId}-rent-ledger.csv"`,
    },
  });
}