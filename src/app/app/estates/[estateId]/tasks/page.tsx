// src/app/app/estates/[estateId]/tasks/page.tsx
import { redirect } from "next/navigation";
import { connectToDatabase } from "../../../../../lib/db";
import { Task } from "../../../../../models/Task";

interface EstateTasksPageProps {
  params: {
    estateId: string;
  };
}

interface TaskItem {
  _id: { toString(): string };
  status?: string;
  date?: string | Date;
  priority?: string;
  subject?: string;
  description?: string;
  createdAt?: string | Date;
  completedAt?: string | Date;
}

export const dynamic = "force-dynamic";

async function createTask(formData: FormData) {
  "use server";

  const estateId = formData.get("estateId")?.toString();
  const date = formData.get("date")?.toString();
  const subject = formData.get("subject")?.toString().trim();
  const description = formData.get("description")?.toString().trim();
  const priority = (formData.get("priority")?.toString() || "MEDIUM").toUpperCase();

  if (!estateId || !subject || !description || !date) {
    return;
  }

  await connectToDatabase();

  await Task.create({
    estateId,
    status: "OPEN",
    date,
    priority,
    subject,
    description,
  });

  redirect(`/app/estates/${estateId}/tasks`);
}

async function completeTask(formData: FormData) {
  "use server";

  const taskId = formData.get("taskId")?.toString();
  const estateId = formData.get("estateId")?.toString();

  if (!taskId || !estateId) return;

  await connectToDatabase();

  await Task.findByIdAndUpdate(taskId, {
    status: "DONE",
    completedAt: new Date(),
  });

  redirect(`/app/estates/${estateId}/tasks`);
}

function formatDate(value?: string | Date): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function priorityLabel(priority?: string): string {
  if (!priority) return "Medium";
  const upper = priority.toUpperCase();
  if (upper === "LOW") return "Low";
  if (upper === "HIGH") return "High";
  return "Medium";
}

function priorityClass(priority?: string): string {
  const upper = (priority || "MEDIUM").toUpperCase();
  switch (upper) {
    case "LOW":
      return "border-slate-700 bg-slate-900 text-slate-200";
    case "HIGH":
      return "border-amber-600/60 bg-amber-900/40 text-amber-100";
    case "MEDIUM":
    default:
      return "border-rose-700/60 bg-rose-900/30 text-rose-100";
  }
}

export default async function EstateTasksPage({ params }: EstateTasksPageProps) {
  const { estateId } = params;

  await connectToDatabase();
  const tasks = (await Task.find({ estateId })
    .sort({ date: 1, createdAt: 1 })
    .lean()) as TaskItem[];

  const openTasks = tasks.filter((t) => t.status !== "DONE");
  const doneTasks = tasks.filter((t) => t.status === "DONE");

  return (
    <div className="space-y-6 p-6">
      {/* Header / intro */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <nav className="text-xs text-slate-500">
            <span className="text-slate-500">Estates</span>
            <span className="mx-1 text-slate-600">/</span>
            <span className="text-slate-300">Current estate</span>
            <span className="mx-1 text-slate-600">/</span>
            <span className="text-rose-300">Tasks</span>
          </nav>

          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-50">
              Task list
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Capture every filing, phone call, visit, and follow-up tied to this estate.
              When it&apos;s time to account for your work as personal representative, this
              becomes your running checklist.
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 text-xs">
          <span className="inline-flex items-center rounded-full border border-rose-500/40 bg-rose-950/70 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-rose-100 shadow-sm">
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-rose-400" />
            Tasks &amp; follow-ups
          </span>
          <p className="max-w-xs text-right text-[11px] text-slate-500">
            Use clear subjects (e.g. <span className="text-slate-300">“Dickerson – taxes”</span>)
            so you can scan quickly later.
          </p>
        </div>
      </div>

      {/* New task form */}
      <section className="space-y-3 rounded-xl border border-rose-900/40 bg-slate-950/70 p-4 shadow-sm shadow-rose-950/40">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-rose-200">
            Add task
          </h2>
          <p className="text-[11px] text-slate-500">
            Good for filings, court calls, utility transfers, property visits, and more.
          </p>
        </div>

        <form action={createTask} className="space-y-3">
          <input type="hidden" name="estateId" value={estateId} />
          <div className="grid gap-3 md:grid-cols-[140px,1fr,140px]">
            <div className="space-y-1">
              <label htmlFor="date" className="text-xs font-medium text-slate-200">
                Date
              </label>
              <input
                id="date"
                name="date"
                type="date"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 outline-none focus:border-rose-400"
                required
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="subject" className="text-xs font-medium text-slate-200">
                Subject
              </label>
              <input
                id="subject"
                name="subject"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 outline-none focus:border-rose-400"
                placeholder="e.g. Dickerson – DTE transfer, Tuxedo – appraisal, Probate – hearing"
                required
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="priority" className="text-xs font-medium text-slate-200">
                Priority
              </label>
              <select
                id="priority"
                name="priority"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs uppercase tracking-wide text-slate-100 outline-none focus:border-rose-400"
                defaultValue="MEDIUM"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="description" className="text-xs font-medium text-slate-200">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={2}
              className="w-full resize-none rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 outline-none focus:border-rose-400"
              placeholder="e.g. Call DTE to move account into estate, schedule inspection for Tuxedo, email attorney about next hearing date."
              required
            />
          </div>

          <div className="flex items-center justify-between gap-3 pt-1 text-xs">
            <p className="text-[11px] text-slate-500">
              You can mark tasks as done once you complete the call, filing, or visit.
            </p>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-md bg-rose-500 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-rose-400"
            >
              Add task
            </button>
          </div>
        </form>
      </section>

      {/* Tasks list */}
      {tasks.length === 0 ? (
        <section className="rounded-xl border border-dashed border-slate-700 bg-slate-950/60 px-4 py-4 text-sm text-slate-400">
          No tasks yet. Start by adding everything you&apos;ve already done or know you
          need to do—filings, letters, property visits, calls with attorneys, and more.
        </section>
      ) : (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
              Task list
            </h2>
            <p className="text-[11px] text-slate-500">
              {openTasks.length} open · {doneTasks.length} completed
            </p>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/80">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Priority</th>
                  <th className="px-3 py-2">Subject</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 w-24 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {openTasks.map((task) => {
                  const dateLabel = formatDate(task.date ?? task.createdAt);
                  return (
                    <tr
                      key={task._id.toString()}
                      className="border-t border-slate-800/80 bg-slate-950/40"
                    >
                      <td className="px-3 py-2 align-top">
                        <span className="inline-flex items-center rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-100">
                          <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-rose-400" />
                          Open
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top text-slate-300">
                        {dateLabel}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${priorityClass(
                            task.priority
                          )}`}
                        >
                          {priorityLabel(task.priority)}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top text-slate-200">
                        {task.subject}
                      </td>
                      <td className="px-3 py-2 align-top text-slate-100">
                        {task.description}
                      </td>
                      <td className="px-3 py-2 align-top text-right">
                        <form action={completeTask} className="inline">
                          <input
                            type="hidden"
                            name="taskId"
                            value={task._id.toString()}
                          />
                          <input type="hidden" name="estateId" value={estateId} />
                          <button
                            type="submit"
                            className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
                          >
                            Mark done
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}

                {doneTasks.length > 0 && (
                  <tr className="border-t border-slate-900/80">
                    <td
                      colSpan={6}
                      className="bg-slate-950/80 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500"
                    >
                      Completed
                    </td>
                  </tr>
                )}

                {doneTasks.map((task) => {
                  const dateLabel = formatDate(
                    task.date ?? task.completedAt ?? task.createdAt
                  );
                  return (
                    <tr
                      key={task._id.toString()}
                      className="border-t border-slate-900/70 bg-slate-950/40"
                    >
                      <td className="px-3 py-2 align-top">
                        <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-200">
                          <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          Done
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top text-slate-300">
                        {dateLabel}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${priorityClass(
                            task.priority
                          )}`}
                        >
                          {priorityLabel(task.priority)}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top text-slate-200">
                        {task.subject}
                      </td>
                      <td className="px-3 py-2 align-top text-slate-100">
                        {task.description}
                      </td>
                      <td className="px-3 py-2 align-top text-right text-xs text-slate-500">
                        {/* Reserved for future: undo / notes */}
                        —
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}