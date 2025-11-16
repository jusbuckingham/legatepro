"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { cn } from "@/lib/utils";

type Category =
  | "TAXES"
  | "INSURANCE"
  | "MAINTENANCE"
  | "UTILITIES"
  | "LEGAL"
  | "FUNERAL"
  | "MORTGAGE"
  | "OTHER";

interface ExpenseItem {
  _id: string;
  estateId: string;
  date: string;
  category: Category;
  description: string;
  amount: number;
  isPaid: boolean;
  payee?: string;
  notes?: string;
  propertyId?: string;
}

interface ApiResponse {
  expenses: ExpenseItem[];
}

function formatCurrency(value: number) {
  if (Number.isNaN(value)) return "$0.00";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const CATEGORY_LABELS: Record<Category, string> = {
  TAXES: "Taxes",
  INSURANCE: "Insurance",
  MAINTENANCE: "Maintenance",
  UTILITIES: "Utilities",
  LEGAL: "Legal & Professional",
  FUNERAL: "Funeral",
  MORTGAGE: "Mortgage",
  OTHER: "Other",
};

export default function EstateExpensesPage() {
  const params = useParams<{ estateId: string }>();
  const estateId = params.estateId;

  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const total = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  useEffect(() => {
    if (!estateId) return;

    const loadExpenses = async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/expenses?estateId=${encodeURIComponent(estateId)}`
        );

        if (!res.ok) {
          throw new Error(`Failed to load expenses (${res.status})`);
        }

        const data = (await res.json()) as ApiResponse;
        setExpenses(data.expenses || []);
      } catch (err) {
        console.error("Failed to load expenses", err);
        setError("We couldn’t load expenses right now. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    void loadExpenses();
  }, [estateId]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 justify-between sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Estate expenses
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Track every dollar that goes out of the estate — ready for court,
            beneficiaries, and your accountant.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="inline-flex items-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Export CSV
          </button>
          <Link
            href={`/app/estates/${estateId}/expenses/new`}
            className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            + Add expense
          </Link>
        </div>
      </div>

      {/* Summary card */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Total expenses
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {formatCurrency(total)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Includes all transactions recorded for this estate.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Number of entries
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {expenses.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            You can always add more as you pay new bills.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Status
          </p>
          <p className="mt-2 text-sm text-slate-700">
            Keep receipts and invoices handy for every line item.
          </p>
        </div>
      </div>

      {/* Table / state */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-medium text-slate-700">
            Expense ledger
          </h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center px-4 py-10 text-sm text-slate-500">
            Loading expenses…
          </div>
        ) : error ? (
          <div className="px-4 py-8 text-sm text-red-600">{error}</div>
        ) : expenses.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-slate-500">
            No expenses recorded yet. Start by adding the first bill you
            paid from the estate.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Category</th>
                  <th className="px-4 py-2">Description</th>
                  <th className="px-4 py-2">Payee</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2 text-right">Status</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense) => (
                  <tr
                    key={expense._id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60"
                  >
                    <td className="px-4 py-2 text-xs text-slate-600">
                      {formatDate(expense.date)}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-600">
                      {CATEGORY_LABELS[expense.category] ??
                        expense.category ??
                        "Other"}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-700">
                      {expense.description}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-600">
                      {expense.payee || "—"}
                    </td>
                    <td className="px-4 py-2 text-right text-xs font-medium text-slate-900">
                      {formatCurrency(expense.amount)}
                    </td>
                    <td className="px-4 py-2 text-right text-xs">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                          expense.isPaid
                            ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                            : "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
                        )}
                      >
                        <span
                          className={cn(
                            "mr-1 inline-block h-1.5 w-1.5 rounded-full",
                            expense.isPaid ? "bg-emerald-500" : "bg-amber-500",
                          )}
                        />
                        {expense.isPaid ? "Paid" : "Outstanding"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-xs">
                      <Link
                        href={`/app/estates/${estateId}/expenses/${expense._id}`}
                        className="text-emerald-700 hover:text-emerald-800"
                      >
                        View / Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 text-xs text-slate-600">
                <tr>
                  <td className="px-4 py-2" colSpan={4}>
                    Total
                  </td>
                  <td className="px-4 py-2 text-right font-semibold text-slate-900">
                    {formatCurrency(total)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}