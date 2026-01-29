import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { connectToDatabase, serializeMongoDoc } from "@/lib/db";
import { requireEstateAccess, requireEstateEditAccess } from "@/lib/estateAccess";
import { EstateTask } from "@/models/EstateTask";

import PageHeader from "@/components/layout/PageHeader";

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
  title?: unknown;
  description?: unknown;
  status?: unknown;
  dueDate?: unknown;
  completedAt?: unknown;
};

type TaskItem = {
  _id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  dueDate?: string | null;
  isOverdue: boolean;
};

function firstParam(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? "" : "";
}

function toBoolParam(value: string | string[] | undefined): boolean {
  const v = firstParam(value).trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

function buildTasksUrl(
  estateId: string,
  params: {
    q?: string;
    status?: string;
    overdue?: boolean;
    template?: string;
    anchor?: string;
  }
): string {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.status) sp.set("status", params.status);
  if (params.overdue) sp.set("overdue", "1");
  if (params.template) sp.set("template", params.template);

  const qs = sp.toString();
  const base = `/app/estates/${encodeURIComponent(estateId)}/tasks${qs ? `?${qs}` : ""}`;
  return params.anchor ? `${base}#${params.anchor}` : base;
}

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

  if (!estateId) return;
  if (!title) {
    redirect(`/app/estates/${encodeURIComponent(estateId)}/tasks?error=title_required#add-task`);
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/app/estates/${encodeURIComponent(estateId)}/tasks#add-task`);
  }

  // Permission check: viewers can't create tasks
  const access = await requireEstateEditAccess({ estateId, userId: session.user.id });
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

  revalidatePath(`/app/estates/${estateId}/tasks`);
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
    redirect(`/login?callbackUrl=/app/estates/${encodeURIComponent(estateId)}/tasks`);
  }

  const access = await requireEstateEditAccess({ estateId, userId: session.user.id });
  if (access.role === "VIEWER") {
    redirect(`/app/estates/${estateId}/tasks?forbidden=1`);
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

  await EstateTask.findOneAndUpdate({ _id: taskId, estateId }, update);

  revalidatePath(`/app/estates/${estateId}/tasks`);
  redirect(`/app/estates/${estateId}/tasks`);
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
    redirect(`/login?callbackUrl=/app/estates/${encodeURIComponent(estateId)}/tasks`);
  }

  const access = await requireEstateEditAccess({ estateId, userId: session.user.id });
  if (access.role === "VIEWER") {
    redirect(`/app/estates/${estateId}/tasks?forbidden=1`);
  }

  await connectToDatabase();

  await EstateTask.findOneAndDelete({
    _id: taskId,
    estateId,
  });

  revalidatePath(`/app/estates/${estateId}/tasks`);
  redirect(`/app/estates/${estateId}/tasks`);
}

export default async function EstateTasksPage({ params, searchParams }: PageProps) {
  const { estateId } = await params;

  let searchQuery = "";
  let statusFilter: TaskStatus | "ALL" = "ALL";
  let overdueOnly = false;

  const sp = searchParams ? await searchParams : undefined;

  if (sp) {
    searchQuery = firstParam(sp.q).trim();

    const statusRaw = firstParam(sp.status).trim();
    if (statusRaw) {
      const upper = statusRaw.toUpperCase();
      if (upper === "NOT_STARTED" || upper === "IN_PROGRESS" || upper === "DONE") {
        statusFilter = upper as TaskStatus;
      } else {
        statusFilter = "ALL";
      }
    }

    overdueOnly = toBoolParam(sp.overdue);
  }

  const templateTitle = firstParam(sp?.template).trim();
  const errorCode = firstParam(sp?.error).trim();

  const SUGGESTED_STARTERS = [
    "Order certified death certificates",
    "Open an estate bank account (get EIN first)",
    "Notify banks/creditors and request date-of-death balances",
    "Collect property tax + insurance statements",
    "Draft and file initial inventory / accounting checklist",
  ] as const;

  const forbidden = firstParam(sp?.forbidden) === "1";

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/app/estates/${estateId}/tasks`);
  }

  await connectToDatabase();

  let access: Awaited<ReturnType<typeof requireEstateAccess>>;
  try {
    access = await requireEstateAccess({ estateId, userId: session.user.id });
  } catch (e) {
    console.error("[EstateTasksPage] requireEstateAccess failed", {
      estateId,
      userId: session.user.id,
      error: e instanceof Error ? e.message : String(e),
    });
    redirect("/app/estates?error=estate_access");
  }

  const isViewer = access.role === "VIEWER";
  const canEdit = !isViewer;

  const docs = (await EstateTask.find(
    { estateId },
    { title: 1, description: 1, status: 1, dueDate: 1, completedAt: 1 }
  )
    .sort({ dueDate: 1, createdAt: 1 })
    .lean()
    .exec()) as EstateTaskLean[];

  const tasks: TaskItem[] = docs.map((doc) => {
    const plain = serializeMongoDoc(doc) as Record<string, unknown>;

    const idRaw = (plain as { id?: unknown }).id;
    const id = typeof idRaw === "string" && idRaw.length > 0 ? idRaw : String(doc._id);

    const titleRaw = (plain as { title?: unknown }).title;
    const title =
      typeof titleRaw === "string" && titleRaw.trim().length > 0 ? titleRaw : "Task";

    const status = parseStatus((plain as { status?: unknown }).status ?? null);

    const dueRaw = (plain as { dueDate?: unknown }).dueDate;
    const due =
      dueRaw instanceof Date
        ? dueRaw.toISOString()
        : typeof dueRaw === "string" && dueRaw
        ? dueRaw
        : null;

    let isOverdue = false;
    if (due) {
      const dueDate = new Date(due);
      const now = new Date();
      if (!Number.isNaN(dueDate.getTime())) {
        isOverdue = dueDate < now && status !== "DONE";
      }
    }

    const descriptionRaw = (plain as { description?: unknown }).description;
    const description = typeof descriptionRaw === "string" ? descriptionRaw : null;

    return {
      _id: id,
      title,
      description,
      status,
      dueDate: due,
      isOverdue,
    };
  });

  const filteredTasks = tasks.filter((task) => {
    if (overdueOnly && !task.isOverdue) return false;
    if (statusFilter !== "ALL" && task.status !== statusFilter) return false;
    if (!searchQuery) return true;

    const q = searchQuery.toLowerCase();
    const title = task.title.toLowerCase();
    const desc = (task.description ?? "").toLowerCase();

    return title.includes(q) || desc.includes(q);
  });

  const openCount = tasks.filter((t) => t.status !== "DONE").length;
  const doneCount = tasks.filter((t) => t.status === "DONE").length;
  const overdueCount = tasks.filter((t) => t.isOverdue).length;

  const hasFilters = !!searchQuery || statusFilter !== "ALL" || overdueOnly;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow={
          <nav className="text-xs text-slate-500">
            <Link
              href="/app/estates"
              className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
            >
              Estates
            </Link>
            <span className="mx-1 text-slate-600">/</span>
            <Link
              href={`/app/estates/${estateId}`}
              className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
            >
              Estate
            </Link>
            <span className="mx-1 text-slate-600">/</span>
            <span className="text-rose-300">Tasks</span>
          </nav>
        }
        title="Tasks"
        description="Keep everything you need to do in one place—court dates, bank calls, paperwork, and follow-ups. Mark items done as you go."
        actions={
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
              <span className="inline-flex items-center rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5">
                Open: <span className="ml-1 text-slate-200">{openCount}</span>
              </span>
              <span className="inline-flex items-center rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5">
                Done: <span className="ml-1 text-slate-200">{doneCount}</span>
              </span>
              <span
                className={
                  overdueCount > 0
                    ? "inline-flex items-center rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5"
                    : "inline-flex items-center rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5"
                }
              >
                Overdue:{" "}
                <span className={overdueCount > 0 ? "ml-1 text-rose-200" : "ml-1 text-slate-200"}>
                  {overdueCount}
                </span>
              </span>
              <span className="inline-flex items-center rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5">
                Access: <span className="ml-1 text-slate-200">{access.role}</span>
              </span>
            </div>

            <span className="text-[11px] text-slate-500">
              This checklist is private to your team and not shared with the court.
            </span>

            {canEdit ? (
              <Link
                href="#add-task"
                className="inline-flex items-center justify-center rounded-md border border-rose-500/60 bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-rose-100 hover:bg-rose-500/20"
              >
                New task
              </Link>
            ) : (
              <Link
                href={`/app/estates/${estateId}?requestAccess=1`}
                className="inline-flex items-center justify-center rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-100 hover:bg-amber-500/15"
              >
                Request edit access
              </Link>
            )}
          </div>
        }
      />

      {errorCode === "title_required" ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium">Task title required</p>
              <p className="text-xs text-rose-200">Add a clear title before saving the task.</p>
            </div>
            <Link
              href={buildTasksUrl(estateId, {
                q: searchQuery || undefined,
                status: statusFilter !== "ALL" ? statusFilter : undefined,
                overdue: overdueOnly,
                anchor: "add-task",
              })}
              className="mt-2 inline-flex items-center justify-center rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-100 hover:bg-rose-500/25 md:mt-0"
            >
              Back to form
            </Link>
          </div>
        </div>
      ) : null}

      {forbidden && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium">Action blocked</p>
              <p className="text-xs text-rose-200">
                You don’t have edit permissions for this estate. Request access from the owner to create, update, or
                delete tasks.
              </p>
            </div>
            <Link
              href={`/app/estates/${estateId}?requestAccess=1`}
              className="mt-2 inline-flex items-center justify-center rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-100 hover:bg-rose-500/25 md:mt-0"
            >
              Request edit access
            </Link>
          </div>
        </div>
      )}

      {!canEdit && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium">Viewer access</p>
              <p className="text-xs text-amber-200">You can view tasks, but you can’t create, update, or delete them.</p>
            </div>
            <Link
              href={`/app/estates/${estateId}?requestAccess=1`}
              className="mt-2 inline-flex items-center justify-center rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-500/25 md:mt-0"
            >
              Request edit access
            </Link>
          </div>
        </div>
      )}

      {/* New task form */}
      <section
        id="add-task"
        className="space-y-3 scroll-mt-24 rounded-xl border border-rose-900/40 bg-slate-950/70 p-4 shadow-sm shadow-rose-950/40"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-rose-200">Add a new task</h2>
            <p className="mt-1 text-xs text-slate-400">
              Capture clear, concrete steps—&quot;Call bank about estate account&quot;, &quot;Gather property tax
              statements&quot;, or &quot;Prepare inventory for court&quot;.
            </p>
            <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Quick add</p>
                <p className="text-[11px] text-slate-500">Click a starter to prefill the title.</p>
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {SUGGESTED_STARTERS.map((t) => (
                  <Link
                    key={t}
                    href={buildTasksUrl(estateId, {
                      q: searchQuery || undefined,
                      status: statusFilter !== "ALL" ? statusFilter : undefined,
                      overdue: overdueOnly,
                      template: t,
                      anchor: "add-task",
                    })}
                    className={
                      templateTitle && templateTitle.toLowerCase() === t.toLowerCase()
                        ? "inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-200 hover:bg-emerald-500/15"
                        : "inline-flex items-center rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5 text-[11px] text-slate-200 hover:bg-slate-900/40"
                    }
                    title="Prefill task title"
                  >
                    {t}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>

        <form action={createTask} className="space-y-3 pt-1">
          <fieldset disabled={!canEdit} className="space-y-3">
            <input type="hidden" name="estateId" value={estateId} />

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-200">Task title</label>
              <input
                name="title"
                required
                disabled={!canEdit}
                defaultValue={templateTitle}
                placeholder="e.g. File initial inventory with the court"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 placeholder:text-slate-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-200">Details (optional)</label>
              <textarea
                name="description"
                rows={2}
                disabled={!canEdit}
                placeholder="Any notes, phone numbers, or details to remember…"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 placeholder:text-slate-500"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr,1fr]">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-200">Due date (optional)</label>
                <input
                  type="date"
                  name="dueDate"
                  disabled={!canEdit}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 placeholder:text-slate-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-200">Status</label>
                <select
                  name="status"
                  disabled={!canEdit}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50"
                  defaultValue="NOT_STARTED"
                >
                  <option value="NOT_STARTED">Not started</option>
                  <option value="IN_PROGRESS">In progress</option>
                  <option value="DONE">Done</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end border-t border-slate-800 pt-3">
              <button
                type="submit"
                disabled={!canEdit}
                className={
                  !canEdit
                    ? "cursor-not-allowed rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-400"
                    : "rounded-md bg-rose-500 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-rose-400"
                }
              >
                Add task
              </button>
            </div>
          </fieldset>
        </form>
      </section>

      {/* Filters */}
      <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-3">
        <form method="GET" className="flex flex-col gap-2 text-xs md:flex-row md:items-center md:justify-between">
          <div className="flex flex-1 items-center gap-2">
            <label htmlFor="q" className="whitespace-nowrap text-[11px] text-slate-400">
              Search
            </label>
            <input
              id="q"
              name="q"
              defaultValue={searchQuery}
              placeholder="Search by title or details…"
              className="h-7 w-full rounded-md border border-slate-700 bg-slate-950 px-2 text-xs text-slate-50 placeholder:text-slate-500"
            />
          </div>

          <div className="flex items-center gap-2 md:w-auto">
            <label htmlFor="status" className="whitespace-nowrap text-[11px] text-slate-400">
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={statusFilter}
              className="h-7 rounded-md border border-slate-700 bg-slate-950 px-2 text-xs text-slate-50"
            >
              <option value="ALL">All</option>
              <option value="NOT_STARTED">Not started</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="DONE">Done</option>
            </select>

            <label className="ml-2 inline-flex items-center gap-2 text-[11px] text-slate-400">
              <input type="checkbox" name="overdue" value="1" defaultChecked={overdueOnly} className="h-3 w-3" />
              Overdue only
            </label>

            {hasFilters && (
              <Link
                href={buildTasksUrl(estateId, {})}
                className="whitespace-nowrap text-[11px] font-semibold text-slate-300 hover:text-slate-100 hover:underline underline-offset-2"
              >
                Clear
              </Link>
            )}
          </div>
        </form>
      </section>

      {/* Task list */}
      <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-300">Tasks</h2>
            <p className="mt-1 text-xs text-slate-500">Track to-dos, due dates, and progress for this estate.</p>
          </div>

          {filteredTasks.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <span>
                Showing <span className="font-semibold text-slate-200">{filteredTasks.length}</span>
                {filteredTasks.length === 1 ? " task" : " tasks"}
              </span>
              {hasFilters ? <span className="text-slate-600">·</span> : null}
              {hasFilters ? (
                <Link
                  href={buildTasksUrl(estateId, {})}
                  className="font-semibold text-slate-300 hover:text-slate-100 hover:underline underline-offset-2"
                >
                  Clear filters
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>

        {tasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/60 p-6">
            <p className="text-sm font-medium text-slate-100">No tasks yet</p>
            <p className="mt-1 text-sm text-slate-400">
              Start with the next 3–5 things you know you need to do—then refine as you go.
            </p>
            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Suggested starters</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Click one to prefill the title, then add details and a due date.
                  </p>
                </div>
                <Link
                  href={buildTasksUrl(estateId, { anchor: "add-task" })}
                  className="mt-2 inline-flex items-center justify-center rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-900/40 sm:mt-0"
                >
                  Jump to form
                </Link>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {SUGGESTED_STARTERS.map((t) => (
                  <Link
                    key={t}
                    href={buildTasksUrl(estateId, {
                      q: searchQuery || undefined,
                      status: statusFilter !== "ALL" ? statusFilter : undefined,
                      overdue: overdueOnly,
                      template: t,
                      anchor: "add-task",
                    })}
                    className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 hover:border-rose-500/40 hover:bg-slate-900/40"
                    title="Prefill task title"
                  >
                    {t}
                  </Link>
                ))}
              </div>

              <p className="mt-3 text-[11px] text-slate-500">
                Tip: keep titles action-based (verb + object) so nothing gets stuck.
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={`/app/estates/${estateId}`}
                className="inline-flex items-center justify-center rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-900/40"
              >
                Back to overview
              </Link>
              {!canEdit ? (
                <Link
                  href={`/app/estates/${estateId}?requestAccess=1`}
                  className="inline-flex items-center justify-center rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/25"
                >
                  Request edit access
                </Link>
              ) : (
                <Link
                  href="#add-task"
                  className="inline-flex items-center justify-center rounded-md border border-rose-500/60 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-500/20"
                >
                  New task
                </Link>
              )}
            </div>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/60 p-6">
            <p className="text-sm font-medium text-slate-100">No matching tasks</p>
            <p className="mt-1 text-sm text-slate-400">Try changing your search or status filter.</p>
            <div className="mt-3">
              <Link
                href={buildTasksUrl(estateId, {})}
                className="text-sm font-semibold text-slate-200 hover:text-slate-100 hover:underline underline-offset-2"
              >
                Clear filters
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60 md:block">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-2">Task</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Due</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTasks.map((task) => (
                    <tr
                      key={task._id}
                      className="border-t border-slate-800 bg-slate-950/40 hover:bg-slate-900/60"
                    >
                      <td className="px-3 py-2 align-top">
                        <div className="space-y-0.5">
                          <Link
                            href={`/app/estates/${estateId}/tasks/${task._id}`}
                            className="font-medium text-slate-100 hover:text-emerald-300 underline-offset-2 hover:underline"
                          >
                            {task.title}
                          </Link>
                          {task.description ? (
                            <div className="text-xs text-slate-400">{task.description}</div>
                          ) : null}
                        </div>
                      </td>

                      <td className="px-3 py-2 align-top">
                        <span
                          className={
                            task.status === "DONE"
                              ? "inline-flex rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase text-emerald-200"
                              : task.isOverdue
                              ? "inline-flex rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase text-rose-200"
                              : task.status === "IN_PROGRESS"
                              ? "inline-flex rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase text-sky-200"
                              : "inline-flex rounded-full bg-slate-800 px-2 py-0.5 text-[11px] uppercase text-slate-300"
                          }
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
                                ? "font-medium text-rose-200"
                                : "text-slate-300"
                            }
                          >
                            {formatDate(task.dueDate)}
                          </span>
                        ) : (
                          <span className="text-slate-400">No due date</span>
                        )}
                      </td>

                      <td className="px-3 py-2 align-top">
                        <div className="flex justify-end gap-3 text-xs">
                          <Link
                            href={`/app/estates/${estateId}/tasks/${task._id}`}
                            className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
                          >
                            View
                          </Link>

                          {canEdit ? (
                            <>
                              <Link
                                href={`/app/estates/${estateId}/tasks/${task._id}/edit`}
                                className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
                              >
                                Edit
                              </Link>

                              {task.status !== "DONE" ? (
                                <form action={updateTaskStatus}>
                                  <input type="hidden" name="estateId" value={estateId} />
                                  <input type="hidden" name="taskId" value={task._id} />
                                  <input type="hidden" name="status" value="DONE" />
                                  <button
                                    type="submit"
                                    className="text-emerald-400 hover:text-emerald-300 underline-offset-2 hover:underline"
                                  >
                                    Mark done
                                  </button>
                                </form>
                              ) : (
                                <form action={updateTaskStatus}>
                                  <input type="hidden" name="estateId" value={estateId} />
                                  <input type="hidden" name="taskId" value={task._id} />
                                  <input type="hidden" name="status" value="IN_PROGRESS" />
                                  <button
                                    type="submit"
                                    className="text-sky-400 hover:text-sky-300 underline-offset-2 hover:underline"
                                  >
                                    Reopen
                                  </button>
                                </form>
                              )}

                              <form action={deleteTask}>
                                <input type="hidden" name="estateId" value={estateId} />
                                <input type="hidden" name="taskId" value={task._id} />
                                <button
                                  type="submit"
                                  className="text-rose-400 hover:text-rose-300 underline-offset-2 hover:underline"
                                >
                                  Delete
                                </button>
                              </form>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="space-y-2 md:hidden">
              {filteredTasks.map((task) => (
                <div
                  key={task._id}
                  className={`rounded-xl border border-slate-800 bg-slate-950/60 p-3 ${
                    task.isOverdue && task.status !== "DONE" ? "ring-1 ring-rose-500/20" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/app/estates/${estateId}/tasks/${task._id}`}
                        className="block truncate text-sm font-semibold text-slate-100 hover:text-emerald-300 underline-offset-2 hover:underline"
                      >
                        {task.title}
                      </Link>
                      {task.description ? (
                        <div className="mt-1 line-clamp-2 text-xs text-slate-400">{task.description}</div>
                      ) : null}
                    </div>

                    <span
                      className={
                        task.status === "DONE"
                          ? "inline-flex rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase text-emerald-200"
                          : task.isOverdue
                          ? "inline-flex rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase text-rose-200"
                          : task.status === "IN_PROGRESS"
                          ? "inline-flex rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase text-sky-200"
                          : "inline-flex rounded-full bg-slate-800 px-2 py-0.5 text-[11px] uppercase text-slate-300"
                      }
                    >
                      {task.status === "NOT_STARTED"
                        ? "Not started"
                        : task.status === "IN_PROGRESS"
                        ? "In progress"
                        : "Done"}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                    <div className="text-slate-400">
                      Due:{" "}
                      {task.dueDate ? (
                        <span
                          className={
                            task.isOverdue && task.status !== "DONE"
                              ? "font-semibold text-rose-200"
                              : "text-slate-300"
                          }
                        >
                          {formatDate(task.dueDate)}
                        </span>
                      ) : (
                        <span className="text-slate-400">No due date</span>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <Link
                        href={`/app/estates/${estateId}/tasks/${task._id}`}
                        className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
                      >
                        View
                      </Link>

                      {canEdit ? (
                        <>
                          <Link
                            href={`/app/estates/${estateId}/tasks/${task._id}/edit`}
                            className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
                          >
                            Edit
                          </Link>

                          {task.status !== "DONE" ? (
                            <form action={updateTaskStatus}>
                              <input type="hidden" name="estateId" value={estateId} />
                              <input type="hidden" name="taskId" value={task._id} />
                              <input type="hidden" name="status" value="DONE" />
                              <button
                                type="submit"
                                className="text-emerald-400 hover:text-emerald-300 underline-offset-2 hover:underline"
                              >
                                Done
                              </button>
                            </form>
                          ) : (
                            <form action={updateTaskStatus}>
                              <input type="hidden" name="estateId" value={estateId} />
                              <input type="hidden" name="taskId" value={task._id} />
                              <input type="hidden" name="status" value="IN_PROGRESS" />
                              <button
                                type="submit"
                                className="text-sky-400 hover:text-sky-300 underline-offset-2 hover:underline"
                              >
                                Reopen
                              </button>
                            </form>
                          )}

                          <form action={deleteTask}>
                            <input type="hidden" name="estateId" value={estateId} />
                            <input type="hidden" name="taskId" value={task._id} />
                            <button
                              type="submit"
                              className="text-rose-400 hover:text-rose-300 underline-offset-2 hover:underline"
                            >
                              Delete
                            </button>
                          </form>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}