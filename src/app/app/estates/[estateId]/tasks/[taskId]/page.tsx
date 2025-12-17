import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { requireEstateAccess } from "@/lib/estateAccess";
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
  taskId: string,
  ownerId: string
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
    ownerId,
  }).lean<TaskDoc | null>();

  return doc ?? null;
}

function formatDate(value?: Date | string | null): string {
  if (!value) return "—";
  const date =
    typeof value === "string" ? new Date(value) : (value as Date);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(value?: Date | string | null): string {
  if (!value) return "—";
  const date =
    typeof value === "string" ? new Date(value) : (value as Date);
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

async function toggleTaskStatusAction(formData: FormData): Promise<void> {
  "use server";

  const estateId = formData.get("estateId");
  const taskId = formData.get("taskId");

  if (typeof estateId !== "string" || typeof taskId !== "string") return;

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/app/estates/${estateId}/tasks/${taskId}`);
  }

  const access = await requireEstateAccess({ estateId });
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
    ownerId: session.user.id,
  }).lean<{ status?: "OPEN" | "DONE" } | null>();

  if (!current?.status) {
    notFound();
  }

  const nextStatus: "OPEN" | "DONE" = current.status === "DONE" ? "OPEN" : "DONE";

  await Task.findOneAndUpdate(
    { _id: taskId, estateId, ownerId: session.user.id },
    { $set: { status: nextStatus } },
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

  const access = await requireEstateAccess({ estateId });
  if (access.role === "VIEWER") {
    redirect(`/app/estates/${estateId}/tasks/${taskId}?requestAccess=1`);
  }

  await connectToDatabase();

  if (!isValidObjectId(taskId)) {
    notFound();
  }

  await Task.findOneAndDelete({ _id: taskId, estateId, ownerId: session.user.id });

  revalidatePath(`/app/estates/${estateId}/tasks`);

  redirect(`/app/estates/${estateId}/tasks`);
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

  const access = await requireEstateAccess({ estateId });
  const canEdit = access.role !== "VIEWER";

  const task = await loadTask(estateId, taskId, session.user.id);

  if (!task) {
    notFound();
  }

  const id = typeof task._id === "string" ? task._id : task._id.toString();

  const isDone = task.status === "DONE";

  return (
    <div className="space-y-8">
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
            <span className="inline-flex items-center rounded-full bg-slate-900/80 px-2.5 py-1 text-[11px] font-medium text-slate-300 ring-1 ring-slate-700/80">
              Due: {formatDate(task.date)}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-start gap-2 text-xs sm:justify-end">
          <Link
            href={`/app/estates/${estateId}/tasks`}
            className="inline-flex items-center rounded-lg border border-slate-800 px-3 py-1.5 font-medium text-slate-300 hover:border-slate-500/70 hover:text-slate-100"
          >
            Back to tasks
          </Link>

          {canEdit ? (
            <Link
              href={`/app/estates/${estateId}/tasks/${id}/edit`}
              className="inline-flex items-center rounded-lg border border-slate-800 px-3 py-1.5 font-medium shadow-sm shadow-black/40 text-slate-300 hover:border-slate-500/70 hover:text-slate-100"
            >
              Edit
            </Link>
          ) : (
            <span
              className="inline-flex items-center rounded-lg border border-slate-800/60 px-3 py-1.5 font-medium text-slate-600 shadow-sm shadow-black/40"
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
              aria-disabled={!canEdit}
              title={!canEdit ? "View-only access" : undefined}
              className={`inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm shadow-black/40 ${
                !canEdit
                  ? "cursor-not-allowed border border-slate-800/60 bg-slate-950 text-slate-600"
                  : isDone
                  ? "border border-emerald-500/40 bg-slate-950 text-emerald-300 hover:border-emerald-400 hover:bg-slate-900"
                  : "bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
              }`}
            >
              {isDone ? "Mark as open" : "Mark as done"}
            </button>
          </form>

          {/* Delete task button (server action) */}
          <form action={deleteTaskAction} className="inline-flex">
            <input type="hidden" name="estateId" value={estateId} />
            <input type="hidden" name="taskId" value={id} />
            <button
              type="submit"
              disabled={!canEdit}
              aria-disabled={!canEdit}
              title={!canEdit ? "View-only access" : undefined}
              className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-sm shadow-black/40 ${
                canEdit
                  ? "border-rose-600/60 bg-rose-900/20 text-rose-200 hover:border-rose-500 hover:bg-rose-900/40"
                  : "cursor-not-allowed border-slate-800/60 bg-slate-950 text-slate-600"
              }`}
            >
              Delete task
            </button>
          </form>
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
            <p className="text-sm leading-relaxed text-slate-100">
              {task.description?.trim()
                ? task.description
                : "No description added yet."}
            </p>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 shadow-sm shadow-black/40 sm:p-6">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Internal notes
            </h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-100">
              {task.notes?.trim()
                ? task.notes
                : "No notes recorded yet."}
            </p>
          </section>
        </div>

        {/* Right: metadata */}
        <aside className="space-y-4">
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
                <dd className="text-slate-100">
                  {formatDate(task.date)}
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
          </div>
        </aside>
      </div>
    </div>
  );
}