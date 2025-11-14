import Link from "next/link";
import { revalidatePath } from "next/cache";
import { connectToDatabase } from "../../../../../lib/db";
import { Expense } from "../../../../../models/Expense";

export const dynamic = "force-dynamic";

interface EstateExpensesPageProps {
  params: {
    estateId: string;
  };
}

interface ExpenseItem {
  _id: unknown;
  date?: string | Date;
  category?: string;
  payee?: string;
  description?: string;
  amount?: number;
  isReimbursable?: boolean;
}

function formatCurrency(value?: number) {
  if (value == null || Number.isNaN(value)) return "–";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function formatDate(value?: string | Date) {
  if (!value) return "–";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "–";
  return d.toLocaleDateString();
}

async function createExpense(formData: FormData) {
  "use server";

  const estateId = formData.get("estateId")?.toString();
  if (!estateId) return;

  const dateRaw = formData.get("date")?.toString();
  const category = formData.get("category")?.toString().trim() || "";
  const payee = formData.get("payee")?.toString().trim() || "";
  const description = formData.get("description")?.toString().trim() || "";
  const amountRaw = formData.get("amount")?.toString();
  const isReimbursable = formData.get("isReimbursable") === "on";

  const amount = amountRaw ? Number(amountRaw) : undefined;
  const date = dateRaw ? new Date(dateRaw) : undefined;

  // Minimal guard: at least an amount or description
  if (!description && (amount == null || Number.isNaN(amount))) {
    return;
  }

  await connectToDatabase();

  await Expense.create({
    estateId,
    date: date && !Number.isNaN(date.getTime()) ? date : undefined,
    category: category || undefined,
    payee: payee || undefined,
    description: description || undefined,
    amount:
      amount != null && !Number.isNaN(amount) ? Number(amount.toFixed(2)) : undefined,
    isReimbursable,
  });

  revalidatePath(`/app/estates/${estateId}/expenses`);
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
}

export default async function EstateExpensesPage({
  params,
}: EstateExpensesPageProps) {
  const { estateId } = params;

  await connectToDatabase();

  const expenses = (await Expense.find({ estateId })
    .sort({ date: 1, createdAt: 1 })
    .lean()) as ExpenseItem[];

  const hasExpenses = expenses.length > 0;

  const totalAmount = expenses.reduce((sum, expense) => {
    return sum + (expense.amount ?? 0);
  }, 0);

  const reimbursableTotal = expenses.reduce((sum, expense) => {
    if (!expense.isReimbursable) return sum;
    return sum + (expense.amount ?? 0);
  }, 0);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
          Expenses
        </h1>
        <p className="text-sm text-slate-400">
          Court costs, repairs, utilities paid out-of-pocket, travel, and any
          other estate expenses.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm">
          <p className="text-xs text-slate-400">Total expenses</p>
          <p className="mt-1 text-lg font-semibold text-slate-50">
            {formatCurrency(totalAmount)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm">
          <p className="text-xs text-slate-400">Reimbursable</p>
          <p className="mt-1 text-lg font-semibold text-slate-50">
            {formatCurrency(reimbursableTotal)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm">
          <p className="text-xs text-slate-400">Entries</p>
          <p className="mt-1 text-lg font-semibold text-slate-50">
            {expenses.length}
          </p>
        </div>
      </section>

      {/* Quick add expense form */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Add expense
        </h2>
        <form action={createExpense} className="space-y-3">
          <input type="hidden" name="estateId" value={estateId} />
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
                placeholder="Who was paid"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-50 outline-none focus:border-emerald-400"
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[1.4fr,0.6fr,0.6fr]">
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
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-50 outline-none focus:border-emerald-400"
                placeholder="0.00"
              />
            </div>
            <div className="flex items-end justify-between gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  name="isReimbursable"
                  className="h-3 w-3 rounded border-slate-600 bg-slate-950 text-emerald-500 focus:ring-emerald-500"
                />
                Reimbursable to PR
              </label>
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-emerald-400"
              >
                Add
              </button>
            </div>
          </div>
        </form>
      </section>

      {!hasExpenses ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 px-6 py-8 text-sm text-slate-300">
          <p className="font-medium text-slate-100">No expenses recorded yet.</p>
          <p className="mt-1 text-slate-400">
            As you pay filing fees, repairs, insurance, or other estate costs,
            log them here so you can show a clear ledger to the court.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/60 text-sm">
          <table className="min-w-full divide-y divide-slate-800">
            <thead className="bg-slate-950/80">
              <tr className="text-xs uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Category</th>
                <th className="px-3 py-2 text-left">Payee</th>
                <th className="px-3 py-2 text-left">Description</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-center">Reimbursable</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {expenses.map((expense) => (
                <tr key={String(expense._id)} className="text-xs text-slate-200">
                  <td className="whitespace-nowrap px-3 py-2">
                    {formatDate(expense.date)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {expense.category || "–"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {expense.payee || "–"}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/app/estates/${estateId}/expenses/${String(expense._id)}`}
                      className="text-emerald-300 underline-offset-2 hover:text-emerald-200 hover:underline"
                    >
                      {expense.description || "(no description)"}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {formatCurrency(expense.amount)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-center">
                    {expense.isReimbursable ? (
                      <span className="inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                        Yes
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                        No
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <form action={deleteExpense}>
                      <input type="hidden" name="estateId" value={estateId} />
                      <input
                        type="hidden"
                        name="expenseId"
                        value={String(expense._id)}
                      />
                      <button
                        type="submit"
                        className="text-[11px] text-rose-400 underline-offset-2 hover:text-rose-300 hover:underline"
                      >
                        Remove
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}