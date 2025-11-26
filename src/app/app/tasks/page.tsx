import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Estate, EstateDocument } from "@/models/Estate";
import { Task, TaskDocLean, TaskPriority } from "@/models/Task";
import { format, isBefore, startOfDay, addDays } from "date-fns";

type PageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

type TaskStatusFilter = "ALL" | "OPEN" | "DONE";
type TaskPriorityFilter = "ALL" | "LOW" | "MEDIUM" | "HIGH";
type TaskSortOption = "dueDateAsc" | "dueDateDesc" | "priority" | "recent";

// Helper to safely derive an estate label without TS errors on extra fields
function getEstateLabel(estate: EstateDocument): string {
  // We know some estate documents may have additional fields like displayName
  // and caseName that aren't declared on the TS type. We read them via a
  // widened shape to avoid TS2339 while still supporting the data.
  const e = estate as unknown as {
    displayName?: string;
    caseName?: string;
    propertyAddress?: string;
  };

  return e.displayName || e.caseName || e.propertyAddress || "Estate";
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

type AnalyticsCardProps = {
  label: string;
  value: number;
  helper?: string;
};

function AnalyticsCard({ label, value, helper }: AnalyticsCardProps) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
      <div className="text-[0.65rem] uppercase tracking-[0.2em] text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold text-slate-50">{value}</div>
      {helper && (
        <div className="mt-0.5 text-[0.7rem] text-slate-400">{helper}</div>
      )}
    </div>
  );
}

export default async function GlobalTasksPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session || !session.user?.id) {
    redirect("/login");
  }

  const sp = (searchParams
    ? await searchParams
    : {}) as Record<string, string | string[] | undefined>;

  const statusParam =
    typeof sp.status === "string" ? sp.status.toUpperCase() : "ALL";

  const statusFilter: TaskStatusFilter =
    statusParam === "OPEN" || statusParam === "DONE" ? statusParam : "ALL";

  const priorityParam =
    typeof sp.priority === "string" ? sp.priority.toUpperCase() : "ALL";

  const priorityFilter: TaskPriorityFilter =
    priorityParam === "LOW" ||
    priorityParam === "MEDIUM" ||
    priorityParam === "HIGH"
      ? (priorityParam as TaskPriorityFilter)
      : "ALL";

  const sortParam = typeof sp.sort === "string" ? sp.sort : "dueDateAsc";

  const sortBy: TaskSortOption = [
    "dueDateAsc",
    "dueDateDesc",
    "priority",
    "recent",
  ].includes(sortParam)
    ? (sortParam as TaskSortOption)
    : "dueDateAsc";

  await connectToDatabase();

  const taskDocs = (await Task.find({
    ownerId: session.user.id,
  })
    .sort({ createdAt: -1 })
    .lean()
    .exec()) as unknown as TaskDocLean[];

  const estateIds = Array.from(
    new Set(taskDocs.map((t) => String(t.estateId)).filter((id) => Boolean(id))),
  );

  const estateDocs = (await Estate.find({
    _id: { $in: estateIds },
  })
    .lean()
    .exec()) as unknown as EstateDocument[];

  const estateMap = new Map<string, EstateDocument>();
  for (const e of estateDocs) {
    estateMap.set(String(e._id), e);
  }

  const today = startOfDay(new Date());
  const weekAhead = addDays(today, 7);

  const filtered = taskDocs
    .filter((task) => {
      if (statusFilter === "ALL") return true;
      return task.status === statusFilter;
    })
    .filter((task) => {
      if (priorityFilter === "ALL") return true;
      return task.priority === priorityFilter;
    });

  const priorityRank: Record<TaskPriority, number> = {
    CRITICAL: 0,
    HIGH: 1,
    MEDIUM: 2,
    LOW: 3,
  };

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "recent") {
      const aCreated = toDate(a.createdAt) ?? today;
      const bCreated = toDate(b.createdAt) ?? today;
      return bCreated.getTime() - aCreated.getTime();
    }

    if (sortBy === "priority") {
      const aRank = priorityRank[a.priority];
      const bRank = priorityRank[b.priority];
      if (aRank !== bRank) return aRank - bRank;

      const aDue = toDate(a.dueDate) ?? weekAhead;
      const bDue = toDate(b.dueDate) ?? weekAhead;
      return aDue.getTime() - bDue.getTime();
    }

    const aDue = toDate(a.dueDate) ?? weekAhead;
    const bDue = toDate(b.dueDate) ?? weekAhead;

    if (sortBy === "dueDateDesc") {
      return bDue.getTime() - aDue.getTime();
    }

    // dueDateAsc default
    return aDue.getTime() - bDue.getTime();
  });

  const totalTasks = taskDocs.length;
  const openTasks = taskDocs.filter((t) => t.status === "OPEN").length;
  const doneTasks = taskDocs.filter((t) => t.status === "DONE").length;

  const completionRate =
    totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100);

  const overdueTasks = taskDocs.filter((t) => {
    const due = toDate(t.dueDate);
    if (!due) return false;
    return isBefore(due, today) && t.status !== "DONE";
  }).length;

  const dueThisWeek = taskDocs.filter((t) => {
    const due = toDate(t.dueDate);
    if (!due) return false;
    return due >= today && due <= weekAhead;
  }).length;

  const highOrCriticalOpen = taskDocs.filter(
    (t) =>
      t.status === "OPEN" &&
      (t.priority === "HIGH" || t.priority === "CRITICAL"),
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
            Tasks · All Estates
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-slate-50">
            Global Tasks
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Cross-estate workboard. See everything that’s on your plate in one
            view.
          </p>
        </div>
      </div>

      {/* Analytics */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AnalyticsCard
          label="All tasks"
          value={totalTasks}
          helper={`${doneTasks} completed (${completionRate}%)`}
        />
        <AnalyticsCard
          label="Open vs completed"
          value={openTasks}
          helper={`${doneTasks} done`}
        />
        <AnalyticsCard
          label="Overdue & due soon"
          value={overdueTasks}
          helper={
            dueThisWeek > 0
              ? `${dueThisWeek} due in next 7 days`
              : "No tasks due in the next 7 days"
          }
        />
        <AnalyticsCard
          label="High & critical priority (open)"
          value={highOrCriticalOpen}
          helper="Across all estates"
        />
      </section>

      {/* Filters */}
      <form
        method="GET"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs"
      >
        <div className="flex flex-col">
          <label className="mb-1 font-medium text-slate-300">Status</label>
          <select
            name="status"
            defaultValue={statusFilter}
            className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
          >
            <option value="ALL">All</option>
            <option value="OPEN">Open</option>
            <option value="DONE">Done</option>
          </select>
        </div>

        <div className="flex flex-col">
          <label className="mb-1 font-medium text-slate-300">Priority</label>
          <select
            name="priority"
            defaultValue={priorityFilter}
            className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
          >
            <option value="ALL">All</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>

        <div className="flex flex-col">
          <label className="mb-1 font-medium text-slate-300">Sort</label>
          <select
            name="sort"
            defaultValue={sortBy}
            className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
          >
            <option value="dueDateAsc">Due date · earliest first</option>
            <option value="dueDateDesc">Due date · latest first</option>
            <option value="priority">Priority · high → low</option>
            <option value="recent">Recently created</option>
          </select>
        </div>

        <button
          type="submit"
          className="inline-flex items-center rounded-md bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg:white"
        >
          Apply
        </button>

        <Link
          href="/app/tasks"
          className="text-xs text-slate-400 hover:text-slate-200"
        >
          Reset
        </Link>
      </form>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/80">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/70 text-[0.7rem] uppercase tracking-[0.18em] text-slate-400">
              <th className="px-3 py-2 text-left">Task</th>
              <th className="px-3 py-2 text-left">Estate</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Priority</th>
              <th className="px-3 py-2 text-left">Due</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-4 text-center text-xs text-slate-500"
                >
                  No tasks match these filters yet.
                </td>
              </tr>
            ) : (
              sorted.map((task) => {
                const estate = estateMap.get(String(task.estateId));
                const due = toDate(task.dueDate);
                const overdue =
                  !!due && isBefore(due, today) && task.status !== "DONE";

                return (
                  <tr
                    key={String(task._id)}
                    className="border-t border-slate-900/80 hover:bg-slate-900/70"
                  >
                    <td className="px-3 py-2 align-top">
                      <div className="font-medium text-slate-50">
                        {task.subject}
                      </div>
                      {task.description && (
                        <div className="mt-0.5 line-clamp-2 text-[0.7rem] text-slate-400">
                          {task.description}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-slate-200">
                      {estate ? (
                        <Link
                          href={`/app/estates/${estate._id}/tasks`}
                          className="text-[0.75rem] text-sky-300 hover:text-sky-200"
                        >
                          {getEstateLabel(estate)}
                        </Link>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span
                        className={
                          task.status === "DONE"
                            ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-[0.65rem] font-semibold text-emerald-400"
                            : "rounded-full bg-amber-500/10 px-2 py-0.5 text-[0.65rem] font-semibold text-amber-300"
                        }
                      >
                        {task.status === "DONE" ? "Done" : "Open"}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span
                        className={
                          task.priority === "HIGH" ||
                          task.priority === "CRITICAL"
                            ? "rounded-full bg-fuchsia-500/10 px-2 py-0.5 text-[0.65rem] font-semibold text-fuchsia-300"
                            : task.priority === "MEDIUM"
                            ? "rounded-full bg-sky-500/10 px-2 py-0.5 text-[0.65rem] font-semibold text-sky-300"
                            : "rounded-full bg-slate-500/10 px-2 py-0.5 text-[0.65rem] font-semibold text-slate-200"
                        }
                      >
                        {task.priority.charAt(0) +
                          task.priority.slice(1).toLowerCase()}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top text-slate-200">
                      {due ? (
                        <span
                          className={
                            overdue ? "text-rose-400" : "text-slate-200"
                          }
                        >
                          {format(due, "MMM d, yyyy")}
                        </span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-right">
                      <div className="inline-flex gap-2">
                        <Link
                          href={`/app/estates/${task.estateId}/tasks/${task._id}`}
                          className="text-[0.7rem] font-medium text-slate-200 hover:text-white"
                        >
                          View
                        </Link>
                        <span className="text-slate-600">·</span>
                        <Link
                          href={`/app/estates/${task.estateId}/tasks/${task._id}/edit`}
                          className="text-[0.7rem] font-medium text-sky-300 hover:text-sky-200"
                        >
                          Edit
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}