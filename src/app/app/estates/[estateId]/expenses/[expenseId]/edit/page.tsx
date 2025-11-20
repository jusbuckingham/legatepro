// src/app/app/estates/[estateId]/expenses/[expenseId]/edit/page.tsx

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

function toInputDate(value?: string | Date) {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10); // yyyy-mm-dd
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

  const dateRaw = formData.get("date");
  const categoryRaw = formData.get("category");
  const payeeRaw = formData.get("payee");
  const descriptionRaw = formData.get("description");
  const amountRaw = formData.get("amount");
  const isReimbursableRaw = formData.get("isReimbursable");

  const update: Record<string, unknown> = {};

  if (dateRaw) {
    const d = new Date(String(dateRaw));
    if (!Number.isNaN(d.getTime())) {
      update.date = d;
    }
  }

  if (categoryRaw) {
    update.category = String(categoryRaw);
  }

  if (payeeRaw) {
    update.payee = String(payeeRaw);
  }

  if (descriptionRaw) {
    update.description = String(descriptionRaw);
  }

  if (amountRaw) {
    const n = Number(amountRaw);
    if (!Number.isNaN(n)) {
      update.amount = n;
    }
  }

  update.isReimbursable = isReimbursableRaw === "on";

  await connectToDatabase();

  await Expense.findOneAndUpdate(
    { _id: expenseId, estateId },
    { $set: update },
    { new: false }
  );

  // Refresh estate expenses + detail page
  revalidatePath(`/app/estates/${estateId}/expenses`);
  revalidatePath(`/app/estates/${estateId}/expenses/${expenseId}`);
  redirect(`/app/estates/${estateId}/expenses/${expenseId}`);
}

const CATEGORY_OPTIONS = [
  { value: "REPAIRS", label: "Repairs & maintenance" },
  { value: "TAXES", label: "Property taxes" },
  { value: "UTILITIES", label: "Utilities" },
  { value: "INSURANCE", label: "Insurance" },
  { value: "PROFESSIONAL_FEES", label: "Professional fees" },
  { value: "COURT_FEES", label: "Court / filing fees" },
  { value: "OTHER", label: "Other" },
];

export default async function EditExpensePage({ params }: PageProps) {
  const { estateId, expenseId } = await params;

  if (!estateId || !expenseId) {
    notFound();
  }

  const doc = await loadExpense(estateId, expenseId);
  if (!doc) {
    notFound();
  }

  const dateValue = toInputDate(doc.date);
  const categoryValue = doc.category ?? "";
  const amountValue =
    doc.amount != null && !Number.isNaN(doc.amount) ? doc.amount : "";

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
            Edit expense
          </h1>
          <p className="text-sm text-slate-400">
            Update the details for this expense. Changes will be reflected in
            your estate&apos;s ledger and totals.
          </p>
        </div>

        <Link
          href={`/app/estates/${estateId}/expenses/${expenseId}`}
          className="text-xs text-slate-300 underline-offset-2 hover:text-emerald-300 hover:underline"
        >
          Cancel
        </Link>
      </div>

      <form
        action={updateExpense}
        className="max-w-2xl space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm"
      >
        <input type="hidden" name="estateId" value={estateId} />
        <input type="hidden" name="expenseId" value={expenseId} />

        <div className="grid gap-4 md:grid-cols-3">
          {/* Date */}
          <div>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Date
              </span>
              <input
                type="date"
                name="date"
                defaultValue={dateValue}
                className="rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-sm text-slate-50 outline-none ring-emerald-500/40 focus:ring"
              />
            </label>
          </div>

          {/* Category */}
          <div>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Category
              </span>
              <select
                name="category"
                defaultValue={categoryValue}
                className="rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-sm text-slate-50 outline-none ring-emerald-500/40 focus:ring"
              >
                <option value="">Select category</option>
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Amount */}
          <div>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Amount
              </span>
              <div className="flex items-center gap-1">
                <span className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-400">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  name="amount"
                  defaultValue={amountValue}
                  className="flex-1 rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-sm text-slate-50 outline-none ring-emerald-500/40 focus:ring"
                />
              </div>
            </label>
          </div>
        </div>

        {/* Payee */}
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Payee
              </span>
              <input
                type="text"
                name="payee"
                defaultValue={doc.payee ?? ""}
                placeholder="Who was paid?"
                className="rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-sm text-slate-50 outline-none ring-emerald-500/40 focus:ring"
              />
            </label>
          </div>

          {/* Reimbursable */}
          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 text-xs text-slate-200">
              <input
                type="checkbox"
                name="isReimbursable"
                defaultChecked={Boolean(doc.isReimbursable)}
                className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500/60"
              />
              <span>Reimbursable to personal representative</span>
            </label>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Description
            </span>
            <textarea
              name="description"
              rows={4}
              defaultValue={doc.description ?? ""}
              placeholder="Briefly describe this expense and its connection to the estate."
              className="w-full rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-sm text-slate-50 outline-none ring-emerald-500/40 focus:ring"
            />
          </label>
        </div>

        <div className="flex items-center justify-between pt-3">
          <p className="text-xs text-slate-500">
            Expense ID:{" "}
            <span className="font-mono text-[11px] text-slate-400">
              {String(doc._id)}
            </span>
          </p>

          <div className="flex items-center gap-2">
            <Link
              href={`/app/estates/${estateId}/expenses/${expenseId}`}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-slate-500"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-emerald-50 shadow-sm hover:bg-emerald-500"
            >
              Save changes
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}