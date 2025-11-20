// src/app/app/expenses/page.tsx
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { connectToDatabase } from "@/lib/db";
import { Estate, type EstateDocument } from "@/models/Estate";
import { Expense, type ExpenseDocument } from "@/models/Expense";
import type { FlattenMaps } from "mongoose";
import { Types } from "mongoose";

type EstateDocLean = FlattenMaps<EstateDocument> & {
  _id: Types.ObjectId;
};

type ExpenseDocLean = FlattenMaps<ExpenseDocument> & {
  _id: Types.ObjectId;
};

type GlobalExpenseRow = {
  id: string;
  estateId: string;
  estateName: string;
  incurredAt: string;
  category: string;
  amount: number;
  payee?: string;
  description?: string;
};

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
  title: "Expenses | LegatePro",
};

export default async function GlobalExpensesPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const ownerId = session.user.id;

  await connectToDatabase();

  const [estateDocs, expenseDocs] = await Promise.all([
    Estate.find({ ownerId })
      .select("caseName decedentName")
      .lean<EstateDocLean[]>(),
    Expense.find({ ownerId })
      .sort({ incurredAt: -1 })
      .lean<ExpenseDocLean[]>(),
  ]);

  const estateNameById = new Map<string, string>();

  for (const estate of estateDocs) {
    const id = estate._id.toString();
    const displayName =
      // keep in sync with how we label estates elsewhere
      (estate as EstateDocLean & { displayName?: string }).displayName ??
      (estate as EstateDocLean & { caseName?: string }).caseName ??
      (estate as EstateDocLean & { decedentName?: string }).decedentName ??
      "Untitled estate";

    estateNameById.set(id, displayName);
  }

  const rows: GlobalExpenseRow[] = expenseDocs.map((doc) => {
    const estateIdRaw = doc.estateId as unknown;

    const estateId =
      estateIdRaw instanceof Types.ObjectId
        ? estateIdRaw.toString()
        : String(estateIdRaw);

    const { incurredAt } = doc as ExpenseDocLean & {
      incurredAt?: Date | string;
      createdAt?: Date | string;
    };

    const incurredAtValue = (() => {
      if (incurredAt instanceof Date) return incurredAt.toISOString();
      if (typeof incurredAt === "string") {
        return new Date(incurredAt).toISOString();
      }
      // Fallback to createdAt if incurredAt is not present on the typed model
      const createdAt = (doc as ExpenseDocLean & {
        createdAt?: Date | string;
      }).createdAt;
      if (createdAt instanceof Date) return createdAt.toISOString();
      if (typeof createdAt === "string") return new Date(createdAt).toISOString();
      return new Date().toISOString();
    })();

    return {
      id: doc._id.toString(),
      estateId,
      estateName: estateNameById.get(estateId) ?? "Unknown estate",
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

  const totalByEstate = rows.reduce<Map<string, number>>((acc, row) => {
    const prev = acc.get(row.estateName) ?? 0;
    acc.set(row.estateName, prev + row.amount);
    return acc;
  }, new Map<string, number>());

  const estateTotals = Array.from(totalByEstate.entries()).sort(
    (a, b) => b[1] - a[1]
  );

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold text-slate-50">
            Expenses overview
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            All expenses across your estates, with quick links back to each
            case.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
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
        </div>
      </div>

      {/* Estate breakdown */}
      {estateTotals.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
          <h2 className="mb-3 text-sm font-medium text-slate-200">
            By estate
          </h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {estateTotals.map(([name, amount]) => (
              <div
                key={name}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs"
              >
                <span className="max-w-[60%] truncate text-slate-200">
                  {name}
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
          All expenses
        </div>
        {rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400">
            No expenses recorded yet.{" "}
            <span className="text-slate-300">
              Open an estate and add expenses from the{" "}
              <span className="font-semibold">Expenses</span> tab.
            </span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-800 bg-slate-900/60 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Estate</th>
                  <th className="px-4 py-2">Category</th>
                  <th className="px-4 py-2">Payee</th>
                  <th className="px-4 py-2 text-right">Amount</th>
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
                    <td className="px-4 py-2 text-xs">
                      <Link
                        href={`/app/estates/${row.estateId}/expenses`}
                        className="text-slate-100 underline-offset-2 hover:text-rose-300 hover:underline"
                      >
                        {row.estateName}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-300">
                      {row.category}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-300">
                      {row.payee ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right text-xs font-semibold text-rose-300">
                      {formatCurrency(row.amount)}
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