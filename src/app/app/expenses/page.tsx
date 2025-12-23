"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ChangeEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/layout/PageHeader";

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
  const res = await fetch("/api/expenses", { method: "GET" });
  if (!res.ok) {
    throw new Error("Failed to fetch expenses");
  }
  const data = (await res.json()) as { expenses?: RawExpense[] };
  const rawDocs = (data.expenses ?? []) as RawExpense[];

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

    const incurredAtIso = doc.incurredAt
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

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const data = await fetchExpensesForUser();
        if (!isMounted) return;
        setRows(data);
      } catch {
        if (!isMounted) return;
        setError("Unable to load expenses right now.");
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

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
      <div className="space-y-6 p-6">
        <div className="h-6 w-40 rounded bg-slate-900/60" />
        <div className="h-4 w-72 rounded bg-slate-900/60" />
        <div className="h-64 rounded-xl border border-slate-800 bg-slate-950/80" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3 p-6">
        <h1 className="text-base font-semibold text-slate-50">All expenses</h1>
        <p className="text-sm text-red-400">{error}</p>
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
          <div className="px-4 py-8 text-center text-xs text-slate-400">
            No expenses found for the current filter.
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