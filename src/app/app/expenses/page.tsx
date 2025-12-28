"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ChangeEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/layout/PageHeader";
import { getApiErrorMessage, safeJson } from "@/lib/utils";

// This page is a hybrid client/server page: we fetch data via a server helper
// and then do light-weight filtering client-side.

interface RawEstate {
  _id: string | { toString(): string };
  caseName?: string | null;
  county?: string | null;
  state?: string | null;
}

interface RawExpense {
  _id: string | { toString(): string };
  estateId?: string | RawEstate | { _id: string | { toString(): string } };
  amount?: number | null; // legacy field (dollars or cents depending on history)
  amountCents?: number | null; // normalized cents field in the new schema
  category?: string | null;
  description?: string | null;
  payee?: string | null;
  date?: Date | string | null;
  incurredAt?: Date | string | null;
}

export interface NormalizedExpenseRow {
  id: string;
  estateId?: string;
  estateLabel: string;
  amount: number; // always in dollars for display
  category: string;
  description?: string;
  payee?: string;
  incurredAt?: string;
}

function normalizeObjectId(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (typeof (value as { toString: () => string }).toString === "function") {
    return (value as { toString: () => string }).toString();
  }
  return undefined;
}

function normalizeAmountToDollars(doc: RawExpense): number {
  // Prefer the new cents field if present
  if (typeof doc.amountCents === "number" && Number.isFinite(doc.amountCents)) {
    return doc.amountCents / 100;
  }

  // Fallback to legacy `amount` field. This may be stored either in
  // dollars or cents depending on history, so use a heuristic similar
  // to the invoice logic.
  if (typeof doc.amount === "number" && Number.isFinite(doc.amount)) {
    const raw = doc.amount;
    // If it looks very large, treat as cents; otherwise treat as dollars.
    if (raw > 10_000) {
      return Math.round(raw) / 100;
    }
    return raw;
  }

  return 0;
}

async function fetchExpensesForUser(): Promise<NormalizedExpenseRow[]> {
  const res = await fetch("/api/expenses", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    const msg = await getApiErrorMessage(res);
    throw new Error(msg || "Failed to fetch expenses");
  }

  const data = (await safeJson(res)) as
    | { ok?: boolean; expenses?: RawExpense[] }
    | { expenses?: RawExpense[] }
    | RawExpense[]
    | null;

  const rawDocs = Array.isArray(data)
    ? (data as RawExpense[])
    : ((data?.expenses ?? []) as RawExpense[]);

  return rawDocs.map((doc) => {
    const id = normalizeObjectId(doc._id) ?? "";

    let estateId: string | undefined;
    let estateLabel = "Unassigned estate";

    if (doc.estateId && typeof doc.estateId === "object") {
      const estate = doc.estateId as RawEstate & {
        _id?: string | { toString(): string };
      };
      estateId = normalizeObjectId(estate._id);
      if (estate.caseName) {
        estateLabel = estate.caseName;
      } else if (estate.county || estate.state) {
        const locationParts = [estate.county, estate.state].filter(Boolean);
        estateLabel = locationParts.join(", ") || estateLabel;
      }
    } else {
      estateId = normalizeObjectId(doc.estateId);
    }

    const incurredAtIso = doc.date
      ? new Date(doc.date).toISOString()
      : doc.incurredAt
        ? new Date(doc.incurredAt).toISOString()
        : undefined;

    const amountDollars = normalizeAmountToDollars(doc);

    return {
      id,
      estateId,
      estateLabel,
      amount: amountDollars,
      category: doc.category ?? "UNCATEGORIZED",
      description: doc.description ?? undefined,
      payee: doc.payee ?? undefined,
      incurredAt: incurredAtIso,
    } satisfies NormalizedExpenseRow;
  });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function GlobalExpensesPage() {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<NormalizedExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchExpensesForUser();
      setRows(data);
    } catch {
      setError("Unable to load expenses right now.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = useMemo(() => {
    const categoryParam = searchParams?.get("category");
    const activeCategory =
      categoryFilter === "all" ? categoryParam : categoryFilter;

    if (!activeCategory || activeCategory === "all") return rows;

    return rows.filter((row) => row.category === activeCategory);
  }, [rows, categoryFilter, searchParams]);

  const totalSpent = useMemo(
    () => filteredRows.reduce((sum, row) => sum + (row.amount ?? 0), 0),
    [filteredRows],
  );

  const handleCategoryChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setCategoryFilter(event.target.value);
  };

  if (loading) {
    return (
      <div className="space-y-8 p-6">
        <div className="space-y-3">
          <div className="h-6 w-44 rounded bg-slate-900/60" />
          <div className="h-4 w-80 rounded bg-slate-900/60" />
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/80">
          <div className="grid grid-cols-12 border-b border-slate-800 bg-slate-900/60 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
            <div className="col-span-2">Date</div>
            <div className="col-span-3">Estate</div>
            <div className="col-span-2">Category</div>
            <div className="col-span-2">Payee</div>
            <div className="col-span-2 text-right">Amount</div>
            <div className="col-span-1 text-right">Edit</div>
          </div>

          <ul className="divide-y divide-slate-800">
            {Array.from({ length: 8 }).map((_, idx) => (
              <li key={idx} className="grid grid-cols-12 items-center px-4 py-3">
                <div className="col-span-2">
                  <div className="h-3 w-20 rounded bg-slate-900/60" />
                </div>
                <div className="col-span-3">
                  <div className="h-3 w-40 rounded bg-slate-900/60" />
                </div>
                <div className="col-span-2">
                  <div className="h-3 w-24 rounded bg-slate-900/60" />
                </div>
                <div className="col-span-2">
                  <div className="h-3 w-28 rounded bg-slate-900/60" />
                </div>
                <div className="col-span-2 flex justify-end">
                  <div className="h-3 w-16 rounded bg-slate-900/60" />
                </div>
                <div className="col-span-1 flex justify-end">
                  <div className="h-3 w-8 rounded bg-slate-900/60" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4 p-6">
        <div>
          <h1 className="text-base font-semibold text-slate-50">All expenses</h1>
          <p className="mt-1 text-xs text-slate-400">Cross-estate view of every expense you’ve logged.</p>
        </div>

        <div className="rounded-xl border border-red-900/40 bg-red-950/40 p-4">
          <div className="text-sm font-semibold text-red-200">Couldn’t load expenses</div>
          <div className="mt-1 text-xs text-red-200/80">{error}</div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center justify-center rounded-md bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-white"
            >
              Retry
            </button>
            <Link
              href="/app/estates"
              className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-900"
            >
              Back to estates
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6">
      <PageHeader
        eyebrow="Overview"
        title="All expenses"
        description="Cross-estate view of every expense you’ve logged."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-3">
            <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-4 py-2">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">
                Total (filtered)
              </div>
              <div className="font-semibold text-slate-50">
                {formatCurrency(totalSpent)}
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
              <label
                htmlFor="category-filter"
                className="text-[11px] text-slate-400"
              >
                Category
              </label>
              <select
                id="category-filter"
                value={categoryFilter}
                onChange={handleCategoryChange}
                className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-rose-500"
              >
                <option value="all">All</option>
                <option value="REPAIRS_MAINTENANCE">
                  Repairs &amp; Maintenance
                </option>
                <option value="PROPERTY_TAXES">Property taxes</option>
                <option value="INSURANCE">Insurance</option>
                <option value="UTILITIES">Utilities</option>
                <option value="LEGAL_FEES">Legal fees</option>
                <option value="ADMINISTRATIVE">Administrative</option>
                <option value="TRAVEL">Travel</option>
                <option value="PROFESSIONAL_FEES">Professional fees</option>
                <option value="MORTGAGE">Mortgage</option>
                <option value="MISCELLANEOUS">Miscellaneous</option>
              </select>
            </div>
          </div>
        }
      />

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/80">
        <div className="grid grid-cols-12 border-b border-slate-800 bg-slate-900/60 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
          <div className="col-span-2">Date</div>
          <div className="col-span-3">Estate</div>
          <div className="col-span-2">Category</div>
          <div className="col-span-2">Payee</div>
          <div className="col-span-2 text-right">Amount</div>
          <div className="col-span-1 text-right">Edit</div>
        </div>

        {filteredRows.length === 0 ? (
          <div className="px-4 py-10">
            <div className="mx-auto max-w-md text-center">
              <div className="text-sm font-semibold text-slate-100">No expenses yet</div>
              <div className="mt-1 text-xs text-slate-400">
                Track probate costs, repairs, travel, filing fees, and anything you’ll want to reimburse or report.
              </div>

              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Link
                  href="/app/expenses/new"
                  className="inline-flex items-center justify-center rounded-md bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-400"
                >
                  Add an expense
                </Link>
                <Link
                  href="/app/estates"
                  className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-900"
                >
                  Go to an estate
                </Link>
                <button
                  type="button"
                  onClick={() => setCategoryFilter("all")}
                  className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-900"
                >
                  Clear filters
                </button>
              </div>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-slate-800 text-xs">
            {filteredRows.map((row) => (
              <li
                key={row.id}
                className="grid grid-cols-12 items-center px-4 py-2 hover:bg-slate-900/60"
              >
                <div className="col-span-2 text-slate-200">
                  {formatDate(row.incurredAt)}
                </div>
                <div className="col-span-3 text-slate-100">
                  {row.estateId ? (
                    <Link
                      href={`/app/estates/${row.estateId}`}
                      className="truncate text-[11px] font-medium text-rose-300 hover:text-rose-200"
                    >
                      {row.estateLabel}
                    </Link>
                  ) : (
                    <span className="truncate text-[11px] text-slate-300">
                      {row.estateLabel}
                    </span>
                  )}
                </div>
                <div className="col-span-2 text-slate-200">{row.category}</div>
                <div className="col-span-2 text-slate-300">
                  {row.payee ?? "—"}
                </div>
                <div className="col-span-2 text-right font-medium text-slate-50">
                  {formatCurrency(row.amount)}
                </div>
                <div className="col-span-1 text-right">
                  <Link
                    href={`/app/expenses/${row.id}/edit`}
                    className="text-[11px] font-medium text-rose-300 hover:text-rose-100"
                  >
                    Edit
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}