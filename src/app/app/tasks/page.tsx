import type { Metadata } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import PageHeader from "@/components/layout/PageHeader";

import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Task } from "@/models/Task";
import { Estate } from "@/models/Estate";

export const metadata: Metadata = {
  title: "Tasks | LegatePro",
};

type PageProps = {
  // Next 16: searchParams is a Promise-like dynamic API
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
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
      return "bg-muted/20 text-muted-foreground border-border";
    default:
      return "bg-muted/20 text-muted-foreground border-border";
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

  const queryParams = ((await searchParams) ?? {}) as Record<
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
  const hasAnyTasks = rawTasks.length > 0;

  let estatesById: Record<string, string> = {};
  let estateOptions: { id: string; name: string }[] = [];

  // If we have tasks, we only need the estates referenced by those tasks.
  // If we have no tasks yet, load the user's estates so filters and onboarding can work.
  const estateDocs = (estateIds.length > 0
    ? ((await Estate.find({
        _id: { $in: estateIds },
        ownerId: session.user.id,
      })
        .lean()
        .exec()) as EstateDocLike[])
    : !hasAnyTasks
    ? ((await Estate.find(
        { ownerId: session.user.id },
        { displayName: 1, caseName: 1 },
      )
        .sort({ createdAt: -1 })
        .lean()
        .exec()) as EstateDocLike[])
    : []) as EstateDocLike[];

  if (estateDocs.length > 0) {
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

  const activeEstateName = rawEstateId
    ? estateOptions.find((opt) => opt.id === rawEstateId)?.name ?? "Selected estate"
    : null;

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
  const overdueCount = openTasks.filter((t) => isOverdue(t.dueDate)).length;
  const dueSoonCount = openTasks.filter((t) => isDueSoon(t.dueDate, 2)).length;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8">
      {!hasAnyTasks && estateOptions.length === 0 && !hasActiveFilters ? (
        <div className="rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground shadow-sm">
          <p className="text-sm font-semibold text-foreground">Create your first estate</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Tasks are tied to estates. Create an estate first, then add tasks to build your probate checklist.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/app/estates/new"
              className="inline-flex h-9 items-center rounded-md bg-sky-500 px-3 text-xs font-semibold text-background hover:bg-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              New estate
            </Link>
            <Link
              href="/app/estates"
              className="inline-flex h-9 items-center rounded-md border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              View estates
            </Link>
          </div>
        </div>
      ) : null}
      <PageHeader
        title="All tasks"
        description="Unified task list across all estates, with quick filters for status and per-estate work."
        actions={
          <Link
            href="/app"
            className="inline-flex h-9 items-center rounded-md border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            ← Back to dashboard
          </Link>
        }
      />

      {/* Summary row */}
      <section className="grid gap-6 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Total tasks
          </p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {totalTasks}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            All tasks for your workspace.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Open tasks
          </p>
          <p className="mt-2 text-2xl font-semibold text-amber-300">
            {openTasks.length}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Not completed or cancelled yet.
          </p>

          {overdueCount > 0 || dueSoonCount > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {overdueCount > 0 ? (
                <span className="inline-flex items-center rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[11px] font-semibold text-rose-600">
                  {overdueCount} overdue
                </span>
              ) : null}
              {dueSoonCount > 0 ? (
                <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600">
                  {dueSoonCount} due soon
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Completed
          </p>
          <p className="mt-2 text-2xl font-semibold text-emerald-300">
            {completedTasks.length}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Finished tasks across all estates.
          </p>
        </div>
      </section>

      {/* Filters + actions */}
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="text-muted-foreground">Showing</span>
            <span className="font-semibold text-foreground">{totalTasks}</span>
            <span className="text-muted-foreground">task{totalTasks === 1 ? "" : "s"}</span>

            {hasActiveFilters ? (
              <span className="text-muted-foreground">
                · Filtered by
                {statusFilter !== "ALL" ? (
                  <span className="ml-1 text-muted-foreground">
                    status <span className="font-semibold text-foreground">{humanizeStatus(statusFilter)}</span>
                  </span>
                ) : null}
                {activeEstateName ? (
                  <span className="ml-1 text-muted-foreground">
                    {statusFilter !== "ALL" ? "and" : ""} estate <span className="font-semibold text-foreground">{activeEstateName}</span>
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="text-muted-foreground">· No filters applied</span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">Status:</span>
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
                      title={status === "ALL" ? "Show all tasks" : `Filter by ${humanizeStatus(status)}`}
                      className={[
                        "inline-flex h-7 items-center rounded-full border px-2 text-[11px]",
                        isActive
                          ? "border-sky-500/30 bg-sky-500/10 text-sky-600"
                          : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/30 hover:text-foreground",
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
                <label className="text-muted-foreground" htmlFor="estateId">
                  Estate:
                </label>
                <select
                  id="estateId"
                  name="estateId"
                  defaultValue={rawEstateId ?? ""}
                  className="h-9 rounded-md border border-border bg-background px-2 text-[11px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
                  className="inline-flex h-9 items-center rounded-md bg-foreground px-3 text-[11px] font-semibold text-background hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  Apply
                </button>
              </form>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/app/tasks/new"
            className="inline-flex h-9 items-center rounded-md bg-sky-500 px-3 text-xs font-semibold text-background hover:bg-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            + New task
          </Link>

          {hasActiveFilters ? (
            <Link
              href="/app/tasks"
              className="inline-flex h-9 items-center rounded-md border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Reset
            </Link>
          ) : null}
        </div>
      </section>

      {/* Tasks */}
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        {tasks.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            {hasActiveFilters ? (
              <>
                <p className="text-sm font-semibold text-foreground">No tasks match your filters</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Try a different status / estate, or reset filters to see everything.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Link
                    href="/app/tasks"
                    className="inline-flex h-9 items-center rounded-md border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    Reset filters
                  </Link>
                  {estateOptions.length > 0 ? (
                    <Link
                      href="/app/tasks/new"
                      className="inline-flex h-9 items-center rounded-md bg-sky-500 px-3 text-xs font-semibold text-background hover:bg-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      + New task
                    </Link>
                  ) : (
                    <Link
                      href="/app/estates/new"
                      className="inline-flex h-9 items-center rounded-md bg-sky-500 px-3 text-xs font-semibold text-background hover:bg-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      New estate
                    </Link>
                  )}
                </div>
              </>
            ) : estateOptions.length === 0 ? (
              <>
                <p className="text-sm font-semibold text-foreground">Create an estate first</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Tasks are tied to estates. Once you create an estate, you can build your probate checklist here.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Link
                    href="/app/estates/new"
                    className="inline-flex h-9 items-center rounded-md bg-sky-500 px-3 text-xs font-semibold text-background hover:bg-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    New estate
                  </Link>
                  <Link
                    href="/app/estates"
                    className="inline-flex h-9 items-center rounded-md border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    View estates
                  </Link>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-foreground">Add your first tasks</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Start with 3–5 items you’re already thinking about (court filings, bank account, notifications, inventory).
                </p>

                <div className="mx-auto mt-4 grid max-w-2xl gap-3 text-left md:grid-cols-3">
                  <div className="rounded-xl border border-border bg-muted/20 p-4">
                    <p className="text-xs font-semibold text-foreground">Quick ideas</p>
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] text-muted-foreground">
                      <li>Open estate bank account</li>
                      <li>File Letters of Authority</li>
                      <li>Inventory assets</li>
                    </ul>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/20 p-4">
                    <p className="text-xs font-semibold text-foreground">Stay on track</p>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Add due dates to surface “Overdue” and “Due soon” badges.
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/20 p-4">
                    <p className="text-xs font-semibold text-foreground">Link to estates</p>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Tasks roll up to each estate checklist automatically.
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Link
                    href="/app/tasks/new"
                    className="inline-flex h-9 items-center rounded-md bg-sky-500 px-3 text-xs font-semibold text-background hover:bg-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    + New task
                  </Link>
                  <Link
                    href="/app/estates"
                    className="inline-flex h-9 items-center rounded-md border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    View estates
                  </Link>
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="bg-muted/30">
                    <th className="sticky left-0 z-10 border-b border-border bg-muted/30 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Task
                    </th>
                    <th className="border-b border-border px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Estate
                    </th>
                    <th className="border-b border-border px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Status
                    </th>
                    <th className="border-b border-border px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Due
                    </th>
                    <th className="border-b border-border px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Priority
                    </th>
                    <th className="border-b border-border px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
                        className={[
                          isOdd ? "bg-muted/10" : "bg-card",
                          "transition-colors hover:bg-muted/20",
                        ].join(" ")}
                      >
                        <td className="sticky left-0 z-10 max-w-md border-b border-border bg-inherit px-4 py-3 align-top text-sm text-foreground">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link
                                href={`/app/tasks/${task.id}`}
                                className="font-medium text-foreground hover:text-sky-600 hover:underline underline-offset-2"
                              >
                                {task.title}
                              </Link>
                              {due ? (
                                <span
                                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${due.className}`}
                                >
                                  {due.label}
                                </span>
                              ) : null}
                            </div>
                            {task.createdAt ? (
                              <span className="text-[11px] text-muted-foreground">
                                Created {formatDate(task.createdAt)}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="border-b border-border px-4 py-3 align-top text-sm">
                          {task.estateId ? (
                            <Link
                              href={`/app/estates/${task.estateId}`}
                              className="text-sky-400 hover:text-sky-300"
                            >
                              {task.estateName ?? "Estate"}
                            </Link>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="border-b border-border px-4 py-3 align-top">
                          <span
                            className={`inline-flex h-7 items-center rounded-full border px-2 text-[11px] font-medium ${statusBadgeClass(
                              task.status,
                            )}`}
                          >
                            {humanizeStatus(task.status)}
                          </span>
                        </td>
                        <td className="border-b border-border px-4 py-3 align-top text-sm text-muted-foreground">
                          {task.dueDate ? (
                            <span>{formatDate(task.dueDate)}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">No due date</span>
                          )}
                        </td>
                        <td className="border-b border-border px-4 py-3 align-top text-sm text-muted-foreground">
                          {task.priority ? (
                            <span className="text-xs text-foreground">{task.priority}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="border-b border-border px-4 py-3 align-top text-right text-xs">
                          <Link
                            href={`/app/tasks/${task.id}`}
                            className="inline-flex items-center rounded-md border border-border bg-card px-2 py-1 text-[11px] font-semibold text-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
            <div className="space-y-3 p-4 md:hidden">
              {tasks.map((task) => {
                const due = dueBadge(task.dueDate, task.status);
                return (
                  <div
                    key={task.id}
                    className="rounded-xl border border-border bg-card p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/app/tasks/${task.id}`}
                            className="block max-w-full truncate text-sm font-semibold text-foreground hover:text-sky-600 underline-offset-2 hover:underline"
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
                            <span className="text-xs text-muted-foreground">No estate</span>
                          )}
                        </div>

                        <div className="mt-2 text-xs text-muted-foreground">
                          {task.dueDate ? (
                            <span>Due {formatDate(task.dueDate)}</span>
                          ) : (
                            <span>No due date</span>
                          )}
                          {task.priority ? (
                            <span className="text-muted-foreground"> · Priority {task.priority}</span>
                          ) : null}
                        </div>
                      </div>

                      <Link
                        href={`/app/tasks/${task.id}`}
                        className="shrink-0 text-xs font-semibold text-sky-600 hover:text-sky-500"
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