import React from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";

import { auth } from "@/lib/auth";
import { requireEstateAccess } from "@/lib/estateAccess";
import { connectToDatabase, serializeMongoDoc } from "@/lib/db";
import { Estate } from "@/models/Estate";
import { Expense } from "@/models/Expense";
import { formatCurrency, formatDate } from "@/lib/utils";
import PageHeader from "@/components/layout/PageHeader";

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

const asString = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

const asNumber = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

const asDate = (v: unknown): Date | undefined => (v instanceof Date ? v : undefined);

const idToString = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "toString" in v && typeof (v as { toString: unknown }).toString === "function") {
    return String((v as { toString: () => string }).toString());
  }
  return String(v);
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

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/app/estates/${estateId}/expenses`);
  }

  await connectToDatabase();

  const access = await requireEstateAccess({ estateId, userId: session.user.id });
  if (!access.hasAccess) {
    redirect("/app/estates");
  }

  const canEdit = access.canEdit;

  const estateDoc = await Estate.findOne({ _id: estateId }).lean().exec();
  if (!estateDoc) {
    notFound();
  }

  const expensesRaw = await Expense.find({
    estateId,
  })
    .sort({ date: -1, createdAt: -1 })
    .lean()
    .exec();

  const expenses: EstateExpenseRow[] = expensesRaw.map((expDoc) => {
    const exp = serializeMongoDoc(expDoc) as Record<string, unknown>;

    const amountCents = asNumber(exp.amountCents) ?? 0;

    const statusRaw = asString(exp.status);
    const status = statusRaw && statusRaw.trim().length > 0 ? statusRaw : "RECORDED";

    const categoryRaw = asString(exp.category);
    const category = categoryRaw && categoryRaw.trim().length > 0 ? categoryRaw : "General";

    const description = asString(exp.description) ?? "";

    const date = asDate(exp.date) ?? asDate(exp.createdAt);

    const hasReceiptExplicit = typeof exp.hasReceipt === "boolean" ? exp.hasReceipt : undefined;
    const receiptUrl = asString(exp.receiptUrl);
    const hasReceiptFromUrl = !!(receiptUrl && receiptUrl.trim().length > 0);
    const hasReceipt = hasReceiptExplicit ?? hasReceiptFromUrl;

    return {
      id: idToString(exp._id),
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

  const estateObj = serializeMongoDoc(estateDoc) as Record<string, unknown>;
  const displayName = asString(estateObj.displayName);
  const caseName = asString(estateObj.caseName);

  const estateLabel =
    displayName && caseName
      ? `${displayName} – ${caseName}`
      : displayName ?? caseName ?? "Estate";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 space-y-8">
      <PageHeader
        eyebrow="Estate expenses"
        title={`Expenses for ${estateLabel}`}
        description={
          "Track out-of-pocket costs and estate-related spending. These expenses help you reconcile reimbursements and the net value of the estate."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/app/estates/${estateId}`}
              className="inline-flex items-center rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-700"
            >
              ← Back
            </Link>
            <Link
              href="/app/expenses"
              className="inline-flex items-center rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-700"
            >
              View all
            </Link>
            {canEdit ? (
              <Link
                href={`/app/expenses/new?estateId=${encodeURIComponent(estateId)}`}
                className="inline-flex items-center rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
              >
                + Add expense
              </Link>
            ) : (
              <Link
                href={`/app/estates/${estateId}?requestAccess=1`}
                className="inline-flex items-center rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
              >
                Request edit access
              </Link>
            )}
          </div>
        }
      />

      {/* Summary strip */}
      <section className="grid gap-4 md:grid-cols-2">
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
      </section>

      {/* Table */}
      <section className="rounded-lg border border-slate-800 bg-slate-950/60">
        <div className="flex flex-col gap-1 border-b border-slate-800 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold text-slate-100">Expense history</h2>
          <p className="text-[11px] text-slate-500">Sorted with most recent expenses first.</p>
        </div>

        {expenses.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-slate-400">
            <p className="text-slate-200">No expenses recorded for this estate yet.</p>
            <p className="mt-2 text-slate-400">
              Add your first expense to start tracking totals and reimbursements.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {canEdit ? (
                <Link
                  href={`/app/expenses/new?estateId=${encodeURIComponent(estateId)}`}
                  className="inline-flex items-center rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
                >
                  + Add expense
                </Link>
              ) : (
                <Link
                  href={`/app/estates/${estateId}?requestAccess=1`}
                  className="inline-flex items-center rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                >
                  Request edit access
                </Link>
              )}
              <Link
                href="/app/expenses"
                className="inline-flex items-center rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-700"
              >
                View all expenses
              </Link>
            </div>
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
                        {canEdit ? (
                          <Link
                            href={`/app/expenses/${exp.id}/edit`}
                            className="text-[11px] font-medium text-sky-400 hover:text-sky-300"
                          >
                            Edit
                          </Link>
                        ) : null}
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
    </div>
  );
}