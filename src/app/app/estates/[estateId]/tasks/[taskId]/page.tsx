import React from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { requireEstateAccess, requireEstateEditAccess } from "@/lib/estateAccess";
import { Task } from "@/models/Task";

interface TaskDoc {
  _id: string | { toString(): string };
  ownerId?: string;
  subject: string;
  description?: string;
  notes?: string;
  status: "OPEN" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH";
  date?: Date | string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

interface PageProps {
  params: Promise<{
    estateId: string;
    taskId: string;
  }>;
  searchParams?: Promise<{ requestAccess?: string }>;
}

function isValidObjectId(value: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(value);
}

async function loadTask(
  estateId: string,
  taskId: string
): Promise<TaskDoc | null> {
  await connectToDatabase();

  // If the id is not a valid ObjectId (e.g. the literal string "new"),
  // treat it as not found instead of throwing a CastError.
  if (!isValidObjectId(taskId)) {
    return null;
  }

  const doc = await Task.findOne({
    _id: taskId,
    estateId,
  }).lean<TaskDoc | null>();

  return doc ?? null;
}

function formatDate(value?: Date | string | null): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(value?: Date | string | null): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusLabel(status: "OPEN" | "DONE"): string {
  return status === "DONE" ? "Completed" : "Open";
}

function priorityLabel(priority: "LOW" | "MEDIUM" | "HIGH"): string {
  switch (priority) {
    case "HIGH":
      return "High";
    case "LOW":
      return "Low";
    default:
      return "Medium";
  }
}

function statusBadgeClass(status: "OPEN" | "DONE"): string {
  if (status === "DONE") {
    return "bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/40";
  }
  return "bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/40";
}

function priorityBadgeClass(priority: "LOW" | "MEDIUM" | "HIGH"): string {
  switch (priority) {
    case "HIGH":
      return "bg-rose-500/10 text-rose-300 ring-1 ring-rose-500/40";
    case "LOW":
      return "bg-slate-600/20 text-slate-200 ring-1 ring-slate-500/40";
    default:
      return "bg-sky-500/10 text-sky-300 ring-1 ring-sky-500/40";
  }
}

function isOverdue(status: "OPEN" | "DONE", value?: Date | string | null): boolean {
  if (status === "DONE") return false;
  if (!value) return false;
  const date = typeof value === "string" ? new Date(value) : (value as Date);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() < Date.now();
}

function dueBadgeClass(isLate: boolean): string {
  if (isLate) {
    return "bg-rose-500/10 text-rose-200 ring-1 ring-rose-500/40";
  }
  return "bg-slate-900/80 text-slate-300 ring-1 ring-slate-700/80";
}

async function toggleTaskStatusAction(formData: FormData): Promise<void> {
  "use server";

  const estateId = formData.get("estateId");
  const taskId = formData.get("taskId");

  if (typeof estateId !== "string" || typeof taskId !== "string") return;

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/app/estates/${estateId}/tasks/${taskId}`);
  }

  const access = await requireEstateEditAccess({ estateId, userId: session.user.id });
  if (access.role === "VIEWER") {
    redirect(`/app/estates/${estateId}/tasks/${taskId}?requestAccess=1`);
  }

  await connectToDatabase();

  // Defensive: ensure id format
  if (!isValidObjectId(taskId)) {
    notFound();
  }

  const current = await Task.findOne({
    _id: taskId,
    estateId,
  }).lean<{ status?: "OPEN" | "DONE" } | null>();

  if (!current?.status) {
    notFound();
  }

  const nextStatus: "OPEN" | "DONE" = current.status === "DONE" ? "OPEN" : "DONE";

  await Task.findOneAndUpdate(
    { _id: taskId, estateId },
    {
      $set: {
        status: nextStatus,
        completedAt: nextStatus === "DONE" ? new Date() : null,
      },
    },
    { new: false }
  );

  revalidatePath(`/app/estates/${estateId}/tasks/${taskId}`);
  revalidatePath(`/app/estates/${estateId}/tasks`);

  redirect(`/app/estates/${estateId}/tasks/${taskId}`);
}

async function deleteTaskAction(formData: FormData): Promise<void> {
  "use server";

  const estateId = formData.get("estateId");
  const taskId = formData.get("taskId");

  if (typeof estateId !== "string" || typeof taskId !== "string") return;

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/app/estates/${estateId}/tasks/${taskId}`);
  }

  const access = await requireEstateEditAccess({ estateId, userId: session.user.id });
  if (access.role === "VIEWER") {
    redirect(`/app/estates/${estateId}/tasks/${taskId}?requestAccess=1`);
  }

  await connectToDatabase();

  if (!isValidObjectId(taskId)) {
    notFound();
  }

  await Task.findOneAndDelete({ _id: taskId, estateId });

  revalidatePath(`/app/estates/${estateId}/tasks`);

  redirect(`/app/estates/${estateId}/tasks`);
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

type ConfirmedDeleteFormProps = {
  estateId: string;
  taskId: string;
  disabled: boolean;
  action: (formData: FormData) => Promise<void>;
};

function ConfirmedDeleteForm({ estateId, taskId, disabled, action }: ConfirmedDeleteFormProps) {
  "use client";

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (disabled) return;
    const ok = window.confirm(
      "Delete this task? This cannot be undone."
    );
    if (!ok) e.preventDefault();
  };

  return (
    <form action={action} onSubmit={onSubmit} className="inline-flex">
      <input type="hidden" name="estateId" value={estateId} />
      <input type="hidden" name="taskId" value={taskId} />
      <button
        type="submit"
        disabled={disabled}
        title={disabled ? "View-only access" : "Delete task"}
        className={cx(
          "inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-sm shadow-black/40",
          disabled
            ? "cursor-not-allowed border-slate-800/60 bg-slate-950 text-slate-600"
            : "border-rose-600/60 bg-rose-900/20 text-rose-200 hover:border-rose-500 hover:bg-rose-900/40"
        )}
      >
        Delete
      </button>
    </form>
  );
}

export default async function TaskDetailPage({ params, searchParams }: PageProps) {
  const { estateId, taskId } = await params;
  const sp = (await searchParams) ?? {};
  const showRequestAccess = sp.requestAccess === "1";
  const requestAccessHref = `/app/estates/${estateId}?requestAccess=1`;

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/app/estates/${estateId}/tasks/${taskId}`);
  }

  const access = await requireEstateAccess({ estateId, userId: session.user.id });
  const canEdit = access.role !== "VIEWER";

  const task = await loadTask(estateId, taskId);

  if (!task) {
    notFound();
  }

  const id = typeof task._id === "string" ? task._id : task._id.toString();

  const isDone = task.status === "DONE";
  const overdue = isOverdue(task.status, task.date);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <nav className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <Link
          href="/app"
          className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
        >
          App
        </Link>
        <span className="text-slate-600">/</span>
        <Link
          href={`/app/estates/${estateId}`}
          className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
        >
          Estate
        </Link>
        <span className="text-slate-600">/</span>
        <Link
          href={`/app/estates/${estateId}/tasks`}
          className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
        >
          Tasks
        </Link>
        <span className="text-slate-600">/</span>
        <span className="text-rose-300">Task</span>
      </nav>

      {!canEdit ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          {showRequestAccess ? (
            <>
              You have <span className="font-semibold">view-only</span> access for this estate. To edit tasks, request elevated access.
            </>
          ) : (
            <>
              You’re viewing this estate with <span className="font-semibold">view-only</span> access. Editing actions are disabled.
            </>
          )}
          <div className="mt-2">
            <Link
              href={requestAccessHref}
              className="inline-flex items-center rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-200 shadow-sm shadow-black/40 hover:bg-amber-500/15"
            >
              Request access
            </Link>
          </div>
        </div>
      ) : null}

      {/* Header */}
      <div className="flex flex-col justify-between gap-3 border-b border-slate-800 pb-4 sm:flex-row sm:items-center">
        <div>
          <p className="mb-1 text-[11px] uppercase tracking-[0.18em] text-slate-500">
            Tasks
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
            {task.subject}
          </h1>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${statusBadgeClass(
                task.status
              )}`}
            >
              {statusLabel(task.status)}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${priorityBadgeClass(
                task.priority
              )}`}
            >
              Priority: {priorityLabel(task.priority)}
            </span>
            <span
              className={cx(
                "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium",
                dueBadgeClass(overdue)
              )}
            >
              Due: {formatDate(task.date)}
              {overdue ? <span className="ml-2 text-[10px] font-semibold">Overdue</span> : null}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Keep tasks concrete and time-bound so your final accounting and court timeline stay defensible.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-start gap-2 text-xs sm:justify-end">
          <Link
            href={`/app/estates/${estateId}/tasks`}
            className="inline-flex items-center rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-1.5 font-medium text-slate-300 hover:border-slate-500/70 hover:text-slate-100"
          >
            Back to tasks
          </Link>

          {canEdit ? (
            <Link
              href={`/app/estates/${estateId}/tasks/${id}/edit`}
              className="inline-flex items-center rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-1.5 font-semibold text-slate-200 shadow-sm shadow-black/40 hover:border-rose-500/60 hover:bg-slate-900"
            >
              Edit
            </Link>
          ) : (
            <span
              className="inline-flex items-center rounded-lg border border-slate-800/60 bg-slate-950/30 px-3 py-1.5 font-semibold text-slate-600 shadow-sm shadow-black/40"
              title="View-only access"
            >
              Edit
            </span>
          )}

          {/* Status toggle (server action) */}
          <form action={toggleTaskStatusAction} className="inline-flex">
            <input type="hidden" name="estateId" value={estateId} />
            <input type="hidden" name="taskId" value={id} />
            <button
              type="submit"
              disabled={!canEdit}
              title={!canEdit ? "View-only access" : undefined}
              className={cx(
                "inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm shadow-black/40",
                !canEdit
                  ? "cursor-not-allowed border border-slate-800/60 bg-slate-950 text-slate-600"
                  : isDone
                  ? "border border-emerald-500/40 bg-slate-950 text-emerald-200 hover:border-emerald-400 hover:bg-slate-900"
                  : "bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
              )}
            >
              {isDone ? "Reopen" : "Complete"}
            </button>
          </form>

          {/* Delete task (confirmed) */}
          <ConfirmedDeleteForm
            estateId={estateId}
            taskId={id}
            disabled={!canEdit}
            action={deleteTaskAction}
          />
        </div>
      </div>

      {/* Main content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: description & notes */}
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 shadow-sm shadow-black/40 sm:p-6">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Description
            </h2>
            <p className={cx(
              "text-sm leading-relaxed",
              task.description?.trim() ? "text-slate-100" : "text-slate-400"
            )}>
              {task.description?.trim()
                ? task.description
                : "No description yet. Add context so collaborators know what success looks like."}
            </p>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 shadow-sm shadow-black/40 sm:p-6">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Internal notes
            </h2>
            <p className={cx(
              "whitespace-pre-wrap text-sm leading-relaxed",
              task.notes?.trim() ? "text-slate-100" : "text-slate-400"
            )}>
              {task.notes?.trim()
                ? task.notes
                : "No internal notes yet. Use this for private context, decisions, or next steps."}
            </p>
          </section>
        </div>

        {/* Right: metadata */}
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-xs text-slate-200 shadow-sm shadow-black/40">
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Task details
            </h2>
            <dl className="space-y-2">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Status</dt>
                <dd className="text-slate-100">
                  {statusLabel(task.status)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Priority</dt>
                <dd className="text-slate-100">
                  {priorityLabel(task.priority)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Due date</dt>
                <dd className={cx("text-slate-100", overdue && "text-rose-200")}>
                  {formatDate(task.date)}
                  {overdue ? <span className="ml-2 text-[10px] font-semibold">Overdue</span> : null}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Created</dt>
                <dd className="text-slate-100">
                  {formatDateTime(task.createdAt)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Last updated</dt>
                <dd className="text-slate-100">
                  {formatDateTime(task.updatedAt)}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-[11px] text-slate-500">
              Tip: use Internal notes for private context; Description is what collaborators should rely on.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}