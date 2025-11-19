import Link from "next/link";
import { notFound } from "next/navigation";

import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";
import type { EstateDocument } from "@/models/Estate";
import { Expense } from "@/models/Expense";
import type { ExpenseDocument } from "@/models/Expense";

// Keep this in sync with your Mongoose Expense category enum
export type ExpenseCategory =
  | "TAXES"
  | "INSURANCE"
  | "MAINTENANCE"
  | "UTILITIES"
  | "LEGAL"
  | "FUNERAL"
  | "MORTGAGE"
  | "OTHER";

interface PageProps {
  params: Promise<{ estateId: string }>;
}

interface ExpenseListItem {
  id: string;
  date: string | null;
  description: string;
  category: ExpenseCategory;
  amount: number;
  isPaid: boolean;
  payee?: string;
}

async function loadEstate(estateId: string) {
  await connectToDatabase();

  const estateDoc = (await Estate.findById(estateId).lean()) as
    | (EstateDocument & {
        displayName?: string;
        caseName?: string;
      })
    | null;

  if (!estateDoc) return null;

  const { _id, displayName, caseName } = estateDoc;

  return {
    id: String(_id),
    displayName: displayName ?? caseName ?? "Estate",
  };
}

async function loadExpenses(estateId: string): Promise<ExpenseListItem[]> {
  await connectToDatabase();

  const docs = await Expense.find({ estateId })
    .sort({ date: -1 })
    .lean<ExpenseDocument[]>();

  return docs.map((doc): ExpenseListItem => ({
    id: String(doc._id),
    date: doc.date ? new Date(doc.date).toISOString().slice(0, 10) : null,
    description: doc.description ?? "",
    category: (doc.category as ExpenseCategory) ?? "OTHER",
    amount: typeof doc.amount === "number" ? doc.amount : Number(doc.amount) || 0,
    isPaid: Boolean(doc.isPaid),
    payee: doc.payee ?? undefined,
  }));
}

export default async function EstateExpensesPage({ params }: PageProps) {
  const { estateId } = await params;

  const [estate, expenses] = await Promise.all([
    loadEstate(estateId),
    loadExpenses(estateId),
  ]);

  if (!estate) {
    return notFound();
  }

  const totalAmount = expenses.reduce((sum, exp) => sum + exp.amount, 0);
  const paidAmount = expenses
    .filter((exp) => exp.isPaid)
    .reduce((sum, exp) => sum + exp.amount, 0);
  const unpaidAmount = totalAmount - paidAmount;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-50">
            Expenses for {estate.displayName}
          </h1>
          <p className="text-xs text-slate-400">
            Track court costs, maintenance, taxes, and other estate expenses.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/app/estates/${estate.id}/expenses/new`}
            className="inline-flex items-center rounded-full border border-rose-500/60 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-100 shadow-sm shadow-rose-950/40 transition hover:bg-rose-500/20"
          >
            + Add expense
          </Link>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">
            Total expenses
          </p>
          <p className="mt-1 text-lg font-semibold text-slate-50">
            ${totalAmount.toFixed(2)}
          </p>
        </div>
        <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/60 p-3">
          <p className="text-[10px] uppercase tracking-wide text-emerald-500">
            Paid
          </p>
          <p className="mt-1 text-lg font-semibold text-emerald-100">
            ${paidAmount.toFixed(2)}
          </p>
        </div>
        <div className="rounded-xl border border-amber-900/60 bg-amber-950/60 p-3">
          <p className="text-[10px] uppercase tracking-wide text-amber-400">
            Outstanding
          </p>
          <p className="mt-1 text-lg font-semibold text-amber-100">
            ${unpaidAmount.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/70">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-slate-900/80 text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Description</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium text-right">Amount</th>
              <th className="px-3 py-2 font-medium text-center">Status</th>
              <th className="px-3 py-2 font-medium">Payee</th>
            </tr>
          </thead>
          <tbody>
            {expenses.length === 0 ? (
              <tr>
                <td
                  className="px-3 py-4 text-center text-slate-500"
                  colSpan={6}
                >
                  No expenses recorded yet.
                </td>
              </tr>
            ) : (
              expenses.map((expense) => (
                <tr
                  key={expense.id}
                  className="border-t border-slate-800/80 hover:bg-slate-900/50"
                >
                  <td className="px-3 py-2 align-top text-slate-300">
                    {expense.date ?? "—"}
                  </td>
                  <td className="px-3 py-2 align-top text-slate-50">
                    {expense.description || "(No description)"}
                  </td>
                  <td className="px-3 py-2 align-top text-slate-300">
                    {expense.category}
                  </td>
                  <td className="px-3 py-2 align-top text-right text-slate-50">
                    ${expense.amount.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 align-top text-center">
                    <span
                      className={
                        expense.isPaid
                          ? "inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300"
                          : "inline-flex rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-200"
                      }
                    >
                      {expense.isPaid ? "Paid" : "Outstanding"}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top text-slate-300">
                    {expense.payee ?? ""}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}