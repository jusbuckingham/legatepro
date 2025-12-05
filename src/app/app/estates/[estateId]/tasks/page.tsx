import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";
import { Task } from "@/models/Task";

type PageProps = {
  params: Promise<{
    estateId: string;
  }>;
};

export const metadata: Metadata = {
  title: "Estate Tasks | LegatePro",
};

type EstateTaskRow = {
  id: string;
  title: string;
  status: string;
  dueDate: Date | null;
  priority: string | null;
  createdAt: Date | null;
};

type TaskDocLike = {
  _id: unknown;
  title?: unknown;
  status?: unknown;
  dueDate?: unknown;
  priority?: unknown;
  createdAt?: unknown;
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

export default async function EstateTasksPage({ params }: PageProps) {
  const { estateId } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    // Middleware should already protect this, but guard anyway.
    notFound();
  }

  await connectToDatabase();

  const estate = await Estate.findOne({
    _id: estateId,
    ownerId: session.user.id,
  })
    .lean()
    .exec();

  if (!estate) {
    notFound();
  }

  const rawTasks = (await Task.find({
    estateId,
    ownerId: session.user.id,
  })
    .sort({ status: 1, dueDate: 1, createdAt: -1 })
    .lean()
    .exec()) as TaskDocLike[];

  const tasks: EstateTaskRow[] = rawTasks.map((doc) => {
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

    const rawStatus =
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

    return {
      id: String(doc._id),
      title: rawTitle,
      status: rawStatus,
      dueDate: due,
      priority: rawPriority,
      createdAt: created,
    };
  });

  const openTasks = tasks.filter(
    (t) => t.status !== "DONE" && t.status !== "CANCELLED",
  );
  const completedTasks = tasks.filter((t) => t.status === "DONE");

  const upcomingTasks = tasks
    .filter((t) => t.dueDate && t.status !== "DONE" && t.status !== "CANCELLED")
    .slice(0, 5);

  const estateDisplayName =
    (estate as { displayName?: string; caseName?: string }).displayName ??
    (estate as { caseName?: string }).caseName ??
    "Estate";

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-slate-500">
          Estate · Tasks
        </p>
        <h1 className="text-2xl font-semibold text-slate-100">
          Tasks for {estateDisplayName}
        </h1>
        <p className="text-sm text-slate-400">
          Track what needs to happen next for this estate, who&apos;s
          responsible, and when it&apos;s due.
        </p>
      </header>

      {/* Summary cards */}
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Open tasks
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-100">
            {openTasks.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Tasks that are not completed or cancelled.
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
            Done tasks for this estate.
          </p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Upcoming
          </p>
          <p className="mt-2 text-2xl font-semibold text-sky-300">
            {upcomingTasks.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Tasks with a due date still outstanding.
          </p>
        </div>
      </section>

      {/* Quick actions */}
      <section className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="text-xs text-slate-500">
          Tasks here are scoped to this estate. For a global view, use the{" "}
          <Link
            href="/app/tasks"
            className="text-sky-400 hover:text-sky-300 underline-offset-2 hover:underline"
          >
            Tasks
          </Link>{" "}
          tab.
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/app/tasks?estateId=${estateId}`}
            className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-800"
          >
            View in global tasks
          </Link>
          <Link
            href={`/app/tasks/new?estateId=${estateId}`}
            className="inline-flex items-center rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
          >
            + New task
          </Link>
        </div>
      </section>

      {/* Task table */}
      <section className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950/70">
        {tasks.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-slate-400">
            No tasks yet for this estate. Start by creating a task for your next
            filing deadline, hearing date, or follow-up call.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="bg-slate-900/80">
                  <th className="sticky left-0 z-10 border-b border-slate-800 bg-slate-900/90 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Task
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
                  return (
                    <tr
                      key={task.id}
                      className={isOdd ? "bg-slate-900/40" : "bg-slate-950/40"}
                    >
                      <td className="sticky left-0 z-10 max-w-md border-b border-slate-800 bg-inherit px-4 py-2 align-top text-sm text-slate-50">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">{task.title}</span>
                          {task.createdAt && (
                            <span className="text-[11px] text-slate-500">
                              Created {formatDate(task.createdAt)}
                            </span>
                          )}
                        </div>
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
                          <span className="text-slate-500 text-xs">
                            No due date
                          </span>
                        )}
                      </td>
                      <td className="border-b border-slate-800 px-4 py-2 align-top text-sm text-slate-200">
                        {task.priority ? (
                          <span className="text-xs text-slate-200">
                            {task.priority}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">
                            —
                          </span>
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
        )}
      </section>
    </div>
  );
}