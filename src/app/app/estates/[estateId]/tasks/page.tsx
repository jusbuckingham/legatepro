

import { connectToDatabase } from "@/lib/db";
import { Task } from "@/models/Task";
import { redirect } from "next/navigation";

interface EstateTasksPageProps {
  params: {
    estateId: string;
  };
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

export default async function EstateTasksPage({ params }: EstateTasksPageProps) {
  const { estateId } = params;

  await connectToDatabase();

  const tasks = await Task.find({ estateId })
    .sort({ date: 1, createdAt: 1 })
    .lean();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Tasks</h2>
          <p className="text-sm text-slate-400">
            Keep track of everything you need to do for this estate: court filings, utilities, property
            tasks, communication with heirs, and more.
          </p>
        </div>
      </div>

      {/* New task form */}
      <form
        action={createTask}
        className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4"
      >
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
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 outline-none focus:border-emerald-400"
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
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 outline-none focus:border-emerald-400"
              placeholder="e.g. Dickerson, Tuller, Probate, Taxes"
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
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs uppercase tracking-wide text-slate-100 outline-none focus:border-emerald-400"
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
            className="w-full resize-none rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 outline-none focus:border-emerald-400"
            placeholder="e.g. Contact DTE to transfer utilities, schedule appraisal for Tuxedo, email attorney about hearing date"
            required
          />
        </div>

        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-emerald-400"
        >
          Add task
        </button>
      </form>

      {/* Tasks table */}
      {tasks.length === 0 ? (
        <p className="text-sm text-slate-400">
          No tasks yet. Start by adding everything you&apos;ve already done or know you need to do—
          filings, letters, property visits, calls with attorneys, and more.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/40">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Priority</th>
                <th className="px-3 py-2">Subject</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task: any) => {
                const isDone = task.status === "DONE";
                const date = task.date
                  ? new Date(task.date).toLocaleDateString()
                  : "—";

                return (
                  <tr key={task._id.toString()} className="border-t border-slate-800">
                    <td className="px-3 py-2 align-top">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs ${
                          isDone
                            ? "bg-emerald-500/10 text-emerald-300"
                            : "bg-slate-800 text-slate-300"
                        }`}
                      >
                        {isDone ? "Done" : "Open"}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top text-slate-300">{date}</td>
                    <td className="px-3 py-2 align-top">
                      <span className="inline-flex rounded-full bg-slate-800 px-2 py-0.5 text-xs capitalize text-slate-200">
                        {task.priority?.toLowerCase() || "medium"}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top text-slate-200">{task.subject}</td>
                    <td className="px-3 py-2 align-top text-slate-100">
                      {task.description}
                    </td>
                    <td className="px-3 py-2 align-top text-right">
                      {!isDone && (
                        <form action={completeTask} className="inline">
                          <input type="hidden" name="taskId" value={task._id.toString()} />
                          <input type="hidden" name="estateId" value={estateId} />
                          <button
                            type="submit"
                            className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
                          >
                            Mark done
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}