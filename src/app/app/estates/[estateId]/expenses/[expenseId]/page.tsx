// src/app/app/estates/[estateId]/expenses/[expenseId]/page.tsx

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { connectToDatabase } from "@/lib/db";
import { Expense } from "@/models/Expense";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{
    estateId: string;
    expenseId: string;
  }>;
}

interface ExpenseDoc {
  _id: unknown;
  estateId: unknown;
  date?: string | Date;
  category?: string;
  payee?: string;
  description?: string;
  amount?: number;
  isReimbursable?: boolean;
}

async function loadExpense(
  estateId: string,
  expenseId: string
): Promise<ExpenseDoc | null> {
  await connectToDatabase();

  const doc = await Expense.findOne({
    _id: expenseId,
    estateId,
  }).lean<ExpenseDoc | null>();

  return doc;
}

async function deleteExpense(formData: FormData) {
  "use server";

  const estateId = formData.get("estateId");
  const expenseId = formData.get("expenseId");

  if (typeof estateId !== "string" || typeof expenseId !== "string") {
    return;
  }

  await connectToDatabase();

  await Expense.findOneAndDelete({
    _id: expenseId,
    estateId,
  });

  revalidatePath(`/app/estates/${estateId}/expenses`);
  redirect(`/app/estates/${estateId}/expenses`);
}

function formatDisplayDate(value?: string | Date) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export default async function ExpenseDetailPage({ params }: PageProps) {
  const { estateId, expenseId } = await params;

  if (!estateId || !expenseId) {
    notFound();
  }

  const doc = await loadExpense(estateId, expenseId);
  if (!doc) {
    notFound();
  }

  const dateDisplay = formatDisplayDate(doc.date);
  const category = doc.category ?? "Uncategorized";
  const payee = doc.payee ?? "—";
  const description = doc.description ?? "—";
  const amountDisplay =
    doc.amount != null && !Number.isNaN(doc.amount)
      ? `$${doc.amount.toFixed(2)}`
      : "—";
  const isReimbursable = Boolean(doc.isReimbursable);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
            Expense details
          </h1>
          <p className="text-sm text-slate-400">
            View how this expense shows up in your estate&apos;s ledger and
            reimbursement summary.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/app/estates/${estateId}/expenses/${expenseId}/edit`}
            className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-100 hover:border-emerald-400 hover:text-emerald-200"
          >
            Edit expense
          </Link>
          <Link
            href={`/app/estates/${estateId}/expenses`}
            className="text-xs text-slate-300 underline-offset-2 hover:text-emerald-300 hover:underline"
          >
            Back to expenses
          </Link>
        </div>
      </div>

      <div className="max-w-2xl space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Date
            </p>
            <p className="mt-1 text-sm text-slate-50">{dateDisplay}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Category
            </p>
            <p className="mt-1 text-sm text-slate-50">{category}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Amount
            </p>
            <p className="mt-1 text-sm text-emerald-300">{amountDisplay}</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Payee
            </p>
            <p className="mt-1 text-sm text-slate-50">{payee}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Reimbursable
            </p>
            <p className="mt-1 text-sm text-slate-50">
              {isReimbursable ? "Yes (reimbursable to PR)" : "No"}
            </p>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Description
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-50">
            {description}
          </p>
        </div>

        <div className="flex items-center justify-between border-t border-slate-800 pt-4">
          <p className="text-xs text-slate-500">
            Expense ID:{" "}
            <span className="font-mono text-[11px] text-slate-400">
              {String(doc._id)}
            </span>
          </p>

          <form action={deleteExpense}>
            <input type="hidden" name="estateId" value={estateId} />
            <input type="hidden" name="expenseId" value={expenseId} />
            <button
              type="submit"
              className="inline-flex items-center rounded-md border border-rose-900/60 bg-rose-950/60 px-3 py-1.5 text-xs font-medium text-rose-200 hover:border-rose-500 hover:bg-rose-900/70"
            >
              Delete expense
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}