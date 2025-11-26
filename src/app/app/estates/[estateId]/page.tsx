import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";
import { Task } from "@/models/Task";
import { TimeEntry } from "@/models/TimeEntry";
import type { EstateDocument } from "@/models/Estate";
import type { TaskDocument } from "@/models/Task";
import type { TimeEntryDocument } from "@/models/TimeEntry";
import {
  addDays,
  format,
  isAfter,
  isBefore,
  startOfDay,
} from "date-fns";

type EstateOverviewDoc = EstateDocument & {
  displayName?: string;
  caseName?: string;
  propertyAddress?: string;
  openedAt?: Date | string | null;
  createdAt?: Date | string | null;
  courtCaseNumber?: string;
  county?: string;
};

type TaskWithMeta = TaskDocument & {
  completedAt?: Date | string | null;
  dueDate?: Date | string | null;
  notes?: string | null;
};

type TimeEntryWithMoney = TimeEntryDocument & {
  amount?: number | null;
  rate?: number | null;
  minutes?: number | null;
  activityType?: string | null;
  notes?: string | null;
  date?: Date | string | null;
};

type PageProps = {
  params: Promise<{ estateId: string }>;
};

export default async function EstateOverviewPage({ params }: PageProps) {
  const { estateId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const ownerId = session.user.id;

  await connectToDatabase();

  const estateDoc = await Estate.findOne({
    _id: estateId,
    ownerId,
  }).lean();

  if (!estateDoc) {
    notFound();
  }

  const [taskDocs, timeDocs] = await Promise.all([
    Task.find({ estateId, ownerId }).lean(),
    TimeEntry.find({ estateId, ownerId }).lean(),
  ]);

  const tasks = taskDocs as unknown as TaskWithMeta[];
  const timeEntries = timeDocs as unknown as TimeEntryWithMoney[];

  const estate = estateDoc as unknown as EstateOverviewDoc;

  const estateDisplayName =
    estate.displayName ||
    estate.caseName ||
    estate.propertyAddress ||
    "Estate";

  const openedAtValue = estate.openedAt || estate.createdAt;
  const openedAt = openedAtValue ? new Date(openedAtValue) : null;

  const now = new Date();
  const todayStart = startOfDay(now);
  const next7 = addDays(todayStart, 7);

  // ---- Task analytics ----
  const totalTasks = tasks.length;
  const openTasks = tasks.filter((t) => t.status === "OPEN").length;
  const doneTasks = tasks.filter((t) => t.status === "DONE").length;
  const overdueTasks = tasks.filter((t) => {
    if (t.status !== "OPEN" || !t.dueDate) return false;
    const due = new Date(t.dueDate);
    return isBefore(due, todayStart);
  }).length;

  const highPriorityTasks = tasks.filter(
    (t) => t.priority === "HIGH" || t.priority === "CRITICAL",
  ).length;

  const tasksDueSoon = tasks.filter((t) => {
    if (t.status !== "OPEN" || !t.dueDate) return false;
    const due = new Date(t.dueDate);
    return !isBefore(due, todayStart) && !isAfter(due, next7);
  }).length;

  const completionRate = totalTasks
    ? Math.round((doneTasks / totalTasks) * 100)
    : 0;

  // Sample lists
  const openTasksSample = tasks
    .filter((t) => t.status === "OPEN")
    .sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return (
        new Date(a.dueDate).getTime() -
        new Date(b.dueDate).getTime()
      );
    })
    .slice(0, 5);

  const recentlyCompletedTasks = tasks
    .filter((t) => t.status === "DONE" && t.completedAt)
    .sort(
      (a, b) =>
        new Date(b.completedAt as Date).getTime() -
        new Date(a.completedAt as Date).getTime(),
    )
    .slice(0, 5);

  // ---- Time analytics ----
  const totalMinutes = timeEntries.reduce(
    (sum, entry) =>
      sum + (typeof entry.minutes === "number" ? entry.minutes : 0),
    0,
  );
  const totalHours = totalMinutes / 60;

  const totalAmount = timeEntries.reduce((sum, entry) => {
    const amountValue =
      typeof entry.amount === "number"
        ? entry.amount
        : typeof entry.rate === "number" &&
          typeof entry.minutes === "number"
        ? (entry.rate * entry.minutes) / 60
        : 0;
    return sum + amountValue;
  }, 0);

  const sevenDaysAgo = addDays(todayStart, -7);

  const recentMinutes = timeEntries.reduce((sum, entry) => {
    if (!entry.date) return sum;
    const date = new Date(entry.date);
    if (isBefore(date, sevenDaysAgo)) return sum;
    return (
      sum +
      (typeof entry.minutes === "number" ? entry.minutes : 0)
    );
  }, 0);

  const recentHours = recentMinutes / 60;

  const activityBuckets: Record<
    string,
    { minutes: number; amount: number }
  > = {};
  for (const entry of timeEntries) {
    const key = entry.activityType || "Other";
    if (!activityBuckets[key]) {
      activityBuckets[key] = { minutes: 0, amount: 0 };
    }
    const minutes =
      typeof entry.minutes === "number" ? entry.minutes : 0;
    const amountValue =
      typeof entry.amount === "number"
        ? entry.amount
        : typeof entry.rate === "number" &&
          typeof entry.minutes === "number"
        ? (entry.rate * entry.minutes) / 60
        : 0;

    activityBuckets[key].minutes += minutes;
    activityBuckets[key].amount += amountValue;
  }

  const activityEntries = Object.entries(activityBuckets) as [
    string,
    { minutes: number; amount: number }
  ][];

  const topActivities = activityEntries
    .sort((a, b) => b[1].minutes - a[1].minutes)
    .slice(0, 4);

  const hourlyRateEstimate =
    totalHours > 0 ? totalAmount / totalHours : 0;

  const recentTimeEntries = timeEntries
    .slice()
    .sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return (
        new Date(b.date).getTime() -
        new Date(a.date).getTime()
      );
    })
    .slice(0, 5);

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-col justify-between gap-4 border-b border-slate-800 pb-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Estate Overview
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-50">
            {estateDisplayName}
          </h1>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
            {openedAt && (
              <span>
                Opened {format(openedAt, "MMM d, yyyy")} •
              </span>
            )}
            {estate.courtCaseNumber && (
              <span>
                Case #{estate.courtCaseNumber}
              </span>
            )}
            {estate.county && (
              <span>• {estate.county} County</span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/app/estates/${estateId}/tasks/new`}
            className="inline-flex items-center rounded-full bg-emerald-500 px-3 py-1 text-xs font-medium text-emerald-950 shadow-sm hover:bg-emerald-400"
          >
            + New Task
          </Link>
          <Link
            href={`/app/estates/${estateId}/time/new`}
            className="inline-flex items-center rounded-full bg-sky-500 px-3 py-1 text-xs font-medium text-sky-950 shadow-sm hover:bg-sky-400"
          >
            + Log Time
          </Link>
          <Link
            href={`/app/estates/${estateId}/time`}
            className="inline-flex items-center rounded-full border border-slate-700 px-3 py-1 text-xs font-medium text-slate-200 hover:border-slate-500"
          >
            View Time Ledger
          </Link>
        </div>
      </header>

      {/* Key metrics row */}
      <section aria-labelledby="estate-analytics-heading">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2
            id="estate-analytics-heading"
            className="text-sm font-semibold text-slate-100"
          >
            Estate Analytics
          </h2>
          <span className="text-[11px] uppercase tracking-wide text-slate-500">
            Owner workspace
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
          {/* Tasks summary */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Tasks
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-50">
              {totalTasks}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {openTasks} open • {overdueTasks} overdue
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{ width: `${completionRate}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              {completionRate}% of tasks completed
            </p>
          </div>

          {/* Time summary */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Time Logged
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-50">
              {totalHours.toFixed(1)}
              <span className="ml-1 text-xs font-normal text-slate-400">
                hrs
              </span>
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {recentHours.toFixed(1)} hrs in the last 7 days
            </p>
            <p className="mt-2 text-xs text-emerald-300">
              ${totalAmount.toFixed(2)} estimated billable value
            </p>
          </div>

          {/* Priority snapshot */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Priority Snapshot
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-50">
              {highPriorityTasks}
              <span className="ml-1 text-xs font-normal text-rose-300">
                high / critical
              </span>
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {tasksDueSoon} due in the next 7 days
            </p>
          </div>

          {/* Effective hourly rate */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Effective Hourly Rate
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-50">
              {hourlyRateEstimate > 0
                ? `$${hourlyRateEstimate.toFixed(0)}/hr`
                : "—"}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Based on logged time & billable value
            </p>
          </div>
        </div>
      </section>

      {/* Activity + Tasks detail */}
      <section className="grid gap-4 lg:grid-cols-2">
        {/* Open tasks list */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-100">
              Open Tasks
            </h3>
            <Link
              href={`/app/estates/${estateId}/tasks`}
              className="text-xs font-medium text-sky-400 hover:text-sky-300"
            >
              View all
            </Link>
          </div>
          {openTasksSample.length === 0 ? (
            <p className="text-xs text-slate-500">
              No open tasks yet. Create one to track your next action.
            </p>
          ) : (
            <ul className="divide-y divide-slate-800/80 text-xs">
              {openTasksSample.map((task) => (
                <li
                  key={String(task._id)}
                  className="flex items-start justify-between gap-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-100">
                      {task.subject}
                    </p>
                    {task.notes && (
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-400">
                        {task.notes}
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      {task.dueDate && (
                        <span>
                          Due{" "}
                          {format(
                            new Date(task.dueDate),
                            "MMM d",
                          )}
                        </span>
                      )}
                      <span
                        className={
                          task.priority === "HIGH" ||
                          task.priority === "CRITICAL"
                            ? "rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-medium text-rose-300"
                            : task.priority === "MEDIUM"
                            ? "rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300"
                            : "rounded-full bg-slate-700/60 px-2 py-0.5 text-[11px] font-medium text-slate-200"
                        }
                      >
                        {task.priority}
                      </span>
                    </div>
                  </div>
                  <Link
                    href={`/app/estates/${estateId}/tasks/${task._id}`}
                    className="mt-0.5 text-[11px] font-medium text-sky-400 hover:text-sky-300"
                  >
                    View
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent time entries + activity breakdown */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-100">
                Recent Time Entries
              </h3>
              <Link
                href={`/app/estates/${estateId}/time`}
                className="text-xs font-medium text-sky-400 hover:text-sky-300"
              >
                View ledger
              </Link>
            </div>
            {recentTimeEntries.length === 0 ? (
              <p className="text-xs text-slate-500">
                No time logged yet for this estate.
              </p>
            ) : (
              <ul className="divide-y divide-slate-800/80 text-xs">
                {recentTimeEntries.map((entry) => (
                  <li
                    key={String(entry._id)}
                    className="flex items-start justify-between gap-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-slate-100">
                        {entry.activityType || "Time Entry"}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-400">
                        {entry.notes || "No notes added"}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                        {entry.date && (
                          <span>
                            {format(
                              new Date(entry.date),
                              "MMM d, yyyy",
                            )}
                          </span>
                        )}
                        <span>
                          {((entry.minutes || 0) / 60).toFixed(2)} hrs
                        </span>
                        {typeof entry.amount === "number" && (
                          <span>
                            ${entry.amount.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                    <Link
                      href={`/app/estates/${estateId}/time/${entry._id}`}
                      className="mt-0.5 text-[11px] font-medium text-sky-400 hover:text-sky-300"
                    >
                      View
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-100">
              Time by Activity
            </h3>
            {topActivities.length === 0 ? (
              <p className="text-xs text-slate-500">
                Once you log time, you’ll see a breakdown of where
                effort is going.
              </p>
            ) : (
              <ul className="space-y-2 text-xs">
                {topActivities.map(([label, data]) => (
                  <li
                    key={label}
                    className="flex items-center justify-between gap-3"
                  >
                    <div className="flex-1">
                      <p className="text-slate-100">{label}</p>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full bg-sky-500"
                          style={{
                            width:
                              totalMinutes > 0
                                ? `${
                                    (data.minutes /
                                      totalMinutes) *
                                    100
                                  }%`
                                : "0%",
                          }}
                        />
                      </div>
                    </div>
                    <div className="text-right text-[11px] text-slate-400">
                      <div>
                        {(data.minutes / 60).toFixed(1)} hrs
                      </div>
                      <div>${data.amount.toFixed(2)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* Recently completed tasks (optional extra strip) */}
      {recentlyCompletedTasks.length > 0 && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-100">
            Recently Completed
          </h3>
          <ul className="flex flex-wrap gap-2 text-[11px] text-slate-300">
            {recentlyCompletedTasks.map((task) => (
              <li
                key={String(task._id)}
                className="rounded-full border border-emerald-700/60 bg-emerald-900/20 px-3 py-1"
              >
                {task.subject}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}