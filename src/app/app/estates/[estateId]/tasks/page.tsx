import { redirect } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Estate, type EstateDocument } from "@/models/Estate";
import {
  Task,
  type TaskDocument,
  TaskStatus,
  TaskPriority,
} from "@/models/Task";

type PageProps = {
  params: Promise<{
    estateId: string;
  }>;
};

type TaskListItem = {
  _id: string;
  subject: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: Date | null;
};

function getStatusLabel(status: TaskStatus) {
  switch (status) {
    case "OPEN":
      return "Open";
    case "DONE":
      return "Done";
    default:
      return status;
  }
}

function getStatusClasses(status: TaskStatus) {
  if (status === "DONE") {
    return "inline-flex items-center rounded-full bg-emerald-900/40 px-2 py-0.5 text-[11px] font-medium text-emerald-200 border border-emerald-700/60";
  }
  return "inline-flex items-center rounded-full bg-amber-900/40 px-2 py-0.5 text-[11px] font-medium text-amber-100 border border-amber-700/60";
}

function getPriorityLabel(priority: TaskPriority) {
  switch (priority) {
    case "LOW":
      return "Low";
    case "MEDIUM":
      return "Medium";
    case "HIGH":
      return "High";
    default:
      return priority;
  }
}

function getPriorityClasses(priority: TaskPriority) {
  switch (priority) {
    case "LOW":
      return "inline-flex items-center rounded-full bg-slate-800/60 px-2 py-0.5 text-[11px] font-medium text-slate-200 border border-slate-700/70";
    case "MEDIUM":
      return "inline-flex items-center rounded-full bg-sky-900/40 px-2 py-0.5 text-[11px] font-medium text-sky-100 border border-sky-700/60";
    case "HIGH":
      return "inline-flex items-center rounded-full bg-rose-900/50 px-2 py-0.5 text-[11px] font-medium text-rose-100 border border-rose-700/70";
    default:
      return "inline-flex items-center rounded-full bg-slate-800/60 px-2 py-0.5 text-[11px] font-medium text-slate-200 border border-slate-700/70";
  }
}

export default async function EstateTasksPage({ params }: PageProps) {
  const { estateId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  await connectToDatabase();

  // Fetch estate & tasks
  const estateDoc = await Estate.findOne({
    _id: estateId,
    ownerId: session.user.id,
  }).lean<EstateDocument | null>();

  if (!estateDoc) {
    redirect("/app/estates");
  }

  const taskDocs = await Task.find({
    estateId,
    ownerId: session.user.id,
  })
    .sort({ status: 1, priority: -1, dueDate: 1, createdAt: -1 })
    .lean<TaskDocument[]>();

  const tasks: TaskListItem[] = taskDocs.map((doc: TaskDocument) => ({
    _id: String(doc._id),
    subject: doc.subject,
    status: doc.status,
    priority: doc.priority,
    dueDate: doc.dueDate ?? null,
  }));

  // --- Server actions (no onClick, only <form action={...}> ) ---

  async function toggleTaskStatus(formData: FormData) {
    "use server";

    const sessionInner = await auth();
    if (!sessionInner?.user?.id) {
      redirect("/login");
    }

    const taskId = formData.get("taskId")?.toString();
    if (!taskId) return;

    await connectToDatabase();

    const task = await Task.findOne({
      _id: taskId,
      estateId,
      ownerId: sessionInner.user.id,
    });

    if (!task) return;

    task.status = task.status === "DONE" ? "OPEN" : "DONE";
    await task.save();

    revalidatePath(`/app/estates/${estateId}/tasks`);
    revalidatePath(`/app/estates/${estateId}`);
    revalidatePath("/app/tasks");
    revalidatePath("/app");
  }

  async function deleteTask(formData: FormData) {
    "use server";

    const sessionInner = await auth();
    if (!sessionInner?.user?.id) {
      redirect("/login");
    }

    const taskId = formData.get("taskId")?.toString();
    if (!taskId) return;

    await connectToDatabase();

    await Task.findOneAndDelete({
      _id: taskId,
      estateId,
      ownerId: sessionInner.user.id,
    });

    revalidatePath(`/app/estates/${estateId}/tasks`);
    revalidatePath(`/app/estates/${estateId}`);
    revalidatePath("/app/tasks");
    revalidatePath("/app");
  }

  const estateLabelSource = estateDoc as unknown as Record<string, unknown>;

  const getEstateLabelField = (key: string): string | undefined => {
    const value = estateLabelSource[key];
    return typeof value === "string" && value.trim().length > 0
      ? value
      : undefined;
  };

  const estateLabel =
    getEstateLabelField("caseName") ??
    getEstateLabelField("displayName") ??
    getEstateLabelField("name") ??
    "Estate";

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-50">
            Tasks for {estateLabel}
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Track all to-dos and follow-ups tied to this estate.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/app/estates/${estateId}/tasks/new`}
            className="inline-flex items-center rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-medium text-emerald-50 shadow-sm shadow-emerald-900/50 hover:bg-emerald-500"
          >
            + New Task
          </Link>
          <Link
            href="/app/tasks"
            className="inline-flex items-center rounded-full border border-slate-700/70 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-slate-500 hover:bg-slate-800/80"
          >
            Global Tasks
          </Link>
        </div>
      </div>

      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">
            Open Tasks
          </p>
          <p className="mt-1 text-xl font-semibold text-slate-50">
            {tasks.filter((t) => t.status === "OPEN").length}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">
            Completed
          </p>
          <p className="mt-1 text-xl font-semibold text-slate-50">
            {tasks.filter((t) => t.status === "DONE").length}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">
            Total Tasks
          </p>
          <p className="mt-1 text-xl font-semibold text-slate-50">
            {tasks.length}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60">
        <table className="min-w-full divide-y divide-slate-800 text-xs">
          <thead className="bg-slate-950/80">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-slate-400">
                Subject
              </th>
              <th className="px-3 py-2 text-left font-medium text-slate-400">
                Status
              </th>
              <th className="px-3 py-2 text-left font-medium text-slate-400">
                Priority
              </th>
              <th className="px-3 py-2 text-left font-medium text-slate-400">
                Due
              </th>
              <th className="px-3 py-2 text-right font-medium text-slate-400">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {tasks.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center text-xs text-slate-500"
                >
                  No tasks yet. Create your first task for this estate.
                </td>
              </tr>
            ) : (
              tasks.map((task) => (
                <tr key={task._id} className="hover:bg-slate-900/40">
                  <td className="px-3 py-2 align-top text-slate-100">
                    <div className="font-medium">{task.subject}</div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className={getStatusClasses(task.status)}>
                      {getStatusLabel(task.status)}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className={getPriorityClasses(task.priority)}>
                      {getPriorityLabel(task.priority)}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top text-slate-300">
                    {task.dueDate
                      ? new Date(task.dueDate).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/app/estates/${estateId}/tasks/${task._id}`}
                        className="inline-flex items-center rounded-full border border-slate-700/70 px-2 py-0.5 text-[11px] text-slate-200 hover:border-slate-500 hover:bg-slate-900/80"
                      >
                        View
                      </Link>

                      <form action={toggleTaskStatus}>
                        <input
                          type="hidden"
                          name="taskId"
                          value={task._id}
                        />
                        <button
                          type="submit"
                          className="inline-flex items-center rounded-full border border-emerald-700/70 bg-emerald-950/50 px-2 py-0.5 text-[11px] text-emerald-100 hover:border-emerald-500 hover:bg-emerald-900/70"
                        >
                          {task.status === "DONE" ? "Reopen" : "Mark done"}
                        </button>
                      </form>

                      <form action={deleteTask}>
                        <input
                          type="hidden"
                          name="taskId"
                          value={task._id}
                        />
                        <button
                          type="submit"
                          className="inline-flex items-center rounded-full border border-rose-800/70 bg-rose-950/50 px-2 py-0.5 text-[11px] text-rose-100 hover:border-rose-500 hover:bg-rose-900/70"
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}