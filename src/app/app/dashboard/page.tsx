import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";
import { Expense } from "@/models/Expense";
import { TimeEntry } from "@/models/TimeEntry";
import { Task } from "@/models/Task";
import { format } from "date-fns";

type TaskStatus = "OPEN" | "DONE";
type TaskPriority = "LOW" | "MEDIUM" | "HIGH";

interface TaskListItem {
  _id: string;
  subject: string;
  status: TaskStatus;
  priority: TaskPriority;
  date?: Date | string | null;
}

interface TimeEntryListItem {
  _id: string;
  minutes: number;
  date?: Date | string | null;
  notes?: string | null;
}

interface ExpenseListItem {
  _id: string;
  description?: string | null;
  amount: number;
  incurredAt?: Date | string | null;
  category?: string | null;
}

function formatDate(value?: Date | string | null): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "MMM d, yyyy");
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function minutesToHours(minutes: number): number {
  if (!minutes || Number.isNaN(minutes)) return 0;
  return minutes / 60;
}

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const userId = session.user.id;
  await connectToDatabase();

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const sevenDaysAgo = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 7,
  );

  // Run the heavy queries in parallel
  const [
    estateCount,
    openTaskCount,
    doneTaskThisWeekCount,
    overdueTaskCount,
    timeEntriesMonth,
    timeEntriesAllTime,
    expensesThisMonth,
    recentTasksRaw,
    recentTimeEntriesRaw,
    recentExpensesRaw,
  ] = await Promise.all([
    Estate.countDocuments({ ownerId: userId }),
    Task.countDocuments({ ownerId: userId, status: "OPEN" as TaskStatus }),
    Task.countDocuments({
      ownerId: userId,
      status: "DONE" as TaskStatus,
      updatedAt: { $gte: sevenDaysAgo },
    }),
    Task.countDocuments({
      ownerId: userId,
      status: "OPEN" as TaskStatus,
      date: { $lt: startOfToday },
    }),
    TimeEntry.find({
      ownerId: userId,
      date: { $gte: startOfMonth },
    })
      .sort({ date: -1 })
      .lean(),
    TimeEntry.find({
      ownerId: userId,
    })
      .sort({ date: -1 })
      .lean(),
    Expense.find({
      ownerId: userId,
      incurredAt: { $gte: startOfMonth },
    })
      .sort({ incurredAt: -1 })
      .lean(),
    Task.find({
      ownerId: userId,
    })
      .sort({ updatedAt: -1 })
      .limit(5)
      .lean(),
    TimeEntry.find({
      ownerId: userId,
    })
      .sort({ date: -1 })
      .limit(5)
      .lean(),
    Expense.find({
      ownerId: userId,
    })
      .sort({ incurredAt: -1 })
      .limit(5)
      .lean(),
  ]);

  // Light shaping for list items with safe casting
  const recentTasks = (recentTasksRaw as unknown as TaskListItem[]).map(
    (task) => ({
      ...task,
      date: task.date ?? null,
    }),
  );

  const recentTimeEntries = (
    recentTimeEntriesRaw as unknown as TimeEntryListItem[]
  ).map((entry) => ({
    ...entry,
    date: entry.date ?? null,
    notes: entry.notes ?? null,
  }));

  const recentExpenses = (
    recentExpensesRaw as unknown as ExpenseListItem[]
  ).map((exp) => ({
    ...exp,
    description: exp.description ?? null,
    incurredAt: exp.incurredAt ?? null,
    category: exp.category ?? null,
  }));

  // Aggregate time + expenses
  const totalMinutesThisMonth = (timeEntriesMonth as unknown as TimeEntryListItem[]).reduce(
    (sum, entry) => sum + (entry.minutes || 0),
    0,
  );
  const totalMinutesAllTime = (timeEntriesAllTime as unknown as TimeEntryListItem[]).reduce(
    (sum, entry) => sum + (entry.minutes || 0),
    0,
  );

  const totalHoursThisMonth = minutesToHours(totalMinutesThisMonth);
  const totalHoursAllTime = minutesToHours(totalMinutesAllTime);

  const totalExpensesThisMonth = (expensesThisMonth as unknown as ExpenseListItem[]).reduce(
    (sum, exp) => sum + (exp.amount || 0),
    0,
  );

  const openTasksPercentage =
    openTaskCount + doneTaskThisWeekCount > 0
      ? Math.round(
          (openTaskCount / (openTaskCount + doneTaskThisWeekCount)) * 100,
        )
      : 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-300/80">
            High-level overview of your estates, time, tasks, and spending.
          </p>
        </div>
        <div className="text-right text-xs text-slate-400">
          <div>As of {format(now, "MMM d, yyyy, h:mm a")}</div>
        </div>
      </div>

      {/* KPI cards */}
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Active Estates
          </div>
          <div className="mt-2 text-3xl font-semibold text-slate-50">
            {estateCount}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Matters you&apos;re currently tracking in LegatePro.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Hours Logged (This Month)
          </div>
          <div className="mt-2 text-3xl font-semibold text-slate-50">
            {totalHoursThisMonth.toFixed(1)}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            From {timeEntriesMonth.length} time entries logged since{" "}
            {format(startOfMonth, "MMM d, yyyy")}.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Open Tasks
          </div>
          <div className="mt-2 text-3xl font-semibold text-slate-50">
            {openTaskCount}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {openTasksPercentage}% of your work items are still open.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Expenses (This Month)
          </div>
          <div className="mt-2 text-3xl font-semibold text-slate-50">
            {formatCurrency(totalExpensesThisMonth)}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            From {expensesThisMonth.length} expense records since{" "}
            {format(startOfMonth, "MMM d, yyyy")}.
          </p>
        </div>
      </section>

      {/* Detailed sections */}
      <section className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Time overview */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-50">Time Overview</h2>
            </div>
            <dl className="grid grid-cols-2 gap-4 text-sm text-slate-400">
              <div>
                <dt>Hours Logged (This Month)</dt>
                <dd className="mt-1 text-lg font-medium text-slate-50">
                  {totalHoursThisMonth.toFixed(1)}
                </dd>
              </div>
              <div>
                <dt>Hours Logged (All Time)</dt>
                <dd className="mt-1 text-lg font-medium text-slate-50">
                  {totalHoursAllTime.toFixed(1)}
                </dd>
              </div>
            </dl>
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-semibold text-slate-50">
                Recent Time Entries
              </h3>
              <table className="w-full table-fixed border-collapse text-sm text-slate-300">
                <thead>
                  <tr>
                    <th className="w-1/4 border-b border-slate-700 pb-1 text-left">
                      Date
                    </th>
                    <th className="w-1/4 border-b border-slate-700 pb-1 text-right">
                      Hours
                    </th>
                    <th className="border-b border-slate-700 pb-1 text-left">
                      Notes
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recentTimeEntries.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-2 text-center text-slate-500">
                        No recent time entries.
                      </td>
                    </tr>
                  )}
                  {recentTimeEntries.map((entry: TimeEntryListItem) => (
                    <tr key={entry._id} className="border-b border-slate-800 last:border-0">
                      <td className="py-1">{formatDate(entry.date)}</td>
                      <td className="py-1 text-right">
                        {minutesToHours(entry.minutes).toFixed(2)}
                      </td>
                      <td className="py-1 truncate" title={entry.notes ?? undefined}>
                        {entry.notes ? entry.notes.slice(0, 80) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tasks overview */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <h2 className="mb-4 text-lg font-semibold text-slate-50">Recent Tasks</h2>
            {recentTasks.length === 0 ? (
              <p className="text-sm text-slate-500">No recent tasks found.</p>
            ) : (
              <ul className="divide-y divide-slate-800 text-sm text-slate-300">
                {recentTasks.map((task: TaskListItem) => (
                  <li key={task._id} className="flex justify-between py-2">
                    <div>
                      <span
                        className={`inline-block rounded px-2 py-0.5 font-medium ${
                          task.priority === "HIGH"
                            ? "bg-red-600 text-red-100"
                            : task.priority === "MEDIUM"
                            ? "bg-yellow-600 text-yellow-100"
                            : "bg-slate-700 text-slate-200"
                        }`}
                      >
                        {task.priority}
                      </span>{" "}
                      <span
                        className={`${
                          task.status === "DONE" ? "line-through text-slate-500" : ""
                        }`}
                      >
                        {task.subject}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400">
                      {formatDate(task.date)}
                      {task.status === "OPEN" && overdueTaskCount > 0 && (
                        <span className="ml-2 rounded bg-red-700 px-1 text-xs font-semibold text-red-300">
                          Overdue
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Expenses */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <h2 className="mb-4 text-lg font-semibold text-slate-50">Recent Expenses</h2>
            {recentExpenses.length === 0 ? (
              <p className="text-sm text-slate-500">No recent expenses found.</p>
            ) : (
              <ul className="divide-y divide-slate-800 text-sm text-slate-300">
                {recentExpenses.map((exp: ExpenseListItem) => (
                  <li key={exp._id} className="flex justify-between py-2">
                    <div>
                      <div className="font-medium text-slate-50">
                        {exp.description ?? "No description"}
                      </div>
                      <div className="text-xs text-slate-400">
                        {exp.category ?? "Uncategorized"}
                      </div>
                    </div>
                    <div className="text-right text-sm text-slate-200">
                      <div>{formatCurrency(exp.amount)}</div>
                      <div className="text-xs text-slate-400">
                        {formatDate(exp.incurredAt)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
