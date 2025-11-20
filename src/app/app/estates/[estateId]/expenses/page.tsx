import { redirect } from "next/navigation";
import Link from "next/link";
import { Types } from "mongoose";
import type { FlattenMaps } from "mongoose";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Estate, type EstateDocument } from "@/models/Estate";
import { Expense, type ExpenseDocument } from "@/models/Expense";

// Types

type PageProps = {
  params: Promise<{ estateId: string }>;
};

type EstateDocLean = FlattenMaps<EstateDocument> & {
  _id: Types.ObjectId;
};

type ExpenseDocLean = FlattenMaps<ExpenseDocument> & {
  _id: Types.ObjectId;
};

type EstateExpenseRow = {
  id: string;
  incurredAt: string;
  category: string;
  amount: number;
  payee?: string;
  description?: string;
};

// Helpers

function formatDate(dateString: string) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}

export const metadata = {
  title: "Estate expenses | LegatePro",
};

export default async function EstateExpensesPage({ params }: PageProps) {
  const { estateId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const ownerId = session.user.id;

  await connectToDatabase();

  const estate = await Estate.findOne({ _id: estateId, ownerId })
    .select("caseName decedentName")
    .lean<EstateDocLean | null>();

  if (!estate) {
    redirect("/app/estates");
  }

  const expenseDocs = await Expense.find({ estateId, ownerId })
    .sort({ incurredAt: -1, createdAt: -1 })
    .lean<ExpenseDocLean[]>();

  const rows: EstateExpenseRow[] = expenseDocs.map((doc) => {
    const { incurredAt } = doc as ExpenseDocLean & {
      incurredAt?: Date | string;
      createdAt?: Date | string;
    };

    const incurredAtValue = (() => {
      if (incurredAt instanceof Date) return incurredAt.toISOString();
      if (typeof incurredAt === "string") {
        return new Date(incurredAt).toISOString();
      }
      const createdAt = (doc as ExpenseDocLean & {
        createdAt?: Date | string;
      }).createdAt;
      if (createdAt instanceof Date) return createdAt.toISOString();
      if (typeof createdAt === "string")
        return new Date(createdAt).toISOString();
      return new Date().toISOString();
    })();

    return {
      id: doc._id.toString(),
      incurredAt: incurredAtValue,
      category: String(
        (doc as ExpenseDocLean & { category?: string }).category ?? "Other"
      ),
      amount: Number(
        (doc as ExpenseDocLean & { amount?: number }).amount ?? 0
      ),
      payee: (doc as ExpenseDocLean & { payee?: string }).payee ?? undefined,
      description:
        (doc as ExpenseDocLean & { description?: string }).description ??
        undefined,
    };
  });

  const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);

  const totalByCategory = rows.reduce<Map<string, number>>((acc, row) => {
    const key = row.category || "Other";
    const prev = acc.get(key) ?? 0;
    acc.set(key, prev + row.amount);
    return acc;
  }, new Map<string, number>());

  const categoryTotals = Array.from(totalByCategory.entries()).sort(
    (a, b) => b[1] - a[1]
  );

  const estateDisplayName =
    (estate as EstateDocLean & { displayName?: string }).displayName ??
    (estate as EstateDocLean & { caseName?: string }).caseName ??
    (estate as EstateDocLean & { decedentName?: string }).decedentName ??
    "Untitled estate";

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Estate expenses
          </p>
          <h1 className="text-2xl font-semibold text-slate-50">
            {estateDisplayName}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Track legal fees, repairs, utilities, taxes, and other costs for
            this estate.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-right text-sm">
            <div className="text-xs uppercase tracking-wide text-slate-400">
              Total recorded
            </div>
            <div className="text-lg font-semibold text-rose-400">
              {formatCurrency(totalAmount)}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-right text-sm">
            <div className="text-xs uppercase tracking-wide text-slate-400">
              Expense entries
            </div>
            <div className="text-lg font-semibold text-slate-50">
              {rows.length}
            </div>
          </div>

          <Link
            href={`/app/estates/${estateId}/expenses/new`}
            className="inline-flex items-center justify-center rounded-lg border border-rose-500/60 bg-rose-500/10 px-4 py-2 text-xs font-medium text-rose-200 shadow-sm shadow-rose-900/40 transition hover:border-rose-400 hover:bg-rose-500/20"
          >
            + New expense
          </Link>
        </div>
      </div>

      {/* Category breakdown */}
      {categoryTotals.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
          <h2 className="mb-3 text-sm font-medium text-slate-200">
            By category
          </h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {categoryTotals.map(([category, amount]) => (
              <div
                key={category}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs"
              >
                <span className="max-w-[60%] truncate text-slate-200">
                  {category}
                </span>
                <span className="font-semibold text-rose-300">
                  {formatCurrency(amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/70">
        <div className="border-b border-slate-800 px-4 py-3 text-sm font-medium text-slate-200">
          All expenses for this estate
        </div>
        {rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400">
            No expenses recorded yet for this estate.{" "}
            <span className="text-slate-300">
              Use the <span className="font-semibold">New expense</span> button
              to add your first entry.
            </span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-800 bg-slate-900/60 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Category</th>
                  <th className="px-4 py-2">Payee</th>
                  <th className="px-4 py-2">Description</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2 text-right">Details</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-slate-900/60 last:border-b-0 hover:bg-slate-900/40"
                  >
                    <td className="px-4 py-2 text-xs text-slate-300">
                      {formatDate(row.incurredAt)}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-300">
                      {row.category}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-300">
                      {row.payee ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-400">
                      {row.description ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right text-xs font-semibold text-rose-300">
                      {formatCurrency(row.amount)}
                    </td>
                    <td className="px-4 py-2 text-right text-xs">
                      <Link
                        href={`/app/estates/${estateId}/expenses/${row.id}`}
                        className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900/60 px-2 py-1 text-[11px] font-medium text-slate-100 hover:border-rose-500 hover:text-rose-200"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}