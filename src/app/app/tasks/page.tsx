import Link from "next/link";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";
import { Task } from "@/models/Task";

type GlobalTask = {
  id: string;
  subject: string;
  status: "OPEN" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH";
  estateId?: string;
  estateLabel: string;
  createdAt?: Date;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  year: "numeric",
});

export default async function TasksLandingPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return (
      <div className="space-y-6">
        <div className="border-b border-slate-800 pb-4">
          <p className="mb-1 text-[11px] uppercase tracking-[0.18em] text-slate-500">
            Tasks
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
            Tasks workspace
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            You need to be signed in to view your global task overview.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6 text-sm text-slate-300">
          <p>
            Please{" "}
            <Link
              href="/login"
              className="font-medium text-emerald-400 hover:text-emerald-300"
            >
              log in
            </Link>{" "}
            to see tasks across all estates.
          </p>
        </div>
      </div>
    );
  }

  await connectToDatabase();

  // Load tasks and estates for this user
  const [taskDocs, estateDocs] = await Promise.all([
    Task.find({ ownerId: session.user.id }).lean().exec(),
    Estate.find({ ownerId: session.user.id }).lean().exec(),
  ]);

  // Build a lookup for estate labels
  const estateLabelById = new Map<string, string>();
  for (const raw of estateDocs) {
    const estate = raw as unknown as {
      _id: string;
      caseName?: string;
      displayName?: string;
      courtCaseNumber?: string;
    };

    const label =
      estate.caseName ||
      estate.displayName ||
      (estate.courtCaseNumber
        ? `Estate ${estate.courtCaseNumber}`
        : "Unnamed estate");

    estateLabelById.set(estate._id.toString(), label);
  }

  const tasks: GlobalTask[] = (taskDocs as unknown as Array<{
    _id: string;
    subject?: string;
    status?: "OPEN" | "DONE";
    priority?: "LOW" | "MEDIUM" | "HIGH";
    estateId?: string;
    createdAt?: Date;
  }>).map((t) => ({
    id: t._id.toString(),
    subject: t.subject ?? "(No subject)",
    status: t.status ?? "OPEN",
    priority: t.priority ?? "MEDIUM",
    estateId: t.estateId,
    estateLabel: t.estateId
      ? estateLabelById.get(t.estateId.toString()) ?? "Unknown estate"
      : "Unassigned",
    createdAt: t.createdAt,
  }));

  const totalTasks = tasks.length;
  const openTasks = tasks.filter((t) => t.status === "OPEN").length;
  const doneTasks = tasks.filter((t) => t.status === "DONE").length;
  const highPriorityOpen = tasks.filter(
    (t) => t.status === "OPEN" && t.priority === "HIGH",
  ).length;

  const hasTasks = totalTasks > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-slate-800 pb-4">
        <p className="mb-1 text-[11px] uppercase tracking-[0.18em] text-slate-500">
          Tasks
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
          Tasks workspace
        </h1>
        <p className="mt-1 text-xs text-slate-400">
          Global view of all tasks across your estates. Use this to see what’s
          on deck at a glance.
        </p>
      </div>

      {/* Empty state */}
      {!hasTasks && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6 text-sm text-slate-300">
          <p className="mb-2">
            You don’t have any tasks yet in your estates.
          </p>
          <p>
            Start by choosing an estate from the{" "}
            <Link
              href="/app/estates"
              className="font-medium text-emerald-400 hover:text-emerald-300"
            >
              Estates
            </Link>{" "}
            tab and adding tasks from that estate’s{" "}
            <span className="font-medium text-slate-100">Tasks</span> section.
          </p>
        </div>
      )}

      {/* Summary cards */}
      {hasTasks && (
        <div className="grid gap-4 md:grid-cols-4">
          <SummaryCard label="Open tasks" value={openTasks} />
          <SummaryCard label="Completed" value={doneTasks} />
          <SummaryCard label="High-priority open" value={highPriorityOpen} />
          <SummaryCard label="Total tasks" value={totalTasks} />
        </div>
      )}

      {/* Table */}
      {hasTasks && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-slate-100">
                All tasks
              </h2>
              <p className="text-xs text-slate-400">
                Tasks across all estates, most recent first.
              </p>
            </div>
            <p className="text-[11px] text-slate-500">
              {totalTasks} {totalTasks === 1 ? "task" : "tasks"}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                <tr>
                  <th className="py-2 pr-4">Task</th>
                  <th className="py-2 pr-4">Estate</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Priority</th>
                  <th className="py-2 pr-4">Opened</th>
                  <th className="py-2 pl-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tasks
                  .slice()
                  .sort((a, b) => {
                    const aTime = a.createdAt
                      ? a.createdAt.getTime()
                      : Number.MIN_SAFE_INTEGER;
                    const bTime = b.createdAt
                      ? b.createdAt.getTime()
                      : Number.MIN_SAFE_INTEGER;
                    return bTime - aTime;
                  })
                  .map((task) => (
                    <tr
                      key={task.id}
                      className="border-b border-slate-800/60 last:border-b-0"
                    >
                      <td className="py-2 pr-4 align-top text-slate-100">
                        {task.subject}
                      </td>
                      <td className="py-2 pr-4 align-top text-slate-300">
                        {task.estateId ? (
                          <Link
                            href={`/app/estates/${task.estateId}`}
                            className="hover:text-emerald-300"
                          >
                            {task.estateLabel}
                          </Link>
                        ) : (
                          <span className="text-slate-500">
                            Unassigned estate
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4 align-top">
                        <StatusPill status={task.status} />
                      </td>
                      <td className="py-2 pr-4 align-top">
                        <PriorityPill priority={task.priority} />
                      </td>
                      <td className="py-2 pr-4 align-top text-slate-300">
                        {task.createdAt
                          ? dateFormatter.format(task.createdAt)
                          : "—"}
                      </td>
                      <td className="py-2 pl-4 align-top text-right">
                        {task.estateId ? (
                          <div className="inline-flex gap-2">
                            <Link
                              href={`/app/estates/${task.estateId}/tasks/${task.id}`}
                              className="rounded-full border border-slate-700 px-3 py-1 text-[11px] font-medium text-slate-200 hover:border-slate-500 hover:bg-slate-900"
                            >
                              View
                            </Link>
                            <Link
                              href={`/app/estates/${task.estateId}/tasks/${task.id}/edit`}
                              className="rounded-full border border-emerald-500/70 px-3 py-1 text-[11px] font-medium text-emerald-300 hover:border-emerald-400 hover:bg-emerald-500/10"
                            >
                              Edit
                            </Link>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-600">
                            No estate
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard(props: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
        {props.label}
      </p>
      <p className="mt-1 text-lg font-semibold text-slate-50">{props.value}</p>
    </div>
  );
}

function StatusPill(props: { status: "OPEN" | "DONE" }) {
  const isDone = props.status === "DONE";
  const label = isDone ? "Done" : "Open";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ${
        isDone
          ? "border border-emerald-500/60 bg-emerald-500/10 text-emerald-200"
          : "border border-amber-500/60 bg-amber-500/10 text-amber-200"
      }`}
    >
      {label}
    </span>
  );
}

function PriorityPill(props: {
  priority: "LOW" | "MEDIUM" | "HIGH";
}) {
  const { priority } = props;
  let classes =
    "border-slate-600 bg-slate-800/80 text-slate-100"; // default / MEDIUM

  if (priority === "HIGH") {
    classes = "border-rose-500/60 bg-rose-500/10 text-rose-200";
  } else if (priority === "LOW") {
    classes = "border-sky-500/60 bg-sky-500/10 text-sky-200";
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] border ${classes}`}
    >
      {priority.charAt(0) + priority.slice(1).toLowerCase()}
    </span>
  );
}