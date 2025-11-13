

import { connectToDatabase } from "@/lib/db";
import { Expense } from "@/models/Expense";
import { redirect } from "next/navigation";

interface EstateExpensesPageProps {
  params: {
    estateId: string;
  };
}

export const dynamic = "force-dynamic";

async function createExpense(formData: FormData) {
  "use server";

  const estateId = formData.get("estateId")?.toString();
  const date = formData.get("date")?.toString();
  const category = formData.get("category")?.toString().trim();
  const payee = formData.get("payee")?.toString().trim();
  const description = formData.get("description")?.toString().trim();
  const amountRaw = formData.get("amount")?.toString();
  const notes = formData.get("notes")?.toString().trim() || "";

  if (!estateId || !date || !category || !description || !amountRaw) {
    return;
  }

  const amount = Number.parseFloat(amountRaw);
  if (Number.isNaN(amount)) {
    return;
  }

  await connectToDatabase();

  await Expense.create({
    estateId,
    date,
    category,
    payee,
    description,
    amount,
    notes,
    isPaid: true,
  });

  redirect(`/app/estates/${estateId}/expenses`);
}

async function markUnpaid(formData: FormData) {
  "use server";

  const expenseId = formData.get("expenseId")?.toString();
  const estateId = formData.get("estateId")?.toString();

  if (!expenseId || !estateId) return;

  await connectToDatabase();

  await Expense.findByIdAndUpdate(expenseId, { isPaid: false });

  redirect(`/app/estates/${estateId}/expenses`);
}

async function markPaid(formData: FormData) {
  "use server";

  const expenseId = formData.get("expenseId")?.toString();
  const estateId = formData.get("estateId")?.toString();

  if (!expenseId || !estateId) return;

  await connectToDatabase();

  await Expense.findByIdAndUpdate(expenseId, { isPaid: true });

  redirect(`/app/estates/${estateId}/expenses`);
}

export default async function EstateExpensesPage({ params }: EstateExpensesPageProps) {
  const { estateId } = params;

  await connectToDatabase();

  const expenses = await Expense.find({ estateId })
    .sort({ date: 1, createdAt: 1 })
    .lean();

  const totals = expenses.reduce(
    (
      acc: { paid: number; all: number },
      expense: any,
    ) => {
      const amt = Number(expense.amount) || 0;
      acc.all += amt;
      if (expense.isPaid) acc.paid += amt;
      return acc;
    },
    { paid: 0, all: 0 },
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Expenses</h2>
          <p className="text-sm text-slate-400">
            Track every cost related to this estate: probate fees, funeral costs, property expenses,
            utilities, taxes, and more.
          </p>
        </div>

        <div className="flex flex-col items-end text-sm text-slate-300">
          <div>
            <span className="text-xs uppercase tracking-wide text-slate-400">Total recorded: </span>
            <span className="font-semibold">
              ${totals.all.toFixed(2)}
            </span>
          </div>
          <div>
            <span className="text-xs uppercase tracking-wide text-slate-400">Total paid: </span>
            <span className="font-semibold text-emerald-300">
              ${totals.paid.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* New expense form */}
      <form
        action={createExpense}
        className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4"
      >
        <input type="hidden" name="estateId" value={estateId} />

        <div className="grid gap-3 md:grid-cols-[140px,1.3fr,1fr,0.8fr]">
          <div className="space-y-1">
            <label htmlFor="date" className="text-xs font-medium text-slate-200">
              Date
            </label>
            <input
              id="date"
              name="date"
              type="date"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 outline-none focus:border-emerald-400"
              required
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="description" className="text-xs font-medium text-slate-200">
              Description
            </label>
            <input
              id="description"
              name="description"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 outline-none focus:border-emerald-400"
              placeholder="e.g. Probate filing fee, plumber for Tuller, funeral home deposit"
              required
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="category" className="text-xs font-medium text-slate-200">
              Category
            </label>
            <select
              id="category"
              name="category"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs uppercase tracking-wide text-slate-100 outline-none focus:border-emerald-400"
              defaultValue="PROBATE"
              required
            >
              <option value="FUNERAL">Funeral</option>
              <option value="PROBATE">Probate</option>
              <option value="PROPERTY">Property</option>
              <option value="UTILITIES">Utilities</option>
              <option value="TAXES">Taxes</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="amount" className="text-xs font-medium text-slate-200">
              Amount
            </label>
            <input
              id="amount"
              name="amount"
              type="number"
              step="0.01"
              min="0"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 outline-none focus:border-emerald-400"
              placeholder="0.00"
              required
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[1.2fr,1fr]">
          <div className="space-y-1">
            <label htmlFor="payee" className="text-xs font-medium text-slate-200">
              Payee / Vendor (optional)
            </label>
            <input
              id="payee"
              name="payee"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 outline-none focus:border-emerald-400"
              placeholder="e.g. Wayne County Probate Court, DTE Energy, ABC Plumbing"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="notes" className="text-xs font-medium text-slate-200">
              Notes (optional)
            </label>
            <input
              id="notes"
              name="notes"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 outline-none focus:border-emerald-400"
              placeholder="e.g. paid by estate account, reimbursable, related to Tuller"
            />
          </div>
        </div>

        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-emerald-400"
        >
          Add expense
        </button>
      </form>

      {/* Expenses table */}
      {expenses.length === 0 ? (
        <p className="text-sm text-slate-400">
          No expenses recorded yet. Start by adding probate fees, funeral costs, utilities, and any
          out-of-pocket costs you&apos;ve already paid.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/40">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2">Paid</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">Payee</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense: any) => {
                const date = expense.date
                  ? new Date(expense.date).toLocaleDateString()
                  : "—";
                const categoryLabel = expense.category?.toLowerCase?.() || "other";
                const isPaid = !!expense.isPaid;

                return (
                  <tr key={expense._id.toString()} className="border-t border-slate-800">
                    <td className="px-3 py-2 align-top">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs ${
                          isPaid
                            ? "bg-emerald-500/10 text-emerald-300"
                            : "bg-slate-800 text-slate-300"
                        }`}
                      >
                        {isPaid ? "Paid" : "Unpaid"}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top text-slate-300">{date}</td>
                    <td className="px-3 py-2 align-top">
                      <span className="inline-flex rounded-full bg-slate-800 px-2 py-0.5 text-xs uppercase tracking-wide text-slate-200">
                        {categoryLabel}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top text-slate-100">{expense.description}</td>
                    <td className="px-3 py-2 align-top text-slate-300">
                      {expense.payee || "—"}
                    </td>
                    <td className="px-3 py-2 align-top text-right text-slate-100">
                      ${Number(expense.amount || 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 align-top text-right">
                      <div className="flex justify-end gap-2 text-xs">
                        {isPaid ? (
                          <form action={markUnpaid}>
                            <input
                              type="hidden"
                              name="expenseId"
                              value={expense._id.toString()}
                            />
                            <input type="hidden" name="estateId" value={estateId} />
                            <button className="text-slate-400 hover:text-slate-200" type="submit">
                              Mark unpaid
                            </button>
                          </form>
                        ) : (
                          <form action={markPaid}>
                            <input
                              type="hidden"
                              name="expenseId"
                              value={expense._id.toString()}
                            />
                            <input type="hidden" name="estateId" value={estateId} />
                            <button className="text-emerald-400 hover:text-emerald-300" type="submit">
                              Mark paid
                            </button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}