import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { requireEstateAccess } from "@/lib/estateAccess";
import { EstateTask } from "@/models/EstateTask";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    estateId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type TaskStatus = "NOT_STARTED" | "IN_PROGRESS" | "DONE";

type EstateTaskLean = {
  _id: unknown;
  title?: string | null;
  description?: string | null;
  status?: string | null;
  dueDate?: Date | string | null;
  completedAt?: Date | string | null;
};

type TaskItem = {
  _id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  dueDate?: string | null;
  isOverdue: boolean;
};

function parseStatus(raw: unknown): TaskStatus {
  if (typeof raw !== "string") return "NOT_STARTED";
  const upper = raw.toUpperCase();
  if (upper === "IN_PROGRESS" || upper === "DONE") return upper;
  return "NOT_STARTED";
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

/**
 * Server action: create a new task for the estate.
 */
async function createTask(formData: FormData): Promise<void> {
  "use server";

  const estateId = formData.get("estateId")?.toString();
  const title = formData.get("title")?.toString().trim();
  const description = formData.get("description")?.toString().trim() || "";
  const dueDateRaw = formData.get("dueDate")?.toString().trim() || "";
  const statusRaw = formData.get("status")?.toString().trim() || "";

  if (!estateId || !title) {
    return;
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  // Permission check: viewers can't create tasks
  const access = await requireEstateAccess({ estateId });
  if (access.role === "VIEWER") {
    redirect(`/app/estates/${estateId}/tasks?forbidden=1`);
  }

  await connectToDatabase();

  const status = parseStatus(statusRaw);
  let dueDate: Date | undefined;
  if (dueDateRaw) {
    const d = new Date(dueDateRaw);
    if (!Number.isNaN(d.getTime())) {
      dueDate = d;
    }
  }

  await EstateTask.create({
    estateId,
    ownerId: session.user.id,
    title,
    description: description || undefined,
    status,
    dueDate,
  });

  redirect(`/app/estates/${estateId}/tasks`);
}

/**
 * Server action: update status (and optionally due date) of a task.
 */
async function updateTaskStatus(formData: FormData): Promise<void> {
  "use server";

  const estateId = formData.get("estateId")?.toString();
  const taskId = formData.get("taskId")?.toString();
  const statusRaw = formData.get("status")?.toString().trim() || "";

  if (!estateId || !taskId) return;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const access = await requireEstateAccess({ estateId });
  if (access.role === "VIEWER") {
    revalidatePath(`/app/estates/${estateId}/tasks`);
    return;
  }

  await connectToDatabase();

  const status = parseStatus(statusRaw);

  const update: Partial<EstateTaskLean> = {
    status,
  };

  if (status === "DONE") {
    update.completedAt = new Date();
  } else {
    update.completedAt = null;
  }

  await EstateTask.findOneAndUpdate(
    { _id: taskId, estateId },
    update,
  );

  revalidatePath(`/app/estates/${estateId}/tasks`);
}

/**
 * Server action: delete a task.
 */
async function deleteTask(formData: FormData): Promise<void> {
  "use server";

  const estateId = formData.get("estateId")?.toString();
  const taskId = formData.get("taskId")?.toString();

  if (!estateId || !taskId) return;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const access = await requireEstateAccess({ estateId });
  if (access.role === "VIEWER") {
    revalidatePath(`/app/estates/${estateId}/tasks`);
    return;
  }

  await connectToDatabase();

  await EstateTask.findOneAndDelete({
    _id: taskId,
    estateId,
  });

  revalidatePath(`/app/estates/${estateId}/tasks`);
}

export default async function EstateTasksPage({
  params,
  searchParams,
}: PageProps) {
  const { estateId } = await params;

  let searchQuery = "";
  let statusFilter: TaskStatus | "ALL" = "ALL";

  if (searchParams) {
    const sp = await searchParams;
    const qRaw = sp.q;
    const statusRaw = sp.status;

    searchQuery =
      typeof qRaw === "string"
        ? qRaw.trim()
        : Array.isArray(qRaw)
        ? (qRaw[0] ?? "").trim()
        : "";

    if (statusRaw) {
      const raw =
        typeof statusRaw === "string"
          ? statusRaw
          : Array.isArray(statusRaw)
          ? statusRaw[0]
          : "";
      const upper = raw.toUpperCase();
      if (
        upper === "NOT_STARTED" ||
        upper === "IN_PROGRESS" ||
        upper === "DONE"
      ) {
        statusFilter = upper as TaskStatus;
      } else {
        statusFilter = "ALL";
      }
    }
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/app/estates/${estateId}/tasks`);
  }

  await connectToDatabase();
  const access = await requireEstateAccess({ estateId });
  const isViewer = access.role === "VIEWER";

  const docs = (await EstateTask.find(
    { estateId },
    { title: 1, description: 1, status: 1, dueDate: 1, completedAt: 1 },
  )
    .sort({ dueDate: 1, createdAt: 1 })
    .lean()) as EstateTaskLean[];

  const tasks: TaskItem[] = docs.map((doc) => {
    const title =
      typeof doc.title === "string" && doc.title.trim().length > 0
        ? doc.title
        : "Task";

    const status = parseStatus(doc.status ?? null);

    const due =
      doc.dueDate instanceof Date
        ? doc.dueDate.toISOString()
        : (doc.dueDate as string | null | undefined) ?? null;

    let isOverdue = false;
    if (due) {
      const dueDate = new Date(due);
      const now = new Date();
      if (!Number.isNaN(dueDate.getTime())) {
        isOverdue = dueDate < now && status !== "DONE";
      }
    }

    return {
      _id: String(doc._id),
      title,
      description: doc.description ?? null,
      status,
      dueDate: due,
      isOverdue,
    };
  });

  const filteredTasks = tasks.filter((task) => {
    if (statusFilter !== "ALL" && task.status !== statusFilter) {
      return false;
    }

    if (!searchQuery) return true;

    const q = searchQuery.toLowerCase();
    const title = task.title.toLowerCase();
    const desc = (task.description ?? "").toLowerCase();

    return title.includes(q) || desc.includes(q);
  });

  const openCount = tasks.filter((t) => t.status !== "DONE").length;
  const doneCount = tasks.filter((t) => t.status === "DONE").length;
  const overdueCount = tasks.filter((t) => t.isOverdue).length;

  const hasFilters =
    !!searchQuery || (statusFilter !== "ALL" && statusFilter !== undefined);

  return (
    <div className="space-y-6 p-6">
      {/* Header / breadcrumb */}
      <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <nav className="text-xs text-gray-500">
            <Link href="/app/estates" className="hover:underline">
              Estates
            </Link>
            <span className="mx-1 text-gray-400">/</span>
            <Link
              href={`/app/estates/${estateId}`}
              className="hover:underline"
            >
              Overview
            </Link>
            <span className="mx-1 text-gray-400">/</span>
            <span className="text-gray-900">Tasks</span>
          </nav>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-900">
              Checklist &amp; tasks for this estate
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-gray-600">
              Keep everything you need to do in one place—court dates, bank
              calls, paperwork, and follow-ups. Mark items done as you go.
            </p>
          </div>
        </div>
        <div className="mt-1 flex flex-col items-end gap-1 text-xs text-gray-500">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-700">
              Role: {access.role}
            </span>
            <span>
              <span className="font-medium">{openCount}</span> open
            </span>
            <span>·</span>
            <span>
              <span className="font-medium">{doneCount}</span> done
            </span>
            <span>·</span>
            <span
              className={
                overdueCount > 0
                  ? "font-medium text-red-600"
                  : "font-medium text-gray-500"
              }
            >
              {overdueCount} overdue
            </span>
          </div>
          <span className="text-[11px] text-gray-400">
            This checklist is private to your team and not shared with the court.
          </span>
        </div>
      </div>

      {isViewer && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="font-semibold">Viewer access</div>
              <div className="text-xs text-amber-800">
                You can view tasks, but you can’t create, update, or delete them.
              </div>
            </div>
            <Link
              href={`/app/estates/${estateId}?requestAccess=1`}
              className="inline-flex items-center justify-center rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
            >
              Request edit access
            </Link>
          </div>
        </div>
      )}

      {/* New task form */}
      <section
        className={
          "space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm" +
          (isViewer ? " opacity-60 pointer-events-none" : "")
        }
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-700">
              Add a new task
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              Capture clear, concrete steps—&quot;Call bank about estate
              account&quot;, &quot;Gather property tax statements&quot;, or
              &quot;Prepare inventory for court&quot;.
            </p>
          </div>
        </div>

        <form action={createTask} className="space-y-3 pt-1">
          <input type="hidden" name="estateId" value={estateId} />

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-800">
              Task title
            </label>
            <input
              name="title"
              required
              placeholder="e.g. File initial inventory with the court"
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 placeholder:text-gray-400"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-800">
              Details (optional)
            </label>
            <textarea
              name="description"
              rows={2}
              placeholder="Any notes, phone numbers, or details to remember…"
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 placeholder:text-gray-400"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr,1fr]">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-800">
                Due date (optional)
              </label>
              <input
                type="date"
                name="dueDate"
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-800">
                Status
              </label>
              <select
                name="status"
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
                defaultValue="NOT_STARTED"
              >
                <option value="NOT_STARTED">Not started</option>
                <option value="IN_PROGRESS">In progress</option>
                <option value="DONE">Done</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end border-t border-gray-100 pt-3">
            <button
              type="submit"
              className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
            >
              Add task
            </button>
          </div>
        </form>
      </section>

      {/* Filters */}
      <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <form
          method="GET"
          className="flex flex-col gap-2 text-xs md:flex-row md:items-center md:justify-between"
        >
          <div className="flex flex-1 items-center gap-2">
            <label
              htmlFor="q"
              className="whitespace-nowrap text-[11px] text-gray-500"
            >
              Search
            </label>
            <input
              id="q"
              name="q"
              defaultValue={searchQuery}
              placeholder="Search by title or details…"
              className="h-7 w-full rounded-md border border-gray-300 px-2 text-xs text-gray-900 placeholder:text-gray-400"
            />
          </div>

          <div className="flex items-center gap-2 md:w-auto">
            <label
              htmlFor="status"
              className="whitespace-nowrap text-[11px] text-gray-500"
            >
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={statusFilter}
              className="h-7 rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-900"
            >
              <option value="ALL">All</option>
              <option value="NOT_STARTED">Not started</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="DONE">Done</option>
            </select>

            {hasFilters && (
              <a
                href={`/app/estates/${estateId}/tasks`}
                className="whitespace-nowrap text-[11px] text-gray-500 hover:text-gray-800"
              >
                Clear
              </a>
            )}
          </div>
        </form>
      </section>

      {/* Task list */}
      <section className="space-y-2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        {tasks.length === 0 ? (
          <p className="text-sm text-gray-500">
            You don&apos;t have any tasks yet. Start with the next 3–5 things
            you know you need to do—no need to be perfect, you can always
            adjust later.
          </p>
        ) : filteredTasks.length === 0 ? (
          <p className="text-sm text-gray-500">
            No tasks match this search or status filter.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-gray-500">
                  <th className="px-3 py-2">Task</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Due</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map((task) => (
                  <tr key={task._id} className="border-b last:border-0">
                    <td className="px-3 py-2 align-top">
                      <div className="space-y-0.5">
                        <div className="font-medium text-gray-900">
                          {task.title}
                        </div>
                        {task.description && (
                          <div className="text-xs text-gray-500">
                            {task.description}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          task.status === "DONE"
                            ? "bg-green-100 text-green-800"
                            : task.isOverdue
                            ? "bg-red-100 text-red-800"
                            : task.status === "IN_PROGRESS"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {task.status === "NOT_STARTED"
                          ? "Not started"
                          : task.status === "IN_PROGRESS"
                          ? "In progress"
                          : "Done"}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top">
                      {task.dueDate ? (
                        <span
                          className={
                            task.isOverdue && task.status !== "DONE"
                              ? "text-red-600"
                              : "text-gray-700"
                          }
                        >
                          {formatDate(task.dueDate)}
                        </span>
                      ) : (
                        <span className="text-gray-400">No due date</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className={`flex justify-end gap-2 text-xs ${isViewer ? "opacity-60" : ""}`}>
                        {task.status !== "DONE" && (
                          <form action={updateTaskStatus}>
                            <input
                              type="hidden"
                              name="estateId"
                              value={estateId}
                            />
                            <input
                              type="hidden"
                              name="taskId"
                              value={task._id}
                            />
                            <input
                              type="hidden"
                              name="status"
                              value="DONE"
                            />
                            <button
                              type="submit"
                              disabled={isViewer}
                              className={
                                isViewer
                                  ? "cursor-not-allowed text-gray-400"
                                  : "text-green-700 hover:underline"
                              }
                            >
                              Mark done
                            </button>
                          </form>
                        )}
                        {task.status === "DONE" && (
                          <form action={updateTaskStatus}>
                            <input
                              type="hidden"
                              name="estateId"
                              value={estateId}
                            />
                            <input
                              type="hidden"
                              name="taskId"
                              value={task._id}
                            />
                            <input
                              type="hidden"
                              name="status"
                              value="IN_PROGRESS"
                            />
                            <button
                              type="submit"
                              disabled={isViewer}
                              className={
                                isViewer
                                  ? "cursor-not-allowed text-gray-400"
                                  : "text-blue-700 hover:underline"
                              }
                            >
                              Reopen
                            </button>
                          </form>
                        )}
                        <form action={deleteTask}>
                          <input
                            type="hidden"
                            name="estateId"
                            value={estateId}
                          />
                          <input
                            type="hidden"
                            name="taskId"
                            value={task._id}
                          />
                          <button
                            type="submit"
                            disabled={isViewer}
                            className={
                              isViewer
                                ? "cursor-not-allowed text-gray-400"
                                : "text-red-600 hover:underline"
                            }
                          >
                            Delete
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}