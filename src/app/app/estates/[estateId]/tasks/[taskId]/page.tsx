// src/app/app/estates/[estateId]/tasks/[taskId]/page.tsx
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { connectToDatabase } from "@/lib/db";
import { Task } from "@/models/Task";

interface PageProps {
  params: {
    estateId: string;
    taskId: string;
  };
}

interface TaskDoc {
  _id: unknown;
  estateId: unknown;
  status?: string;
  date?: string | Date;
  priority?: string;
  subject?: string;
  description?: string;
  createdAt?: string | Date;
  completedAt?: string | Date;
}

async function loadTask(
  estateId: string,
  taskId: string
): Promise<TaskDoc | null> {
  await connectToDatabase();

  const doc = await Task.findOne({
    _id: taskId,
    estateId,
  }).lean<TaskDoc | null>();

  return doc;
}

async function updateTask(formData: FormData) {
  "use server";

  const estateId = formData.get("estateId");
  const taskId = formData.get("taskId");

  if (typeof estateId !== "string" || typeof taskId !== "string") {
    return;
  }

  const date = formData.get("date")?.toString() || "";
  const subject = formData.get("subject")?.toString().trim() ?? "";
  const description = formData.get("description")?.toString().trim() ?? "";
  const priority = (formData.get("priority")?.toString() || "MEDIUM").toUpperCase();
  const statusRaw = formData.get("status")?.toString().toUpperCase() || "OPEN";
  const status = statusRaw === "DONE" ? "DONE" : "OPEN";

  if (!subject || !description || !date) {
    return;
  }

  await connectToDatabase();

  const now = new Date();

  const update: Record<string, unknown> = {
    date,
    subject,
    description,
    priority,
    status,
  };

  if (status === "DONE") {
    update.completedAt = now;
  } else {
    update.completedAt = undefined;
  }

  await Task.findOneAndUpdate(
    { _id: taskId, estateId },
    update,
    { new: true }
  );

  revalidatePath(`/app/estates/${estateId}/tasks`);
  redirect(`/app/estates/${estateId}/tasks`);
}

function formatDateInput(value?: string | Date): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default async function TaskDetailPage({ params }: PageProps) {
  const { estateId, taskId } = params;

  if (!estateId || !taskId) {
    notFound();
  }

  const task = await loadTask(estateId, taskId);

  if (!task) {
    notFound();
  }

  const subject = task.subject ?? "";
  const description = task.description ?? "";
  const priority = (task.priority || "MEDIUM").toUpperCase();
  const status = (task.status || "OPEN").toUpperCase();
  const dateValue =
    task.date ?? task.createdAt ?? new Date().toISOString().slice(0, 10);
  const dateInput = formatDateInput(dateValue);

  return (
    <div className="space-y-6 p-6">
      {/* Header / breadcrumb */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <nav className="text-xs text-slate-500">
            <span className="text-slate-500">Estates</span>
            <span className="mx-1 text-slate-600">/</span>
            <span className="text-slate-300">Current estate</span>
            <span className="mx-1 text-slate-600">/</span>
            <span className="text-slate-300">Tasks</span>
            <span className="mx-1 text-slate-600">/</span>
            <span className="text-rose-300">Edit</span>
          </nav>

          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-50">
              Edit task
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Tune the date, subject, priority, and status for this item. This
              page is meant for the bigger moves—changing what the work
              actually is, not just checking a box.
            </p>
          </div>

          <p className="text-xs text-slate-500">
            Helpful for keeping a clean record of what you actually did for the
            estate, especially when you&apos;re later building your timecard or
            a narrative for the court.
          </p>
        </div>

        <div className="flex flex-col items-end gap-2 text-xs">
          <span className="inline-flex items-center rounded-full border border-rose-500/40 bg-rose-950/70 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-rose-100 shadow-sm">
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-rose-400" />
            Task detail
          </span>
        </div>
      </div>

      {/* Edit form */}
      <form
        action={updateTask}
        className="max-w-2xl space-y-4 rounded-xl border border-rose-900/40 bg-slate-950/70 p-4 shadow-sm shadow-rose-950/40"
      >
        <input type="hidden" name="estateId" value={estateId} />
        <input type="hidden" name="taskId" value={taskId} />

        <div className="grid gap-3 md:grid-cols-[140px,1fr,140px]">
          <div className="space-y-1">
            <label htmlFor="date" className="text-xs font-medium text-slate-200">
              Date
            </label>
            <input
              id="date"
              name="date"
              type="date"
              defaultValue={dateInput}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 outline-none focus:border-rose-400"
              required
            />
            <p className="text-[11px] text-slate-500">
              The date you did (or will do) the task.
            </p>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="subject"
              className="text-xs font-medium text-slate-200"
            >
              Subject
            </label>
            <input
              id="subject"
              name="subject"
              defaultValue={subject}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 outline-none focus:border-rose-400"
              placeholder="e.g. Dickerson – DTE transfer, Tuxedo – appraisal"
              required
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="priority"
              className="text-xs font-medium text-slate-200"
            >
              Priority
            </label>
            <select
              id="priority"
              name="priority"
              defaultValue={priority}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs uppercase tracking-wide text-slate-100 outline-none focus:border-rose-400"
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="status"
            className="text-xs font-medium text-slate-200"
          >
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={status}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs uppercase tracking-wide text-slate-100 outline-none focus:border-rose-400 md:w-48"
          >
            <option value="OPEN">Open</option>
            <option value="DONE">Done</option>
          </select>
          <p className="text-[11px] text-slate-500">
            Mark as{" "}
            <span className="text-emerald-300">Done</span> once you&apos;ve
            actually completed the call, filing, or visit.
          </p>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="description"
            className="text-xs font-medium text-slate-200"
          >
            Description
          </label>
          <textarea
            id="description"
            name="description"
            defaultValue={description}
            rows={3}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 outline-none focus:border-rose-400"
            placeholder="e.g. Called DTE to move account into estate, confirmed balance, requested final bill to be sent to PR address."
            required
          />
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-800 pt-3 text-xs md:flex-row md:items-center md:justify-between">
          <p className="text-[11px] text-slate-500">
            These edits keep your checklist honest—so the story you tell the
            court later matches what really happened.
          </p>
          <div className="flex items-center gap-3">
            <a
              href={`/app/estates/${estateId}/tasks`}
              className="text-[11px] text-slate-300 underline-offset-2 hover:text-slate-100 hover:underline"
            >
              Cancel
            </a>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-md bg-rose-500 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-rose-400"
            >
              Save changes
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}