// src/app/app/rent/page.tsx

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

import { connectToDatabase } from "@/lib/db";
import { RentPayment } from "@/models/RentPayment";
import { Estate } from "@/models/Estate";

type RentRow = {
  _id: string;
  estateId: string | null;
  amount: number;
  tenantName: string;
  periodMonth: number | null;
  periodYear: number | null;
  paymentDate: string; // ISO string for formatting
  method?: string;
  createdAt?: string;
};

type RentByMonth = {
  monthKey: string; // e.g. "2025-02"
  label: string; // e.g. "Feb 2025"
  total: number;
  count: number;
};

type RentByEstate = {
  estateId: string;
  estateLabel: string;
  total: number;
  count: number;
};

function formatCurrency(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string | Date | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function buildMonthKey(d: Date): { key: string; label: string } {
  const year = d.getFullYear();
  const month = d.getMonth(); // 0-based
  const key = `${year}-${String(month + 1).padStart(2, "0")}`;

  const label = d.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });

  return { key, label };
}

export const metadata = {
  title: "Rent Overview | LegatePro",
  description:
    "Global view of rent payments, cash flow, and collection performance across all estates.",
};

export default async function GlobalRentPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const ownerId = session.user.id;

  await connectToDatabase();

  // Fetch all rent payments + estates for this user
  const [rawPayments, rawEstates] = await Promise.all([
    RentPayment.find({ ownerId }).sort({ paymentDate: -1 }).lean(),
    Estate.find({ ownerId }).lean(),
  ]);

  const estatesById = new Map<string, string>();

  (rawEstates as Record<string, unknown>[]).forEach((doc) => {
    const id = String(doc._id as string);
    const displayName = (doc as Record<string, unknown>).displayName as
      | string
      | undefined;
    const caseName = (doc as Record<string, unknown>).caseName as
      | string
      | undefined;
    const decedentName = (doc as Record<string, unknown>).decedentName as
      | string
      | undefined;

    const label =
      displayName ??
      caseName ??
      (decedentName ? `${decedentName} estate` : "Untitled estate");

    estatesById.set(id, label);
  });

  const payments: RentRow[] = (rawPayments as Record<string, unknown>[]).map(
    (doc) => {
      const paymentDateRaw =
        (doc.paymentDate as string | Date | undefined) ?? doc.createdAt;

      const paymentDate =
        typeof paymentDateRaw === "string"
          ? paymentDateRaw
          : paymentDateRaw instanceof Date
          ? paymentDateRaw.toISOString()
          : new Date().toISOString();

      return {
        _id: String(doc._id as string),
        estateId: doc.estateId ? String(doc.estateId as string) : null,
        amount: Number(doc.amount ?? 0),
        tenantName: (doc.tenantName as string) ?? "Unknown tenant",
        periodMonth:
          (doc.periodMonth as number | undefined) ??
          (paymentDate ? new Date(paymentDate).getMonth() + 1 : null),
        periodYear:
          (doc.periodYear as number | undefined) ??
          (paymentDate ? new Date(paymentDate).getFullYear() : null),
        paymentDate,
        method: (doc.method as string | undefined) ?? undefined,
        createdAt:
          doc.createdAt instanceof Date
            ? doc.createdAt.toISOString()
            : undefined,
      };
    }
  );

  const totalCollected = payments.reduce(
    (sum, p) => sum + (Number.isFinite(p.amount) ? p.amount : 0),
    0
  );

  const mostRecentPayment = payments[0];

  // Group by month
  const monthMap = new Map<string, RentByMonth>();

  payments.forEach((p) => {
    const baseDate = new Date(p.paymentDate);
    const { key, label } = buildMonthKey(baseDate);

    const existing = monthMap.get(key);
    if (existing) {
      existing.total += p.amount;
      existing.count += 1;
    } else {
      monthMap.set(key, {
        monthKey: key,
        label,
        total: p.amount,
        count: 1,
      });
    }
  });

  const monthRows = Array.from(monthMap.values()).sort((a, b) =>
    a.monthKey < b.monthKey ? 1 : -1
  );

  // Group by estate
  const estateMap = new Map<string, RentByEstate>();

  payments.forEach((p) => {
    if (!p.estateId) return;
    const existing = estateMap.get(p.estateId);
    const estateLabel = estatesById.get(p.estateId) ?? "Unknown estate";

    if (existing) {
      existing.total += p.amount;
      existing.count += 1;
    } else {
      estateMap.set(p.estateId, {
        estateId: p.estateId,
        estateLabel,
        total: p.amount,
        count: 1,
      });
    }
  });

  const estateRows = Array.from(estateMap.values()).sort(
    (a, b) => b.total - a.total
  );

  const recentPayments = payments.slice(0, 20);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
            Rent Overview
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Global view of rent across all estates. Track cash flow, tenants,
            and collection performance in one place.
          </p>
        </div>

        <Link
          href="/app/estates"
          className="inline-flex items-center rounded-lg border border-rose-900/60 bg-rose-950/40 px-3 py-1.5 text-xs font-medium text-rose-100 shadow-sm shadow-rose-950/60 transition hover:border-rose-500 hover:bg-rose-900/60"
        >
          Go to Estates
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Total Rent Collected
          </p>
          <p className="mt-2 text-2xl font-semibold text-emerald-300">
            {formatCurrency(totalCollected)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Across {estateRows.length || 0} estate
            {estateRows.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Total Payments
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-100">
            {payments.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Most recent:{" "}
            {mostRecentPayment
              ? formatDate(mostRecentPayment.paymentDate)
              : "—"}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Top Month
          </p>
          {monthRows.length > 0 ? (
            <>
              <p className="mt-2 text-lg font-semibold text-slate-100">
                {monthRows[0].label}
              </p>
              <p className="mt-1 text-sm text-emerald-300">
                {formatCurrency(monthRows[0].total)}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No rent recorded yet.</p>
          )}
        </div>
      </div>

      {/* Rent by month */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-100">
              Rent by Month
            </h2>
            <span className="text-xs text-slate-500">
              Last {monthRows.length} month
              {monthRows.length === 1 ? "" : "s"}
            </span>
          </div>

          {monthRows.length === 0 ? (
            <p className="text-xs text-slate-500">
              No rent payments logged yet.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-900/80 bg-slate-950/80">
              <table className="min-w-full divide-y divide-slate-800 text-xs">
                <thead className="bg-slate-950/80">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-slate-400">
                      Month
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-slate-400">
                      Total Collected
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-slate-400">
                      Payments
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/80">
                  {monthRows.map((m) => (
                    <tr key={m.monthKey}>
                      <td className="px-3 py-2 text-slate-100">{m.label}</td>
                      <td className="px-3 py-2 text-right text-emerald-300">
                        {formatCurrency(m.total)}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-300">
                        {m.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Rent by estate */}
        <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-100">
              Rent by Estate
            </h2>
            <span className="text-xs text-slate-500">
              {estateRows.length} estate
              {estateRows.length === 1 ? "" : "s"}
            </span>
          </div>

          {estateRows.length === 0 ? (
            <p className="text-xs text-slate-500">
              No rent linked to any estate yet.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-900/80 bg-slate-950/80">
              <table className="min-w-full divide-y divide-slate-800 text-xs">
                <thead className="bg-slate-950/80">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-slate-400">
                      Estate
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-slate-400">
                      Total
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-slate-400">
                      Payments
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/80">
                  {estateRows.map((row) => (
                    <tr key={row.estateId}>
                      <td className="px-3 py-2">
                        <Link
                          href={`/app/estates/${row.estateId}/rent`}
                          className="text-xs font-medium text-rose-200 hover:text-rose-100 hover:underline"
                        >
                          {row.estateLabel}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right text-emerald-300">
                        {formatCurrency(row.total)}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-300">
                        {row.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Recent payments table */}
      <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-100">
            Recent Rent Payments
          </h2>
          <span className="text-xs text-slate-500">
            Showing {recentPayments.length} most recent
          </span>
        </div>

        {recentPayments.length === 0 ? (
          <p className="text-xs text-slate-500">
            No payments recorded yet. Start by adding rent from an estate&apos;s
            Rent ledger.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <div className="inline-block min-w-full align-middle">
              <div className="overflow-hidden rounded-xl border border-slate-900/80 bg-slate-950/80">
                <table className="min-w-full divide-y divide-slate-800 text-xs">
                  <thead className="bg-slate-950/80">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-slate-400">
                        Tenant
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-slate-400">
                        Estate
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-slate-400">
                        Period
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-slate-400">
                        Amount
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-slate-400">
                        Paid
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-slate-400">
                        Method
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-slate-400">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/80">
                    {recentPayments.map((p) => {
                      const estateLabel =
                        (p.estateId && estatesById.get(p.estateId)) ??
                        "—";

                      const period =
                        p.periodMonth && p.periodYear
                          ? `${String(p.periodMonth).padStart(
                              2,
                              "0"
                            )}/${p.periodYear}`
                          : "—";

                      return (
                        <tr key={p._id}>
                          <td className="px-3 py-2 text-slate-100">
                            {p.tenantName}
                          </td>
                          <td className="px-3 py-2 text-slate-200">
                            {p.estateId ? (
                              <Link
                                href={`/app/estates/${p.estateId}`}
                                className="hover:text-rose-200 hover:underline"
                              >
                                {estateLabel}
                              </Link>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-300">
                            {period}
                          </td>
                          <td className="px-3 py-2 text-right text-emerald-300">
                            {formatCurrency(p.amount)}
                          </td>
                          <td className="px-3 py-2 text-slate-300">
                            {formatDate(p.paymentDate)}
                          </td>
                          <td className="px-3 py-2 text-slate-300">
                            {p.method || "—"}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {p.estateId ? (
                              <Link
                                href={`/app/estates/${p.estateId}/rent/${p._id}`}
                                className="rounded-lg border border-slate-700 px-2 py-1 text-[11px] font-medium text-slate-100 hover:border-rose-500 hover:bg-rose-950/50"
                              >
                                View
                              </Link>
                            ) : (
                              <span className="text-slate-500 text-[11px]">
                                —
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}