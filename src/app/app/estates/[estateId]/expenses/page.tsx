// src/app/app/expenses/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Expense, type ExpenseDocument } from "@/models/Expense";
import { type EstateDocument } from "@/models/Estate";

type LeanEstateForExpense = {
  _id: string;
  displayName?: string;
  caseName?: string;
};

type LeanExpense = {
  _id: string;
  estate?: LeanEstateForExpense | null;
  amount: number;
  category?: string;
  description?: string;
  payee?: string;
  status?: string;
  incurredAt?: Date;
  createdAt?: Date;
};

export const metadata = {
  title: "All Expenses | LegatePro",
};

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function formatDate(date?: Date): string {
  if (!date) return "–";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function humanizeCategory(category?: string): string {
  if (!category) return "Uncategorized";
  return category
    .toLowerCase()
    .split("_")
    .join(" ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function humanizeStatus(status?: string): string {
  if (!status) return "PENDING";
  return status
    .toLowerCase()
    .split("_")
    .join(" ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export default async function GlobalExpensesPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  await connectToDatabase();

  // Load all expenses for this owner, including estate info
  const raw = (await Expense.find({
    ownerId: session.user.id,
  })
    .populate("estateId")
    .sort({ incurredAt: -1 })
    .lean()) as Array<
    ExpenseDocument & {
      estateId?:
        | (EstateDocument & { _id: unknown })
        | { _id: unknown }
        | unknown;
    }
  >;

  const expenses: LeanExpense[] = raw.map((doc) => {
    let estate: LeanEstateForExpense | null = null;

    if (doc.estateId && typeof doc.estateId === "object") {
      const estateDoc = doc.estateId as EstateDocument & { _id: unknown };
      estate = {
        _id: String(estateDoc._id),
        displayName: estateDoc.displayName,
        caseName: (estateDoc as EstateDocument).caseName,
      };
    }

    return {
      _id: String(doc._id),
      estate,
      amount: doc.amount,
      category: doc.category,
      description: doc.description,
      payee: doc.payee,
      status: doc.status,
      incurredAt: doc.incurredAt,
      createdAt: doc.createdAt,
    };
  });

  const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${now.getMonth()}`;
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthKey = `${lastMonth.getFullYear()}-${lastMonth.getMonth()}`;

  const byMonth = expenses.reduce<Record<string, number>>((acc, e) => {
    if (!e.incurredAt) return acc;
    const d = e.incurredAt;
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    acc[key] = (acc[key] || 0) + (e.amount || 0);
    return acc;
  }, {});

  const thisMonthTotal = byMonth[thisMonthKey] || 0;
  const lastMonthTotal = byMonth[lastMonthKey] || 0;

  const monthDelta = thisMonthTotal - lastMonthTotal;
  const monthDeltaLabel =
    monthDelta === 0
      ? "Flat vs last month"
      : monthDelta > 0
      ? `↑ ${formatCurrency(Math.abs(monthDelta))} vs last month`
      : `↓ ${formatCurrency(Math.abs(monthDelta))} vs last month`;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
            All Expenses
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            See every expense across all of your estates in one place.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/app/estates"
            className="inline-flex items-center rounded-full border border-slate-700/70 bg-slate-950/60 px-3 py-1.5 text-xs font-medium text-slate-200 shadow-sm shadow-slate-950/50 hover:border-rose-500/70 hover:text-rose-200"
          >
            ← Back to Estates
          </Link>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 shadow-sm shadow-slate-950/70">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Total Expenses
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-50">
            {formatCurrency(totalExpenses)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Across {expenses.length}{" "}
            {expenses.length === 1 ? "entry" : "entries"}.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 shadow-sm shadow-slate-950/70">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            This Month
          </p>
          <p className="mt-2 text-xl font-semibold text-slate-50">
            {formatCurrency(thisMonthTotal)}
          </p>
          <p className="mt-1 text-xs text-slate-500">{monthDeltaLabel}</p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 shadow-sm shadow-slate-950/70">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Estates With Expenses
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-50">
            {
              new Set(
                expenses
                  .map((e) => e.estate?._id)
                  .filter((id): id is string => Boolean(id))
              ).size
            }
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Counted by unique estate IDs.
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/80 shadow-sm shadow-slate-950/70">
        <div className="border-b border-slate-800 bg-slate-950/80 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Expense Activity
        </div>

        {expenses.length === 0 ? (
          <div className="p-6 text-sm text-slate-400">
            No expenses recorded yet. Start by adding expenses from within a
            specific estate.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-800 text-sm">
              <thead className="bg-slate-950/60">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                    Date
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                    Estate
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                    Category
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                    Payee
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-slate-400">
                    Amount
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                    Status
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-slate-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {expenses.map((expense) => {
                  const estateLabel =
                    expense.estate?.displayName ||
                    expense.estate?.caseName ||
                    "Unassigned";

                  return (
                    <tr key={expense._id} className="hover:bg-slate-900/50">
                      <td className="whitespace-nowrap px-4 py-2 text-slate-200">
                        {formatDate(expense.incurredAt ?? expense.createdAt)}
                      </td>
                      <td className="px-4 py-2 text-slate-200">
                        {expense.estate ? (
                          <Link
                            href={`/app/estates/${expense.estate._id}`}
                            className="text-xs font-medium text-rose-300 hover:text-rose-200"
                          >
                            {estateLabel}
                          </Link>
                        ) : (
                          <span className="text-xs text-slate-500">
                            Unassigned
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-300">
                        {humanizeCategory(expense.category)}
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-300">
                        {expense.payee || "–"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right text-sm font-semibold text-slate-50">
                        {formatCurrency(expense.amount)}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            expense.status === "PAID"
                              ? "bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/30"
                              : expense.status === "DUE"
                              ? "bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/30"
                              : "bg-slate-500/10 text-slate-300 ring-1 ring-slate-500/30"
                          }`}
                        >
                          {humanizeStatus(expense.status)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right text-xs">
                        {expense.estate ? (
                          <Link
                            href={`/app/estates/${expense.estate._id}/expenses/${expense._id}`}
                            className="rounded-full border border-slate-700/70 px-2 py-1 text-[11px] font-medium text-slate-200 hover:border-rose-500/70 hover:text-rose-200"
                          >
                            View
                          </Link>
                        ) : (
                          <span className="text-xs text-slate-500">–</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}