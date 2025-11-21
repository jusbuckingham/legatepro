import Link from "next/link";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";
import { Task } from "@/models/Task";
import { Expense } from "@/models/Expense";
import { Contact } from "@/models/Contact";
import { RentPayment } from "@/models/RentPayment";

export const metadata = {
  title: "Dashboard | LegatePro",
};

type LeanEstate = {
  _id: unknown;
  caseName?: string | null;
  decedentName?: string | null;
  courtCaseNumber?: string | null;
  status?: string | null;
  createdAt?: Date | string;
};

type LeanTask = {
  _id: unknown;
  subject: string;
  date?: Date | string | null;
  status: "OPEN" | "DONE";
  priority?: "LOW" | "MEDIUM" | "HIGH";
  estateId?: unknown;
};

type LeanExpense = {
  _id: unknown;
  label?: string;
  category?: string;
  amount: number;
  date?: Date | string | null;
  estateId?: unknown;
};

type LeanRentPayment = {
  _id: unknown;
  amount: number;
  paymentDate?: Date | string | null;
  estateId?: unknown;
};

function getEstateDisplayName(estate: LeanEstate | null | undefined) {
  if (!estate) return "Untitled estate";
  return estate.caseName || estate.decedentName || estate.courtCaseNumber || "Untitled estate";
}

function formatShortDate(value: Date | string | null | undefined) {
  if (!value) return "No date";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "No date";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatCurrency(amount: number) {
  if (!amount || Number.isNaN(amount)) return "$0.00";
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

export default async function AppDashboardPage() {
  await connectToDatabase();

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const [
    estateCount,
    estatesRaw,
    openTaskCount,
    contactCount,
    upcomingTasksRaw,
    recentExpensesRaw,
    monthlyExpensesRaw,
    monthlyRentRaw,
    allRentRaw,
    allExpensesRaw,
  ] = await Promise.all([
    Estate.countDocuments({}),
    Estate.find({})
      .sort({ createdAt: -1 })
      .limit(4)
      .lean(),
    Task.countDocuments({ status: "OPEN" }),
    Contact.countDocuments({}),
    Task.find({
      status: "OPEN",
      date: { $gte: startOfToday },
    })
      .sort({ date: 1 })
      .limit(5)
      .populate("estateId", "caseName decedentName courtCaseNumber")
      .lean(),
    Expense.find({})
      .sort({ date: -1 })
      .limit(5)
      .populate("estateId", "caseName decedentName courtCaseNumber")
      .lean(),
    Expense.find({
      date: { $gte: startOfMonth },
    }).lean(),
    RentPayment.find({
      paymentDate: { $gte: startOfMonth },
    }).lean(),
    RentPayment.find({}).lean(),
    Expense.find({}).lean(),
  ]);

  const estates = estatesRaw as LeanEstate[];
  const upcomingTasks = upcomingTasksRaw as (LeanTask & { estateId?: LeanEstate | string })[];
  const recentExpenses = recentExpensesRaw as (LeanExpense & {
    estateId?: LeanEstate | string;
  })[];

  const monthlyExpenses = monthlyExpensesRaw as LeanExpense[];
  const monthlyRent = monthlyRentRaw as LeanRentPayment[];
  const allRent = allRentRaw as LeanRentPayment[];
  const allExpenses = allExpensesRaw as LeanExpense[];

  const expensesByCategoryThisMonth = monthlyExpenses.reduce<Record<string, number>>(
    (acc, exp) => {
      const key = exp.category || "Other";
      acc[key] = (acc[key] || 0) + (exp.amount || 0);
      return acc;
    },
    {},
  );

  const topCategoryEntry = Object.entries(expensesByCategoryThisMonth).sort(
    (a, b) => b[1] - a[1],
  )[0];

  const topCategoryLabel = topCategoryEntry?.[0] ?? null;
  const topCategoryAmount = topCategoryEntry?.[1] ?? 0;

  const largestExpenseThisMonth = monthlyExpenses.reduce<LeanExpense | null>(
    (largest, exp) => {
      if (!largest) return exp;
      const currentAmount = exp.amount || 0;
      const largestAmount = largest.amount || 0;
      return currentAmount > largestAmount ? exp : largest;
    },
    null,
  );

  const monthlyExpenseTotal = monthlyExpenses.reduce(
    (sum, exp) => sum + (exp.amount || 0),
    0,
  );

  const monthlyRentTotal = monthlyRent.reduce(
    (sum, payment) => sum + (payment.amount || 0),
    0,
  );

  const totalRentAllTime = allRent.reduce(
    (sum, payment) => sum + (payment.amount || 0),
    0,
  );

  const totalExpensesAllTime = allExpenses.reduce(
    (sum, exp) => sum + (exp.amount || 0),
    0,
  );

  const netThisMonth = monthlyRentTotal - monthlyExpenseTotal;
  const netAllTime = totalRentAllTime - totalExpensesAllTime;

  const userName = "there";

  return (
    <div className="space-y-8 p-4 md:p-6 lg:p-8">
      {/* Header / Hero */}
      <header className="flex flex-col gap-4 border-b border-slate-800 pb-6 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-rose-400">
            LegatePro Dashboard
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50 md:text-3xl">
            Welcome back, {userName}
          </h1>
          <p className="max-w-xl text-sm text-slate-300">
            See what&apos;s happening across all estates at a glance:
            upcoming tasks, recent activity, and where money is moving.
          </p>
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap gap-2">
          <Link
            href="/app/estates/new"
            className="inline-flex items-center rounded-full border border-rose-500/70 bg-rose-600/20 px-3 py-1.5 text-xs font-medium text-rose-100 shadow-sm shadow-rose-900/40 hover:bg-rose-600/40"
          >
            + New estate
          </Link>
          <Link
            href="/app/tasks"
            className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-100 hover:border-slate-500 hover:bg-slate-900"
          >
            View all tasks
          </Link>
          <Link
            href="/app/documents"
            className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-100 hover:border-slate-500 hover:bg-slate-900"
          >
            View documents
          </Link>
          <Link
            href="/app/contacts"
            className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-100 hover:border-slate-500 hover:bg-slate-900"
          >
            View contacts
          </Link>
        </div>
      </header>

      {/* Summary cards */}
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 shadow-sm shadow-slate-950/60">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Estates
          </p>
          <p className="mt-2 text-3xl font-semibold text-slate-50">
            {estateCount}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Active probate / trust estates under your care.
          </p>
          <div className="mt-3">
            <Link
              href="/app/estates"
              className="text-xs font-medium text-rose-300 hover:text-rose-200"
            >
              Go to estates →
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 shadow-sm shadow-slate-950/60">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Open tasks
          </p>
          <p className="mt-2 text-3xl font-semibold text-slate-50">
            {openTaskCount}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Things that still need to get done across all estates.
          </p>
          <div className="mt-3">
            <Link
              href="/app/tasks"
              className="text-xs font-medium text-rose-300 hover:text-rose-200"
            >
              Review tasks →
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 shadow-sm shadow-slate-950/60">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Contacts
          </p>
          <p className="mt-2 text-3xl font-semibold text-slate-50">
            {contactCount}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Personal reps, attorneys, heirs, creditors, and more.
          </p>
          <div className="mt-3">
            <Link
              href="/app/contacts"
              className="text-xs font-medium text-rose-300 hover:text-rose-200"
            >
              Manage contacts →
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 shadow-sm shadow-slate-950/60">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            This month cashflow
          </p>
          <p className="mt-2 text-2xl font-semibold text-emerald-300">
            {formatCurrency(netThisMonth)}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Rent: {formatCurrency(monthlyRentTotal)} • Expenses: {formatCurrency(monthlyExpenseTotal)}
            <br />
            Since {startOfMonth.toLocaleDateString("en-US", { month: "short", day: "numeric" })}.
          </p>
          {(topCategoryLabel || largestExpenseThisMonth) && (
            <div className="mt-2 space-y-1 text-[10px] text-slate-500">
              {topCategoryLabel && (
                <p>
                  Top spending category this month:{" "}
                  <span className="text-slate-300">{topCategoryLabel}</span>{" "}
                  ({formatCurrency(topCategoryAmount)})
                </p>
              )}
              {largestExpenseThisMonth && (
                <p>
                  Largest single expense:{" "}
                  <span className="text-slate-300">
                    {largestExpenseThisMonth.label || "Expense"}
                  </span>{" "}
                  ({formatCurrency(largestExpenseThisMonth.amount || 0)})
                </p>
              )}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/app/rent"
              className="text-xs font-medium text-rose-300 hover:text-rose-200"
            >
              View rent overview →
            </Link>
            <Link
              href="/app/expenses"
              className="text-xs font-medium text-rose-300 hover:text-rose-200"
            >
              View expenses overview →
            </Link>
          </div>
          <p className="mt-2 text-[10px] text-slate-500">
            All-time net: {formatCurrency(netAllTime)} (rent minus expenses).
          </p>
        </div>
      </section>

      {/* Main content: estates + activity */}
      <section className="grid gap-6 lg:grid-cols-3">
        {/* Left: latest estates */}
        <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 lg:col-span-1">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-100">
              Latest estates
            </h2>
            <Link
              href="/app/estates"
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              View all →
            </Link>
          </div>

          {estates.length === 0 ? (
            <p className="text-xs text-slate-400">
              No estates yet.{" "}
              <Link
                href="/app/estates/new"
                className="font-medium text-rose-300 hover:text-rose-200"
              >
                Create your first estate.
              </Link>
            </p>
          ) : (
            <ul className="space-y-2 text-xs">
              {estates.map((estate) => (
                <li
                  key={String(estate._id)}
                  className="rounded-xl border border-slate-800/80 bg-slate-900/60 px-3 py-2.5"
                >
                  <Link
                    href={`/app/estates/${String(estate._id)}`}
                    className="block space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-slate-50">
                        {getEstateDisplayName(estate)}
                      </p>
                      {estate.status && (
                        <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
                          {estate.status}
                        </span>
                      )}
                    </div>
                    {estate.courtCaseNumber && (
                      <p className="truncate text-[11px] text-slate-400">
                        Case: {estate.courtCaseNumber}
                      </p>
                    )}
                    {estate.createdAt && (
                      <p className="text-[11px] text-slate-500">
                        Opened{" "}
                        {formatShortDate(
                          typeof estate.createdAt === "string"
                            ? new Date(estate.createdAt)
                            : estate.createdAt,
                        )}
                      </p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Right: upcoming tasks + recent expenses */}
        <div className="space-y-6 lg:col-span-2">
          {/* Upcoming tasks */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-100">
                Upcoming tasks
              </h2>
              <Link
                href="/app/tasks"
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                View all →
              </Link>
            </div>

            {upcomingTasks.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">
                No upcoming tasks scheduled. Try adding follow-ups, hearings,
                or important deadlines to keep everything on track.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-800 text-xs">
                {upcomingTasks.map((task) => {
                  const estateObj =
                    task.estateId && typeof task.estateId === "object"
                      ? (task.estateId as LeanEstate)
                      : undefined;

                  const estateLabel = estateObj
                    ? getEstateDisplayName(estateObj)
                    : "Unassigned estate";

                  const priorityLabel = task.priority || "MEDIUM";

                  return (
                    <li
                      key={String(task._id)}
                      className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <div className="mt-[2px] h-2 w-2 flex-shrink-0 rounded-full bg-rose-400" />
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-slate-50">
                            {task.subject}
                          </p>
                          <span className="text-[10px] text-slate-400">
                            {formatShortDate(
                              task.date ? new Date(task.date) : null,
                            )}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          {estateLabel}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
                            {priorityLabel.toLowerCase()} priority
                          </span>
                          {task.status === "OPEN" && (
                            <span className="inline-flex items-center rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-200">
                              Open
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Recent expenses */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-100">
                Recent expenses
              </h2>
              <Link
                href="/app/estates"
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                Go to estate expenses →
              </Link>
            </div>

            {recentExpenses.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">
                No expenses logged yet. Track filing fees, maintenance, legal
                costs, and more from an estate&apos;s Expenses tab.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-y-1 text-xs">
                  <thead className="text-[11px] uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-2 py-1 text-left font-medium">
                        Expense
                      </th>
                      <th className="px-2 py-1 text-left font-medium">
                        Estate
                      </th>
                      <th className="px-2 py-1 text-right font-medium">
                        Amount
                      </th>
                      <th className="px-2 py-1 text-right font-medium">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentExpenses.map((exp) => {
                      const estateObj =
                        exp.estateId && typeof exp.estateId === "object"
                          ? (exp.estateId as LeanEstate)
                          : undefined;
                      const estateLabel = estateObj
                        ? getEstateDisplayName(estateObj)
                        : "Unassigned";

                      return (
                        <tr
                          key={String(exp._id)}
                          className="rounded-xl bg-slate-900/60 align-middle text-slate-100"
                        >
                          <td className="truncate px-2 py-1.5 text-[11px]">
                            <div className="flex flex-col">
                              <span className="truncate font-medium">
                                {exp.label || "Expense"}
                              </span>
                              {exp.category && (
                                <span className="text-[10px] uppercase tracking-wide text-slate-400">
                                  {exp.category}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="max-w-[160px] truncate px-2 py-1.5 text-[11px] text-slate-300">
                            {estateLabel}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-right text-[11px] text-emerald-300">
                            {formatCurrency(exp.amount || 0)}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-right text-[11px] text-slate-400">
                            {formatShortDate(
                              exp.date ? new Date(exp.date) : null,
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}