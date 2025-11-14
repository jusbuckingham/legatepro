// src/app/app/estates/[estateId]/rent/page.tsx

import Link from "next/link";
import { connectToDatabase } from "../../../../../lib/db";
import { RentPayment } from "../../../../../models/RentPayment";
import { EstateProperty } from "../../../../../models/EstateProperty";

export const dynamic = "force-dynamic";

interface PageProps {
  params: {
    estateId: string;
  };
}

interface RentPaymentRow {
  id: string;
  estateId: string;
  propertyLabel?: string;
  payerName?: string;
  method?: string;
  amount?: number;
  currency?: string;
  datePaid?: string;
  periodStart?: string;
  periodEnd?: string;
}

interface RentPaymentLean {
  _id?: { toString(): string };
  estateId?: { toString(): string } | string;
  propertyId?: { toString(): string };
  payerName?: string;
  method?: string;
  amount?: number;
  currency?: string;
  datePaid?: string | Date;
  periodStart?: string | Date;
  periodEnd?: string | Date;
}

interface EstatePropertyLean {
  _id: { toString(): string };
  label?: string;
}

function formatCurrency(amount?: number, currency = "USD"): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function formatDate(value?: string | Date | null): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

async function getRentLedger(estateId: string): Promise<RentPaymentRow[]> {
  await connectToDatabase();

  const rawPayments = (await RentPayment.find({ estateId })
    .sort({ datePaid: -1, createdAt: -1 })
    .lean()
    .exec()) as RentPaymentLean[];

  if (!rawPayments || rawPayments.length === 0) {
    return [];
  }

  const propertyIds = Array.from(
    new Set(
      rawPayments
        .map((p) => p.propertyId)
        .filter((id): id is { toString(): string } => Boolean(id))
        .map((id) => id.toString())
    )
  );

  let propertyLabelById = new Map<string, string>();

  if (propertyIds.length > 0) {
    const properties = (await EstateProperty.find({ _id: { $in: propertyIds } })
      .select({ _id: 1, label: 1 })
      .lean()
      .exec()) as EstatePropertyLean[];

    propertyLabelById = new Map(
      properties.map((p) => [p._id.toString(), p.label ?? "Property"])
    );
  }

  return rawPayments.map((p) => ({
    id: p._id?.toString() ?? "",
    estateId:
      typeof p.estateId === "string"
        ? p.estateId
        : p.estateId?.toString() ?? estateId,
    propertyLabel: p.propertyId
      ? propertyLabelById.get(p.propertyId.toString())
      : undefined,
    payerName: p.payerName,
    method: p.method,
    amount: p.amount,
    currency: p.currency ?? "USD",
    datePaid: p.datePaid ? new Date(p.datePaid).toISOString() : undefined,
    periodStart: p.periodStart
      ? new Date(p.periodStart).toISOString()
      : undefined,
    periodEnd: p.periodEnd ? new Date(p.periodEnd).toISOString() : undefined,
  }));
}

export default async function EstateRentLedgerPage({ params }: PageProps) {
  const { estateId } = params;
  const payments = await getRentLedger(estateId);

  const totalCollected = payments.reduce(
    (sum, p) => sum + (p.amount ?? 0),
    0
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
            Rent ledger
          </h1>
          <p className="text-sm text-slate-400">
            Track every dollar of rent the estate has collected. You can attach
            each payment to a property and export a ledger for the court or your
            accountant.
          </p>
        </div>

        <div className="flex flex-col items-end gap-1 text-right">
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Total collected
          </p>
          <p className="text-lg font-semibold text-rose-100">
            {formatCurrency(totalCollected, "USD")}
          </p>
          <Link
            href={`/api/rent/export?estateId=${estateId}`}
            prefetch={false}
            className="mt-2 inline-flex items-center rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-xs font-medium text-slate-100 hover:border-rose-500/70 hover:text-rose-50"
          >
            Export rent ledger (CSV)
          </Link>
        </div>
      </header>

      <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60">
        <div className="border-b border-slate-800 px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-400">
          Payments
        </div>
        {payments.length === 0 ? (
          <div className="px-4 py-6 text-sm text-slate-400">
            No rent payments recorded yet. When you add payments from a property
            page, they&apos;ll show up here automatically.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-800 text-sm">
              <thead className="bg-slate-950/80">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                    Date
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                    Payer
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                    Property
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-slate-400">
                    Amount
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                    Method
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                    Period
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-slate-400">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/60">
                {payments.map((p) => {
                  const paidLabel = formatDate(p.datePaid);
                  const periodLabel =
                    p.periodStart || p.periodEnd
                      ? `${formatDate(p.periodStart)} → ${formatDate(
                          p.periodEnd
                        )}`
                      : "Not set";

                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-900/60 transition-colors"
                    >
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-300">
                        {paidLabel}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-200">
                        {p.payerName || (
                          <span className="text-slate-500">Unlabeled</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-200">
                        {p.propertyLabel || (
                          <span className="text-slate-500">Not linked</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right text-xs font-medium text-slate-100">
                        <Link
                          href={`/app/estates/${estateId}/rent/${p.id}`}
                          className="text-rose-200 hover:text-rose-100"
                        >
                          {formatCurrency(p.amount, p.currency)}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-200">
                        {p.method || (
                          <span className="text-slate-500">Not set</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-200">
                        {periodLabel}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right text-xs">
                        <Link
                          href={`/app/estates/${estateId}/rent/${p.id}`}
                          className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/60 px-2 py-1 text-[11px] font-medium text-slate-100 hover:border-rose-500/70 hover:text-rose-50"
                        >
                          View / edit
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}