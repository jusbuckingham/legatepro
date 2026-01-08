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

export default async function EditTaskPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(
      `/login?callbackUrl=/app/estates/${params.estateId}/tasks/${params.taskId}/edit`,
    );
  }

  await connectToDatabase();

  // Permission gate (shared estates supported)
  const access = await requireEstateAccess({ estateId: params.estateId });

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
        `/login?callbackUrl=/app/estates/${params.estateId}/tasks/${params.taskId}/edit`,
      );
    }

    await connectToDatabase();

    const estateId = params.estateId;
    const taskId = params.taskId;

    const access = await requireEstateAccess({ estateId });
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
      throw new Error("Subject is required");
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

    redirect(`/app/estates/${estateId}/tasks`);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-50">Edit Task</h1>
          <p className="text-sm text-slate-400">
            Estate · Task #{String(task._id).slice(-6)}
          </p>
        </div>
        <div className="rounded-full bg-slate-900/60 px-3 py-1 text-xs text-slate-400">
          Status:{" "}
          <span className="font-medium text-slate-100">
            {task.status === "DONE" ? "Done" : "Open"}
          </span>
        </div>
      </div>

      {/* Form */}
      <form
        action={updateTask}
        className="max-w-2xl space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm"
      >
        {/* Subject */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-300">
            Subject
          </label>
          <input
            name="subject"
            defaultValue={task.subject}
            required
            className="w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-50 outline-none ring-0 focus:border-indigo-500"
          />
        </div>

        {/* Description */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-300">
            Description
          </label>
          <textarea
            name="description"
            defaultValue={task.description || ""}
            rows={3}
            className="w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-50 outline-none ring-0 focus:border-indigo-500"
          />
        </div>

        {/* Row: Date / Status / Priority */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">
              Task Date
            </label>
            <input
              type="date"
              name="date"
              defaultValue={dateInputValue}
              className="w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-50 outline-none ring-0 focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">
              Status
            </label>
            <select
              name="status"
              defaultValue={task.status}
              className="w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-50 outline-none ring-0 focus:border-indigo-500"
            >
              <option value="OPEN">Open</option>
              <option value="DONE">Done</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">
              Priority
            </label>
            <select
              name="priority"
              defaultValue={task.priority}
              className="w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-50 outline-none ring-0 focus:border-indigo-500"
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-300">
            Internal Notes
          </label>
          <textarea
            name="notes"
            defaultValue={task.notes || ""}
            rows={3}
            placeholder="Private notes about this task (not shown to outside parties)"
            className="w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-50 outline-none ring-0 focus:border-indigo-500"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <Link
            href={`/app/estates/${params.estateId}/tasks`}
            className="text-xs text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline"
          >
            Cancel and go back
          </Link>

          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-md bg-indigo-500 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-indigo-400"
          >
            Save changes
          </button>
        </div>
      </form>
    </div>
  );
}