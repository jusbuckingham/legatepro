import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connectToDatabase } from "@/lib/db";
import { Task } from "@/models/Task";

interface TaskDoc {
  _id: string | { toString(): string };
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
}

function toDateInputValue(value?: Date | string | null): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : (value as Date);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isValidObjectId(value: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(value);
}

async function loadTask(
  estateId: string,
  taskId: string
): Promise<TaskDoc | null> {
  await connectToDatabase();

  // If the id is not a valid ObjectId, treat as not found.
  if (!isValidObjectId(taskId)) {
    return null;
  }

  const doc = await Task.findOne({
    _id: taskId,
    estateId,
  }).lean<TaskDoc | null>();

  return doc ?? null;
}

async function updateTask(formData: FormData): Promise<void> {
  "use server";

  const estateId = formData.get("estateId");
  const taskId = formData.get("taskId");
  const subject = formData.get("subject");
  const description = formData.get("description");
  const notes = formData.get("notes");
  const status = formData.get("status");
  const priority = formData.get("priority");
  const date = formData.get("date");

  if (
    !estateId ||
    !taskId ||
    typeof estateId !== "string" ||
    typeof taskId !== "string"
  ) {
    return;
  }

  await connectToDatabase();

  const update: Record<string, unknown> = {};

  if (typeof subject === "string") {
    update.subject = subject.trim();
  }
  if (typeof description === "string") {
    update.description = description;
  }
  if (typeof notes === "string") {
    update.notes = notes;
  }
  if (typeof status === "string") {
    update.status = status;
  }
  if (typeof priority === "string") {
    update.priority = priority;
  }
  if (typeof date === "string") {
    update.date = date ? new Date(date) : null;
  }

  await Task.findOneAndUpdate(
    { _id: taskId, estateId },
    update,
    { new: true }
  );

  redirect(`/app/estates/${estateId}/tasks/${taskId}`);
}

export default async function EditTaskPage({ params }: PageProps) {
  const { estateId, taskId } = await params;

  const task = await loadTask(estateId, taskId);

  if (!task) {
    notFound();
  }

  const id =
    typeof task._id === "string" ? task._id : task._id.toString();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-3 border-b border-slate-800 pb-4 sm:flex-row sm:items-center">
        <div>
          <p className="mb-1 text-[11px] uppercase tracking-[0.18em] text-slate-500">
            Tasks
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
            Edit task
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Update details, due date, priority, and notes for this task.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-start gap-2 text-xs sm:justify-end">
          <Link
            href={`/app/estates/${estateId}/tasks/${id}`}
            className="inline-flex items-center rounded-lg border border-slate-800 px-3 py-1.5 font-medium text-slate-300 hover:border-slate-500/70 hover:text-slate-100"
          >
            View task
          </Link>
          <Link
            href={`/app/estates/${estateId}/tasks`}
            className="inline-flex items-center rounded-lg border border-slate-800 px-3 py-1.5 font-medium text-slate-300 hover:border-slate-500/70 hover:text-slate-100"
          >
            Back to tasks
          </Link>
        </div>
      </div>
      {/* Form */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 shadow-sm shadow-black/40 sm:p-6">
        <form action={updateTask} className="space-y-6">
          <input type="hidden" name="estateId" value={estateId} />
          <input type="hidden" name="taskId" value={id} />

          <div className="space-y-2">
            <label
              htmlFor="subject"
              className="block text-xs font-medium uppercase tracking-[0.18em] text-slate-400"
            >
              Subject
            </label>
            <input
              id="subject"
              name="subject"
              type="text"
              defaultValue={task.subject}
              className="block w-full rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-50 shadow-sm outline-none ring-0 placeholder:text-slate-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              required
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="description"
              className="block text-xs font-medium uppercase tracking-[0.18em] text-slate-400"
            >
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={task.description ?? ""}
              className="block w-full rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-50 shadow-sm outline-none ring-0 placeholder:text-slate-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="notes"
              className="block text-xs font-medium uppercase tracking-[0.18em] text-slate-400"
            >
              Internal notes
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={task.notes ?? ""}
              className="block w-full rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-50 shadow-sm outline-none ring-0 placeholder:text-slate-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <label
                htmlFor="status"
                className="block text-xs font-medium uppercase tracking-[0.18em] text-slate-400"
              >
                Status
              </label>
              <select
                id="status"
                name="status"
                defaultValue={task.status}
                className="block w-full rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-50 shadow-sm outline-none ring-0 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              >
                <option value="OPEN">Open</option>
                <option value="DONE">Done</option>
              </select>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="priority"
                className="block text-xs font-medium uppercase tracking-[0.18em] text-slate-400"
              >
                Priority
              </label>
              <select
                id="priority"
                name="priority"
                defaultValue={task.priority}
                className="block w-full rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-50 shadow-sm outline-none ring-0 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="date"
                className="block text-xs font-medium uppercase tracking-[0.18em] text-slate-400"
              >
                Due date
              </label>
              <input
                id="date"
                name="date"
                type="date"
                defaultValue={toDateInputValue(task.date ?? null)}
                className="block w-full rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-50 shadow-sm outline-none ring-0 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Link
              href={`/app/estates/${estateId}/tasks/${id}`}
              className="inline-flex items-center rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-500/80 hover:text-slate-100"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="inline-flex items-center rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-semibold text-sky-950 shadow-sm shadow-black/40 hover:bg-sky-400"
            >
              Save changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}