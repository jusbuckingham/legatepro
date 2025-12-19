import type { Metadata } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Task } from "@/models/Task";
import { Estate } from "@/models/Estate";

export const metadata: Metadata = {
  title: "Tasks | LegatePro",
};

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
};

type TaskRow = {
  id: string;
  title: string;
  status: string;
  dueDate: Date | null;
  priority: string | null;
  estateId: string | null;
  estateName: string | null;
  createdAt: Date | null;
};

type TaskDocLike = {
  _id: unknown;
  title?: unknown;
  status?: unknown;
  dueDate?: unknown;
  priority?: unknown;
  estateId?: unknown;
  createdAt?: unknown;
};

type EstateDocLike = {
  _id: unknown;
  displayName?: unknown;
  caseName?: unknown;
};

function formatDate(value: Date | null): string {
  if (!value || Number.isNaN(value.getTime())) {
    return "";
  }

  return value.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function humanizeStatus(status: string): string {
  switch (status) {
    case "OPEN":
      return "Open";
    case "IN_PROGRESS":
      return "In progress";
    case "BLOCKED":
      return "Blocked";
    case "DONE":
      return "Completed";
    case "CANCELLED":
      return "Cancelled";
    default:
      return status.charAt(0) + status.slice(1).toLowerCase();
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "OPEN":
      return "bg-amber-500/10 text-amber-300 border-amber-500/40";
    case "IN_PROGRESS":
      return "bg-sky-500/10 text-sky-300 border-sky-500/40";
    case "BLOCKED":
      return "bg-rose-500/10 text-rose-300 border-rose-500/40";
    case "DONE":
      return "bg-emerald-500/10 text-emerald-300 border-emerald-500/40";
    case "CANCELLED":
      return "bg-slate-600/20 text-slate-300 border-slate-500/40";
    default:
      return "bg-slate-700/40 text-slate-200 border-slate-500/40";
  }
}

function isOverdue(due: Date | null): boolean {
  if (!due || Number.isNaN(due.getTime())) return false;
  const now = new Date();
  return due.getTime() < now.getTime();
}

function isDueSoon(due: Date | null, days: number): boolean {
  if (!due || Number.isNaN(due.getTime())) return false;
  const now = new Date();
  const ms = days * 24 * 60 * 60 * 1000;
  return due.getTime() >= now.getTime() && due.getTime() <= now.getTime() + ms;
}

function dueBadge(
  due: Date | null,
  status: string,
): { label: string; className: string } | null {
  if (!due || Number.isNaN(due.getTime())) return null;

  // Don’t nag on completed/cancelled
  if (status === "DONE" || status === "CANCELLED") return null;

  if (isOverdue(due)) {
    return {
      label: "Overdue",
      className: "border-rose-500/40 bg-rose-500/10 text-rose-200",
    };
  }

  if (isDueSoon(due, 2)) {
    return {
      label: "Due soon",
      className: "border-amber-500/40 bg-amber-500/10 text-amber-200",
    };
  }

  return null;
}

const ALL_STATUSES: string[] = [
  "ALL",
  "OPEN",
  "IN_PROGRESS",
  "BLOCKED",
  "DONE",
  "CANCELLED",
];

export default async function TasksPage({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    notFound();
  }

  const queryParams = (searchParams ? await searchParams : {}) as Record<
    string,
    string | string[] | undefined
  >;

  const rawStatus =
    typeof queryParams.status === "string" ? queryParams.status : undefined;

  const rawEstateId =
    typeof queryParams.estateId === "string" ? queryParams.estateId : undefined;

  const statusFilter =
    rawStatus && ALL_STATUSES.includes(rawStatus.toUpperCase())
      ? rawStatus.toUpperCase()
      : "ALL";

  const hasActiveFilters = statusFilter !== "ALL" || Boolean(rawEstateId);

  await connectToDatabase();

  const baseQuery: Record<string, unknown> = {
    ownerId: session.user.id,
  };

  if (rawEstateId) {
    baseQuery.estateId = rawEstateId;
  }

  if (statusFilter !== "ALL") {
    baseQuery.status = statusFilter;
  }

  const rawTasks = (await Task.find(baseQuery)
    .sort({ status: 1, dueDate: 1, createdAt: -1 })
    .lean()
    .exec()) as TaskDocLike[];

  const estateIds = Array.from(
    new Set(
      rawTasks
        .map((t) => t.estateId)
        .filter((id): id is string => typeof id === "string" && id.trim().length > 0),
    ),
  );

  let estatesById: Record<string, string> = {};
  let estateOptions: { id: string; name: string }[] = [];
  if (estateIds.length > 0) {
    const estateDocs = (await Estate.find({
      _id: { $in: estateIds },
      ownerId: session.user.id,
    })
      .lean()
      .exec()) as EstateDocLike[];

    estatesById = estateDocs.reduce<Record<string, string>>((acc, est) => {
      const id = String(est._id);
      const displayName =
        (typeof est.displayName === "string" && est.displayName.trim().length > 0
          ? est.displayName.trim()
          : null) ??
        (typeof est.caseName === "string" && est.caseName.trim().length > 0
          ? est.caseName.trim()
          : null) ??
        "Estate";

      acc[id] = displayName;
      return acc;
    }, {});

    estateOptions = estateDocs
      .map((est) => {
        const id = String(est._id);
        const name =
          (typeof est.displayName === "string" && est.displayName.trim().length > 0
            ? est.displayName.trim()
            : null) ??
          (typeof est.caseName === "string" && est.caseName.trim().length > 0
            ? est.caseName.trim()
            : null) ??
          "Estate";

        return { id, name };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  const tasks: TaskRow[] = rawTasks.map((doc) => {
    const due =
      doc.dueDate instanceof Date
        ? doc.dueDate
        : typeof doc.dueDate === "string"
        ? new Date(doc.dueDate)
        : null;

    const created =
      doc.createdAt instanceof Date
        ? doc.createdAt
        : typeof doc.createdAt === "string"
        ? new Date(doc.createdAt)
        : null;

    const rawStatusValue =
      typeof doc.status === "string" && doc.status.trim().length > 0
        ? doc.status.trim().toUpperCase()
        : "OPEN";

    const rawTitle =
      typeof doc.title === "string" && doc.title.trim().length > 0
        ? doc.title.trim()
        : "Untitled task";

    const rawPriority =
      typeof doc.priority === "string" && doc.priority.trim().length > 0
        ? doc.priority.trim().toUpperCase()
        : null;

    const estId =
      typeof doc.estateId === "string" && doc.estateId.trim().length > 0
        ? doc.estateId.trim()
        : null;

    return {
      id: String(doc._id),
      title: rawTitle,
      status: rawStatusValue,
      dueDate: due,
      priority: rawPriority,
      estateId: estId,
      estateName: estId ? estatesById[estId] ?? "Estate" : null,
      createdAt: created,
    };
  });

  const totalTasks = tasks.length;
  const openTasks = tasks.filter(
    (t) => t.status !== "DONE" && t.status !== "CANCELLED",
  );
  const completedTasks = tasks.filter((t) => t.status === "DONE");

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Tasks</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-100">All estate tasks</h1>
            <p className="mt-1 text-sm text-slate-400">
              Unified task list across all estates, with quick filters for status and per-estate work.
            </p>
          </div>

          <Link
            href="/app"
            className="inline-flex items-center rounded-md border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-900/60"
          >
            ← Back to dashboard
          </Link>
        </div>
      </header>

      {/* Summary row */}
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Total tasks
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-100">
            {totalTasks}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            All tasks for your workspace.
          </p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Open tasks
          </p>
          <p className="mt-2 text-2xl font-semibold text-amber-300">
            {openTasks.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Not completed or cancelled yet.
          </p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Completed
          </p>
          <p className="mt-2 text-2xl font-semibold text-emerald-300">
            {completedTasks.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Finished tasks across all estates.
          </p>
        </div>
      </section>

      {/* Filters + actions */}
      <section className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-500">Status:</span>
            <div className="flex flex-wrap gap-1">
              {ALL_STATUSES.map((status) => {
                const isActive = status === statusFilter;

                const params = new URLSearchParams();
                if (status !== "ALL") params.set("status", status);
                if (rawEstateId) params.set("estateId", rawEstateId);

                const href = params.toString() ? `/app/tasks?${params.toString()}` : "/app/tasks";

                return (
                  <Link
                    key={status}
                    href={href}
                    className={[
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px]",
                      isActive
                        ? "border-sky-500 bg-sky-500/10 text-sky-200"
                        : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500",
                    ].join(" ")}
                  >
                    {status === "ALL" ? "All" : humanizeStatus(status)}
                  </Link>
                );
              })}
            </div>
          </div>

          {estateOptions.length > 0 ? (
            <form action="/app/tasks" method="GET" className="flex items-center gap-2">
              {statusFilter !== "ALL" ? (
                <input type="hidden" name="status" value={statusFilter} />
              ) : null}
              <label className="text-slate-500" htmlFor="estateId">
                Estate:
              </label>
              <select
                id="estateId"
                name="estateId"
                defaultValue={rawEstateId ?? ""}
                className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-200"
              >
                <option value="">All estates</option>
                {estateOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] font-semibold text-slate-200 hover:border-slate-500 hover:bg-slate-900/40"
              >
                Apply
              </button>
            </form>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/app/tasks/new"
            className="inline-flex items-center rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
          >
            + New task
          </Link>

          {hasActiveFilters ? (
            <Link
              href="/app/tasks"
              className="inline-flex items-center rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:bg-slate-900/40"
            >
              Reset
            </Link>
          ) : null}
        </div>
      </section>

      {/* Tasks */}
      <section className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950/70">
        {tasks.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-slate-400">
            <p>No tasks found.</p>
            <p className="mt-1 text-xs text-slate-500">
              {hasActiveFilters
                ? "Try resetting filters, or create a new task to get started."
                : "Create a new task to get started."}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link
                href="/app/tasks/new"
                className="inline-flex items-center rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
              >
                + New task
              </Link>
              {hasActiveFilters ? (
                <Link
                  href="/app/tasks"
                  className="inline-flex items-center rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:bg-slate-900/40"
                >
                  Reset
                </Link>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="bg-slate-900/80">
                    <th className="sticky left-0 z-10 border-b border-slate-800 bg-slate-900/90 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Task
                    </th>
                    <th className="border-b border-slate-800 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Estate
                    </th>
                    <th className="border-b border-slate-800 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Status
                    </th>
                    <th className="border-b border-slate-800 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Due
                    </th>
                    <th className="border-b border-slate-800 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Priority
                    </th>
                    <th className="border-b border-slate-800 px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task, index) => {
                    const isOdd = index % 2 === 1;
                    const due = dueBadge(task.dueDate, task.status);
                    return (
                      <tr
                        key={task.id}
                        className={isOdd ? "bg-slate-900/40" : "bg-slate-950/40"}
                      >
                        <td className="sticky left-0 z-10 max-w-md border-b border-slate-800 bg-inherit px-4 py-2 align-top text-sm text-slate-50">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{task.title}</span>
                              {due ? (
                                <span
                                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${due.className}`}
                                >
                                  {due.label}
                                </span>
                              ) : null}
                            </div>
                            {task.createdAt ? (
                              <span className="text-[11px] text-slate-500">
                                Created {formatDate(task.createdAt)}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="border-b border-slate-800 px-4 py-2 align-top text-sm">
                          {task.estateId ? (
                            <Link
                              href={`/app/estates/${task.estateId}`}
                              className="text-sky-400 hover:text-sky-300"
                            >
                              {task.estateName ?? "Estate"}
                            </Link>
                          ) : (
                            <span className="text-xs text-slate-500">—</span>
                          )}
                        </td>
                        <td className="border-b border-slate-800 px-4 py-2 align-top">
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass(
                              task.status,
                            )}`}
                          >
                            {humanizeStatus(task.status)}
                          </span>
                        </td>
                        <td className="border-b border-slate-800 px-4 py-2 align-top text-sm text-slate-200">
                          {task.dueDate ? (
                            <span>{formatDate(task.dueDate)}</span>
                          ) : (
                            <span className="text-xs text-slate-500">No due date</span>
                          )}
                        </td>
                        <td className="border-b border-slate-800 px-4 py-2 align-top text-sm text-slate-200">
                          {task.priority ? (
                            <span className="text-xs text-slate-200">{task.priority}</span>
                          ) : (
                            <span className="text-xs text-slate-500">—</span>
                          )}
                        </td>
                        <td className="border-b border-slate-800 px-4 py-2 align-top text-right text-xs">
                          <Link
                            href={`/app/tasks/${task.id}`}
                            className="text-sky-400 hover:text-sky-300"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="space-y-2 p-3 md:hidden">
              {tasks.map((task) => {
                const due = dueBadge(task.dueDate, task.status);
                return (
                  <div
                    key={task.id}
                    className="rounded-xl border border-slate-800 bg-slate-900/40 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/app/tasks/${task.id}`}
                            className="block max-w-full truncate text-sm font-semibold text-slate-50 hover:text-sky-300 underline-offset-2 hover:underline"
                          >
                            {task.title}
                          </Link>
                          {due ? (
                            <span
                              className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${due.className}`}
                            >
                              {due.label}
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-2 flex flex-wrap gap-2">
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass(
                              task.status,
                            )}`}
                          >
                            {humanizeStatus(task.status)}
                          </span>

                          {task.estateId ? (
                            <Link
                              href={`/app/estates/${task.estateId}`}
                              className="text-xs font-medium text-sky-400 hover:text-sky-300"
                            >
                              {task.estateName ?? "Estate"}
                            </Link>
                          ) : (
                            <span className="text-xs text-slate-500">No estate</span>
                          )}
                        </div>

                        <div className="mt-2 text-xs text-slate-400">
                          {task.dueDate ? (
                            <span>Due {formatDate(task.dueDate)}</span>
                          ) : (
                            <span>No due date</span>
                          )}
                          {task.priority ? (
                            <span className="text-slate-500"> · Priority {task.priority}</span>
                          ) : null}
                        </div>
                      </div>

                      <Link
                        href={`/app/tasks/${task.id}`}
                        className="shrink-0 text-xs font-semibold text-sky-400 hover:text-sky-300"
                      >
                        View
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>
    </div>
  );
}