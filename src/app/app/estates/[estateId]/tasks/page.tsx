import Link from "next/link";
import { redirect } from "next/navigation";
import { connectToDatabase } from "@/lib/db";
import { Task } from "@/models/Task";

type TaskItem = {
  _id: string | { toString(): string };
  subject: string;
  description?: string;
  notes?: string;
  status?: string;
  priority?: string;
  date?: string | Date | null;
  createdAt?: string | Date;
};

interface PageProps {
  params: Promise<{
    estateId: string;
  }>;
}

function formatDate(value?: string | Date | null): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatStatus(status?: string): string {
  if (!status) return "Not started";
  const normalized = status.toLowerCase();
  if (normalized === "in_progress") return "In progress";
  if (normalized === "completed") return "Completed";
  if (normalized === "blocked") return "Blocked";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

async function getTasks(estateId: string): Promise<TaskItem[]> {
  await connectToDatabase();
  const tasks = await Task.find({ estateId })
    .sort({ date: 1, createdAt: -1 })
    .lean();
  return tasks as unknown as TaskItem[];
}

async function deleteTask(formData: FormData): Promise<void> {
  "use server";

  const estateId = formData.get("estateId");
  const taskId = formData.get("taskId");

  if (
    !estateId ||
    !taskId ||
    typeof estateId !== "string" ||
    typeof taskId !== "string"
  ) {
    return;
  }

  await connectToDatabase();

  await Task.findOneAndDelete({ _id: taskId, estateId });

  redirect(`/app/estates/${estateId}/tasks`);
}

export default async function EstateTasksPage({ params }: PageProps) {
  const { estateId } = await params;

  const tasks = await getTasks(estateId);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-3 border-b border-slate-800 pb-4 sm:flex-row sm:items-center">
        <div>
          <p className="mb-1 text-[11px] uppercase tracking-[0.18em] text-slate-500">
            Tasks
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
            Estate tasks
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Track to-dos, deadlines, and follow-ups for this estate.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Link
            href={`/app/estates/${estateId}`}
            className="inline-flex items-center rounded-lg border border-slate-800 px-3 py-1.5 font-medium text-slate-300 hover:border-slate-500/70 hover:text-slate-100"
          >
            Back to estate overview
          </Link>
          <Link
            href={`/app/estates/${estateId}/tasks/new`}
            className="inline-flex items-center rounded-lg bg-emerald-500 px-3 py-1.5 font-medium text-emerald-950 hover:bg-emerald-400"
          >
            + New task
          </Link>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60 shadow-sm shadow-black/40">
        <table className="min-w-full text-sm">
          <thead className="border-b border-slate-800 bg-slate-950/80 text-xs uppercase tracking-[0.16em] text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">Task</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Priority</th>
              <th className="px-4 py-3 text-left">Due</th>
              <th className="px-4 py-3 text-left">Created</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 ? (
              <tr>
                <td
                  className="px-4 py-10 text-center text-xs text-slate-500"
                  colSpan={6}
                >
                  No tasks yet for this estate.{" "}
                  <Link
                    href={`/app/estates/${estateId}/tasks/new`}
                    className="font-medium text-emerald-400 hover:text-emerald-300"
                  >
                    Create the first task
                  </Link>
                  .
                </td>
              </tr>
            ) : (
              tasks.map((task) => {
                const id =
                  typeof task._id === "string"
                    ? task._id
                    : task._id.toString();

                return (
                  <tr
                    key={id}
                    className="border-t border-slate-900/60 hover:bg-slate-900/40"
                  >
                    <td className="px-4 py-3 align-top">
                      <div className="font-medium text-slate-50">
                        <Link
                          href={`/app/estates/${estateId}/tasks/${id}`}
                          className="hover:underline"
                        >
                          {task.subject}
                        </Link>
                      </div>
                      {task.description && (
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">
                          {task.description}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-slate-200">
                      {formatStatus(task.status)}
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-slate-200">
                      {task.priority ? task.priority : "Medium"}
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-slate-200">
                      {formatDate(task.date)}
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-slate-200">
                      {formatDate(task.createdAt)}
                    </td>
                    <td className="px-4 py-3 align-top text-right text-xs">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/app/estates/${estateId}/tasks/${id}`}
                          className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-slate-100 hover:bg-slate-800"
                        >
                          View
                        </Link>
                        <Link
                          href={`/app/estates/${estateId}/tasks/${id}/edit`}
                          className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-slate-100 hover:bg-slate-800"
                        >
                          Edit
                        </Link>

                        {/* Status toggle from list */}
                        <form
                          method="POST"
                          action={`/api/estates/${estateId}/tasks/${id}`}
                          className="inline-flex"
                        >
                          <input type="hidden" name="intent" value="toggleStatus" />
                          <button
                            type="submit"
                            className="inline-flex items-center rounded-lg border border-emerald-600/60 bg-emerald-900/20 px-2.5 py-1 text-[11px] font-semibold text-emerald-200 hover:border-emerald-500 hover:bg-emerald-900/40"
                          >
                            {task.status === "DONE" ? "Mark open" : "Mark done"}
                          </button>
                        </form>

                        {/* Delete from list */}
                        <form action={deleteTask} className="inline-flex">
                          <input type="hidden" name="estateId" value={estateId} />
                          <input
                            type="hidden"
                            name="taskId"
                            value={id}
                          />
                          <button
                            type="submit"
                            className="inline-flex items-center rounded-lg border border-rose-600/60 bg-rose-900/20 px-2.5 py-1 text-[11px] font-semibold text-rose-200 hover:border-rose-500 hover:bg-rose-900/40"
                          >
                            Delete
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}