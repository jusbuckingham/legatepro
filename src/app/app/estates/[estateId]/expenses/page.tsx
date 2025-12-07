import React from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";
import { Expense } from "@/models/Expense";
import { formatCurrency, formatDate } from "@/lib/utils";

// A focused row type for the UI layer
type EstateExpenseRow = {
  id: string;
  date?: Date;
  category: string;
  description: string;
  amountCents: number;
  status: string;
  hasReceipt: boolean;
};

// Narrowed version of the lean Mongoose doc so we can safely access fields
// without pulling in the full ExpenseDocument type.
type LeanExpenseDoc = {
  _id: unknown;
  amountCents?: number;
  status?: string;
  category?: string;
  description?: string;
  date?: Date;
  createdAt?: Date;
  // Optional receipt-related fields (if present in the schema)
  hasReceipt?: boolean;
  receiptUrl?: string | null;
};

type PageProps = {
  params: Promise<{
    estateId: string;
  }>;
};

export const metadata: Metadata = {
  title: "Estate expenses | LegatePro",
};

export default async function EstateExpensesPage({ params }: PageProps) {
  const { estateId } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  await connectToDatabase();

  const estateDoc = await Estate.findOne({
    _id: estateId,
    ownerId: session.user.id,
  })
    .lean()
    .exec();

  if (!estateDoc) {
    notFound();
  }

  const expensesRaw = await Expense.find({
    ownerId: session.user.id,
    estateId,
  })
    .sort({ date: -1, createdAt: -1 })
    .lean()
    .exec();

  const expenses: EstateExpenseRow[] = expensesRaw.map((expDoc) => {
    const exp = expDoc as unknown as LeanExpenseDoc;

    const amountCents =
      typeof exp.amountCents === "number" ? exp.amountCents : 0;

    const status =
      typeof exp.status === "string" && exp.status.trim().length > 0
        ? exp.status
        : "RECORDED";

    const category =
      typeof exp.category === "string" && exp.category.trim().length > 0
        ? exp.category
        : "General";

    const description =
      typeof exp.description === "string" ? exp.description : "";

    const date =
      exp.date instanceof Date
        ? exp.date
        : exp.createdAt instanceof Date
        ? exp.createdAt
        : undefined;

    const hasReceiptExplicit =
      typeof exp.hasReceipt === "boolean" ? exp.hasReceipt : undefined;

    const hasReceiptFromUrl =
      typeof exp.receiptUrl === "string" && exp.receiptUrl.trim().length > 0;

    const hasReceipt = hasReceiptExplicit ?? hasReceiptFromUrl;

    return {
      id: String(exp._id),
      date,
      category,
      description,
      amountCents,
      status,
      hasReceipt,
    };
  });

  const totalSpentCents = expenses.reduce(
    (sum, exp) => sum + exp.amountCents,
    0,
  );

  const estateTyped = estateDoc as unknown as {
    displayName?: string;
    caseName?: string;
  };

  const estateLabel =
    estateTyped.displayName && estateTyped.caseName
      ? `${estateTyped.displayName} – ${estateTyped.caseName}`
      : estateTyped.displayName ?? estateTyped.caseName ?? "Estate";

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-slate-500">
          Estate expenses
        </p>
        <h1 className="text-2xl font-semibold text-slate-100">
          Expenses for {estateLabel}
        </h1>
        <p className="text-sm text-slate-400">
          Track out-of-pocket costs and estate-related spending. These expenses
          help you reconcile reimbursements and net value of the estate.
        </p>
      </header>

      {/* Summary strip */}
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Total expenses
          </p>
          <p className="mt-1 text-xl font-semibold text-slate-50">
            {formatCurrency(totalSpentCents / 100)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            Sum of all recorded expenses tied to this estate.
          </p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Number of entries
          </p>
          <p className="mt-1 text-xl font-semibold text-slate-50">
            {expenses.length}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            Each line represents a distinct expense record.
          </p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4 flex flex-col justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Actions
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              Use the global Expenses page to add or edit entries, or jump
              directly into a specific expense from the table below.
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/app/expenses"
              className="inline-flex items-center rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-700"
            >
              View all expenses
            </Link>
            <Link
              href="/app/expenses/new"
              className="inline-flex items-center rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
            >
              + Add expense
            </Link>
          </div>
        </div>
      </section>

      {/* Table */}
      <section className="rounded-lg border border-slate-800 bg-slate-950/60">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-100">
            Expense history
          </h2>
          <p className="text-[11px] text-slate-500">
            Sorted with most recent expenses first.
          </p>
        </div>

        {expenses.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400">
            <p>No expenses recorded for this estate yet.</p>
            <p className="mt-1">
              You can add expenses from the{" "}
              <Link
                href="/app/expenses/new"
                className="text-sky-400 hover:text-sky-300"
              >
                global Expenses page
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-800 bg-slate-900/60 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Category</th>
                  <th className="px-4 py-2">Description</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2 text-right">Status</th>
                  <th className="px-4 py-2 text-right">Receipt</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((exp) => (
                  <tr
                    key={exp.id}
                    className="border-b border-slate-900/60 last:border-b-0 hover:bg-slate-900/40"
                  >
                    <td className="px-4 py-2 align-top text-xs text-slate-300">
                      {exp.date ? formatDate(exp.date) : "—"}
                    </td>
                    <td className="px-4 py-2 align-top text-xs text-slate-200">
                      {exp.category}
                    </td>
                    <td className="px-4 py-2 align-top text-xs text-slate-300">
                      {exp.description || (
                        <span className="text-slate-500 italic">
                          No description
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 align-top text-xs text-right text-slate-100">
                      {formatCurrency(exp.amountCents / 100)}
                    </td>
                    <td className="px-4 py-2 align-top text-xs text-right">
                      <span
                        className="inline-flex items-center rounded-full border border-slate-700 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-200"
                        aria-label={`Expense status: ${exp.status}`}
                      >
                        {exp.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 align-top text-xs text-right">
                      {exp.hasReceipt ? (
                        <span className="inline-flex items-center rounded-full border border-emerald-700/70 bg-emerald-900/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-200">
                          Receipt on file
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-slate-700 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                          None
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 align-top text-xs text-right">
                      <div className="inline-flex items-center gap-2">
                        <Link
                          href={`/app/expenses/${exp.id}/edit`}
                          className="text-[11px] font-medium text-sky-400 hover:text-sky-300"
                        >
                          Edit
                        </Link>
                        <Link
                          href={`/app/expenses/${exp.id}`}
                          className="text-[11px] text-slate-400 hover:text-slate-200"
                        >
                          View
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="pt-2">
        <Link
          href={`/app/estates/${estateId}`}
          className="text-xs text-slate-400 hover:text-slate-200"
        >
          ← Back to estate overview
        </Link>
      </div>
    </div>
  );
}