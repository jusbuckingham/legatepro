// src/app/app/estates/[estateId]/tasks/page.tsx
import { connectToDatabase } from "@/lib/db";
import { Task } from "@/models/Task";

interface Params {
  params: { estateId: string };
}

export const dynamic = "force-dynamic";

export default async function EstateTasksPage({ params }: Params) {
  await connectToDatabase();
  const tasks = await Task.find({ estateId: params.estateId }).sort({ date: 1 }).lean();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Tasks</h2>
        {/* TODO: add "New task" button with server action */}
      </div>

      {tasks.length === 0 ? (
        <p className="text-sm text-slate-400">No tasks yet. You can start adding them soon.</p>
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
                <th className="px-3 py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task: any) => (
                <tr key={task._id} className="border-t border-slate-800">
                  <td className="px-3 py-2 align-top">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs ${
                        task.status === "DONE"
                          ? "bg-emerald-500/10 text-emerald-300"
                          : "bg-slate-800 text-slate-300"
                      }`}
                    >
                      {task.status === "DONE" ? "Done" : "Open"}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top text-slate-300">
                    {task.date ? new Date(task.date).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className="inline-flex rounded-full bg-slate-800 px-2 py-0.5 text-xs capitalize text-slate-200">
                      {task.priority.toLowerCase()}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top text-slate-200">{task.subject}</td>
                  <td className="px-3 py-2 align-top text-slate-100">
                    {task.description}
                  </td>
                  <td className="px-3 py-2 align-top text-slate-300">
                    {task.notes || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}