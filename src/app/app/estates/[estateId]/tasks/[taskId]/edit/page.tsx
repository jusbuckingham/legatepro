// src/app/app/estates/[estateId]/tasks/[taskId]/edit/page.tsx
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";

import { auth } from "@/lib/auth";
import { connectToDatabase, serializeMongoDoc } from "@/lib/db";
import { requireEstateAccess } from "@/lib/estateAccess";
import { Task, TaskPriority, TaskStatus, type TaskDocument } from "@/models/Task";

type PageProps = {
  params: {
    estateId: string;
    taskId: string;
  };
  searchParams?: Record<string, string | string[] | undefined>;
};

type TaskForForm = {
  _id: string;
  subject: string;
  description?: string;
  notes?: string;
  status: TaskStatus;
  priority: TaskPriority;
  date?: string | Date;
};

function firstParam(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? "" : "";
}

function buildEditUrl(estateId: string, taskId: string, params?: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v) sp.set(k, v);
    }
  }
  const qs = sp.toString();
  return `/app/estates/${encodeURIComponent(estateId)}/tasks/${encodeURIComponent(taskId)}/edit${qs ? `?${qs}` : ""}`;
}

export default async function EditTaskPage({ params, searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(
      `/login?callbackUrl=${encodeURIComponent(
        `/app/estates/${params.estateId}/tasks/${params.taskId}/edit`,
      )}`,
    );
  }

  await connectToDatabase();

  // Permission gate (shared estates supported)
  const access = await requireEstateAccess({
    estateId: params.estateId,
    userId: session.user.id,
  });

  // VIEWERs can view tasks, but cannot edit them.
  const isViewer = access.role === "VIEWER";
  if (isViewer) {
    // Send them to the read-only detail page; that page should surface Request Access.
    redirect(`/app/estates/${params.estateId}/tasks/${params.taskId}`);
  }

  // Load task (scoped by estateId; access check above prevents cross-tenant leakage)
  const taskDoc = await Task.findOne({
    _id: params.taskId,
    estateId: params.estateId,
  })
    .lean()
    .exec();

  if (!taskDoc) {
    notFound();
  }

  const task = serializeMongoDoc(taskDoc) as TaskForForm;

  // Banner helpers
  const sp = searchParams;
  const savedFlag = firstParam(sp?.saved) === "1";
  const errorCode = firstParam(sp?.error).trim();

  const dateInputValue = (() => {
    const d = task.date;
    if (d instanceof Date) return d.toISOString().slice(0, 10);
    if (typeof d === "string") return d.slice(0, 10);
    return "";
  })();

  async function updateTask(formData: FormData) {
    "use server";

    const sessionInner = await auth();
    if (!sessionInner?.user?.id) {
      redirect(
        `/login?callbackUrl=${encodeURIComponent(
          `/app/estates/${params.estateId}/tasks/${params.taskId}/edit`,
        )}`,
      );
    }

    await connectToDatabase();

    const estateId = params.estateId;
    const taskId = params.taskId;

    const access = await requireEstateAccess({ estateId, userId: sessionInner.user.id });
    if (access.role === "VIEWER") {
      redirect(`/app/estates/${estateId}/tasks/${taskId}`);
    }

    const subject = String(formData.get("subject") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const notes = String(formData.get("notes") || "").trim();
    const statusRaw = String(formData.get("status") || "OPEN");
    const priorityRaw = String(formData.get("priority") || "MEDIUM");
    const dateStr = String(formData.get("date") || "").trim();

    if (!subject) {
      redirect(buildEditUrl(estateId, taskId, { error: "subject_required" }) + "#form");
    }

    const allowedStatuses: TaskStatus[] = ["OPEN", "DONE"];
    const allowedPriorities: TaskPriority[] = ["LOW", "MEDIUM", "HIGH"];

    const nextStatus: TaskStatus = allowedStatuses.includes(
      statusRaw as TaskStatus,
    )
      ? (statusRaw as TaskStatus)
      : "OPEN";

    const nextPriority: TaskPriority = allowedPriorities.includes(
      priorityRaw as TaskPriority,
    )
      ? (priorityRaw as TaskPriority)
      : "MEDIUM";

    const existing = (await Task.findOne({
      _id: taskId,
      estateId,
    })) as (TaskDocument & {
      date?: Date;
      completedAt?: Date | null;
    }) | null;

    if (!existing) {
      notFound();
    }

    existing.subject = subject;
    existing.description = description || "";
    existing.notes = notes || "";
    existing.status = nextStatus;
    existing.priority = nextPriority;

    if (dateStr) {
      const parsed = new Date(dateStr);
      if (!Number.isNaN(parsed.getTime())) {
        existing.date = parsed;
      }
    } else {
      existing.date = undefined;
    }

    if (nextStatus === "DONE" && !existing.completedAt) {
      existing.completedAt = new Date();
    } else if (nextStatus === "OPEN") {
      existing.completedAt = null;
    }

    await existing.save();

    revalidatePath(`/app/estates/${estateId}/tasks`);
    revalidatePath(`/app/estates/${estateId}/tasks/${taskId}`);

    redirect(`/app/estates/${estateId}/tasks/${taskId}?saved=1`);
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="space-y-4">
        <nav className="text-xs text-slate-500">
          <Link
            href="/app/estates"
            className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
          >
            Estates
          </Link>
          <span className="mx-1 text-slate-600">/</span>
          <Link
            href={`/app/estates/${params.estateId}`}
            className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
          >
            Estate
          </Link>
          <span className="mx-1 text-slate-600">/</span>
          <Link
            href={`/app/estates/${params.estateId}/tasks`}
            className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
          >
            Tasks
          </Link>
          <span className="mx-1 text-slate-600">/</span>
          <Link
            href={`/app/estates/${params.estateId}/tasks/${params.taskId}`}
            className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
          >
            Task
          </Link>
          <span className="mx-1 text-slate-600">/</span>
          <span className="text-rose-300">Edit</span>
        </nav>

        {savedFlag ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium">Changes saved</p>
                <p className="text-xs text-emerald-200">Your task updates have been stored and the list has been refreshed.</p>
              </div>
              <Link
                href={`/app/estates/${params.estateId}/tasks/${params.taskId}`}
                className="mt-2 inline-flex items-center justify-center rounded-md border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-500/25 md:mt-0"
              >
                Back to task
              </Link>
            </div>
          </div>
        ) : null}

        {errorCode === "subject_required" ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium">Subject required</p>
                <p className="text-xs text-rose-200">Add a clear subject before saving changes.</p>
              </div>
              <Link
                href={buildEditUrl(params.estateId, params.taskId) + "#form"}
                className="mt-2 inline-flex items-center justify-center rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-100 hover:bg-rose-500/25 md:mt-0"
              >
                Back to form
              </Link>
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Edit task</span>
              <span className="rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                Access: {access.role}
              </span>
              <span
                className={
                  task.status === "DONE"
                    ? "rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200"
                    : "rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300"
                }
              >
                Status: {task.status === "DONE" ? "Done" : "Open"}
              </span>
            </div>

            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-50">Edit task</h1>
            <p className="mt-1 text-sm text-slate-400">
              Task <span className="text-slate-500">#</span>
              <span className="font-medium text-slate-100">{String(task._id).slice(-6)}</span>
              <span className="text-slate-500"> · </span>
              Update the subject, status, priority, and internal notes.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Link
              href={`/app/estates/${params.estateId}/tasks/${params.taskId}`}
              className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 font-medium text-slate-200 hover:border-rose-500/70 hover:text-rose-100"
            >
              ← Back to task
            </Link>
            <Link
              href={`/app/estates/${params.estateId}/tasks`}
              className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 font-medium text-slate-200 hover:border-rose-500/70 hover:text-rose-100"
            >
              Back to tasks
            </Link>
          </div>
        </div>
      </header>

      <form
        id="form"
        action={updateTask}
        className="max-w-3xl space-y-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-sm shadow-sm"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-300">Subject</label>
            <input
              name="subject"
              defaultValue={task.subject}
              required
              placeholder="e.g. Call bank about estate account"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 outline-none ring-0 focus:border-rose-500/70"
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-300">Description</label>
            <textarea
              name="description"
              defaultValue={task.description || ""}
              rows={3}
              placeholder="Optional context to help you remember what this is about…"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 outline-none ring-0 focus:border-rose-500/70"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">Task date</label>
            <input
              type="date"
              name="date"
              defaultValue={dateInputValue}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none ring-0 focus:border-rose-500/70"
            />
            <p className="mt-1 text-[11px] text-slate-500">Useful for calls, filings, and follow-ups.</p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">Status</label>
            <select
              name="status"
              defaultValue={task.status}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none ring-0 focus:border-rose-500/70"
            >
              <option value="OPEN">Open</option>
              <option value="DONE">Done</option>
            </select>
            <p className="mt-1 text-[11px] text-slate-500">Mark done to timestamp completion.</p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">Priority</label>
            <select
              name="priority"
              defaultValue={task.priority}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none ring-0 focus:border-rose-500/70"
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
            <p className="mt-1 text-[11px] text-slate-500">Helps you triage what matters today.</p>
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-300">Internal notes</label>
            <textarea
              name="notes"
              defaultValue={task.notes || ""}
              rows={3}
              placeholder="Private notes (not shared outside your team)."
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 outline-none ring-0 focus:border-rose-500/70"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-800 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href={`/app/estates/${params.estateId}/tasks/${params.taskId}`}
            className="text-xs text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline"
          >
            Cancel
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/app/estates/${params.estateId}/tasks/${params.taskId}`}
              className="inline-flex items-center justify-center rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-900/40"
            >
              Back
            </Link>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-md bg-rose-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-rose-400"
            >
              Save changes
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}