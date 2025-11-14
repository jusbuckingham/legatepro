// src/app/app/estates/[estateId]/expenses/[expenseId]/page.tsx

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { connectToDatabase } from "../../../../../../lib/db";
import { Expense } from "../../../../../../models/Expense";

export const dynamic = "force-dynamic";

interface PageProps {
  params: {
    estateId: string;
    expenseId: string;
  };
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

async function updateExpense(formData: FormData) {
  "use server";

  const estateId = formData.get("estateId");
  const expenseId = formData.get("expenseId");

  if (typeof estateId !== "string" || typeof expenseId !== "string") {
    return;
  }

  const dateRaw = formData.get("date")?.toString();
  const category = formData.get("category")?.toString().trim() || "";
  const payee = formData.get("payee")?.toString().trim() || "";
  const description = formData.get("description")?.toString().trim() || "";
  const amountRaw = formData.get("amount")?.toString();
  const isReimbursable = formData.get("isReimbursable") === "on";

  const date = dateRaw ? new Date(dateRaw) : undefined;
  const amount = amountRaw ? Number(amountRaw) : undefined;

  // Require at least description or amount
  if (!description && (amount == null || Number.isNaN(amount))) {
    return;
  }

  await connectToDatabase();

  await Expense.findOneAndUpdate(
    { _id: expenseId, estateId },
    {
      date: date && !Number.isNaN(date.getTime()) ? date : undefined,
      category: category || undefined,
      payee: payee || undefined,
      description: description || undefined,
      amount:
        amount != null && !Number.isNaN(amount)
          ? Number(amount.toFixed(2))
          : undefined,
      isReimbursable,
    },
    { new: true }
  );

  revalidatePath(`/app/estates/${estateId}/expenses`);
  redirect(`/app/estates/${estateId}/expenses`);
}

function toISODateInput(value?: string | Date) {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10); // yyyy-mm-dd
}

export default async function ExpenseDetailPage({ params }: PageProps) {
  const { estateId, expenseId } = params;

  if (!estateId || !expenseId) {
    notFound();
  }

  const doc = await loadExpense(estateId, expenseId);
  if (!doc) {
    notFound();
  }

  const dateValue = toISODateInput(doc.date);
  const category = doc.category ?? "";
  const payee = doc.payee ?? "";
  const description = doc.description ?? "";
  const amount =
    doc.amount != null && !Number.isNaN(doc.amount) ? String(doc.amount) : "";
  const isReimbursable = Boolean(doc.isReimbursable);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
            Edit expense
          </h1>
          <p className="text-sm text-slate-400">
            Adjust the category, description, or amount. This feeds into your
            estate ledger and reimbursement summary.
          </p>
        </div>
        <Link
          href={`/app/estates/${estateId}/expenses`}
          className="text-sm text-slate-300 underline-offset-2 hover:text-emerald-300 hover:underline"
        >
          Back to expenses
        </Link>
      </div>

      <form
        action={updateExpense}
        className="max-w-2xl space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm"
      >
        <input type="hidden" name="estateId" value={estateId} />
        <input type="hidden" name="expenseId" value={expenseId} />

        <div className="grid gap-3 md:grid-cols-[0.9fr,1fr,1fr]">
          <div className="space-y-1">
            <label
              htmlFor="date"
              className="text-xs font-medium text-slate-300"
            >
              Date
            </label>
            <input
              id="date"
              name="date"
              type="date"
              defaultValue={dateValue}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-50 outline-none focus:border-emerald-400"
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor="category"
              className="text-xs font-medium text-slate-300"
            >
              Category
            </label>
            <input
              id="category"
              name="category"
              defaultValue={category}
              placeholder="Court fees, repairs, insurance..."
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-50 outline-none focus:border-emerald-400"
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor="payee"
              className="text-xs font-medium text-slate-300"
            >
              Payee
            </label>
            <input
              id="payee"
              name="payee"
              defaultValue={payee}
              placeholder="Who was paid"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-50 outline-none focus:border-emerald-400"
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[1.4fr,0.6fr]">
          <div className="space-y-1">
            <label
              htmlFor="description"
              className="text-xs font-medium text-slate-300"
            >
              Description
            </label>
            <input
              id="description"
              name="description"
              defaultValue={description}
              placeholder="Short description for the ledger"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-50 outline-none focus:border-emerald-400"
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor="amount"
              className="text-xs font-medium text-slate-300"
            >
              Amount (USD)
            </label>
            <input
              id="amount"
              name="amount"
              type="number"
              step="0.01"
              min="0"
              defaultValue={amount}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-50 outline-none focus:border-emerald-400"
              placeholder="0.00"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              name="isReimbursable"
              defaultChecked={isReimbursable}
              className="h-3 w-3 rounded border-slate-600 bg-slate-950 text-emerald-500 focus:ring-emerald-500"
            />
            Reimbursable to PR
          </label>

          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-emerald-400"
          >
            Save changes
          </button>
        </div>
      </form>
    </div>
  );
}