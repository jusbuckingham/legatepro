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
                    {expense.description || ""}
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}