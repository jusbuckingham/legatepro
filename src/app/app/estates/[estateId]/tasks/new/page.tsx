import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Task, type TaskPriority, type TaskStatus } from "@/models/Task";
import { requireEstateAccess } from "@/lib/estateAccess";

type PageProps = {
  params: Promise<{
    estateId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const SUGGESTED_STARTERS: { label: string; subject: string }[] = [
  { label: "File", subject: "File inventory with the court" },
  { label: "Call", subject: "Call the probate clerk" },
  { label: "Pay", subject: "Pay property taxes" },
  { label: "Upload", subject: "Upload death certificate" },
  { label: "Request", subject: "Request letters of authority" },
  { label: "Send", subject: "Send notice to heirs" },
];

function firstParam(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}

export default async function NewTaskPage({ params, searchParams }: PageProps) {
  // ✅ In Next 16, params is a Promise
  const { estateId } = await params;

  const sp = searchParams ? await searchParams : undefined;
  const template = firstParam(sp?.template).trim();
  const error = firstParam(sp?.error).trim();
  const subjectPrefill = decodeURIComponent(template || "");

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  await connectToDatabase();

  // Permission gate (helper signature may vary across the codebase, so keep this call minimal)
  const access = await requireEstateAccess({ estateId, userId: session.user.id });

  // Defensive read of role from the access result
  const role = (access as { role?: string }).role;
  const canEdit = role !== "VIEWER";

  if (!canEdit) {
    redirect(`/app/estates/${estateId}/tasks?requestAccess=1`);
  }

  // We may not always have the estate record on the access helper result.
  // If you want the actual display name, fetch the Estate model here.
  const estateName = "Estate";

  // Capture values for the server action so we don't ever touch `params` inside it
  const estateIdForAction = estateId;
  const ownerIdForAction = session.user.id;

  const createTask = async (formData: FormData) => {
    "use server";

    const subject = String(formData.get("subject") ?? "").trim();
    const description =
      String(formData.get("description") ?? "").trim() || undefined;
    const notes = String(formData.get("notes") ?? "").trim() || undefined;

    const dateRaw = String(formData.get("date") ?? "");
    // Ensure date inputs are treated as local midnight, not UTC-shifted
    const date = dateRaw ? new Date(`${dateRaw}T00:00:00`) : new Date();

    const priorityRaw = String(formData.get("priority") ?? "MEDIUM");
    const statusRaw = String(formData.get("status") ?? "OPEN");

    const priority: TaskPriority =
      priorityRaw === "LOW" || priorityRaw === "MEDIUM" || priorityRaw === "HIGH"
        ? (priorityRaw as TaskPriority)
        : "MEDIUM";

    const status: TaskStatus =
      statusRaw === "OPEN" || statusRaw === "DONE"
        ? (statusRaw as TaskStatus)
        : "OPEN";

    if (!subject) {
      redirect(`/app/estates/${estateIdForAction}/tasks/new?error=subject_required#task-form`);
    }

    await connectToDatabase();

    await Task.create({
      estateId: estateIdForAction,
      ownerId: ownerIdForAction,
      subject,
      description,
      date,
      notes,
      priority,
      status,
    });

    revalidatePath(`/app/estates/${estateIdForAction}/tasks`);
    revalidatePath(`/app`);
    redirect(`/app/estates/${estateIdForAction}/tasks`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <nav className="text-xs text-slate-500">
            <Link href="/app/estates" className="hover:text-slate-300">
              Estates
            </Link>
            <span className="mx-1 text-slate-600">/</span>
            <Link
              href={`/app/estates/${estateId}/tasks`}
              className="hover:text-slate-300"
            >
              Tasks
            </Link>
            <span className="mx-1 text-slate-600">/</span>
            <span className="text-rose-300">New</span>
          </nav>

          {error ? (
            <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-medium">Couldn’t save task</p>
                  <p className="text-xs text-rose-200">
                    {error === "subject_required"
                      ? "Please add a subject to create the task."
                      : "We couldn’t complete that action. Please try again."}
                  </p>
                </div>
                <Link
                  href={`/app/estates/${estateId}/tasks/new#task-form`}
                  className="mt-2 inline-flex items-center justify-center rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-100 hover:bg-rose-500/25 md:mt-0"
                >
                  Fix & retry
                </Link>
              </div>
            </div>
          ) : null}

          <p className="mt-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            New task
          </p>
          <h1 className="text-xl font-semibold text-slate-50">
            Add task for {estateName}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Track follow-ups, filings, and reminders for this estate.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:items-end">
          <Link
            href={`/app/estates/${estateId}/tasks`}
            className="inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/70"
          >
            Back to tasks
          </Link>
          <p className="text-xs text-slate-500">
            Tip: keep the subject action-based (&quot;File&quot;, &quot;Call&quot;, &quot;Submit&quot;).
          </p>
        </div>
      </div>

      <form
        id="task-form"
        action={createTask}
        className="max-w-2xl space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Subject<span className="text-rose-400"> *</span>
            </label>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Quick add
              </span>
              {SUGGESTED_STARTERS.map((s) => {
                const href = `/app/estates/${estateId}/tasks/new?template=${encodeURIComponent(s.subject)}#task-form`;
                const isActive = subjectPrefill && subjectPrefill === s.subject;
                return (
                  <Link
                    key={s.label}
                    href={href}
                    className={
                      isActive
                        ? "inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-100"
                        : "inline-flex items-center rounded-full border border-slate-700 bg-slate-950/40 px-2 py-0.5 text-[11px] font-medium text-slate-200 hover:bg-slate-900/60"
                    }
                    title={s.subject}
                  >
                    {s.label}
                  </Link>
                );
              })}
            </div>
            <input
              name="subject"
              required
              autoFocus
              maxLength={120}
              defaultValue={subjectPrefill || undefined}
              className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-indigo-400"
              placeholder="e.g. File inventory with the court"
              aria-describedby="subject-help"
            />
            <p id="subject-help" className="mt-1 text-xs text-slate-500">
              Keep it short and specific. (Max 120 characters)
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Due date
            </label>
            <input
              type="date"
              name="date"
              className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none ring-0 focus:border-indigo-400"
              aria-describedby="due-date-help"
            />
            <p id="due-date-help" className="mt-1 text-xs text-slate-500">
              Leave blank to default to today.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Priority
            </label>
            <select
              name="priority"
              defaultValue="MEDIUM"
              className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none ring-0 focus:border-indigo-400"
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Status
            </label>
            <select
              name="status"
              defaultValue="OPEN"
              className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none ring-0 focus:border-indigo-400"
            >
              <option value="OPEN">Open</option>
              <option value="DONE">Done</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
            Description
          </label>
          <textarea
            name="description"
            rows={3}
            maxLength={800}
            className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-indigo-400"
            placeholder="Optional details about this task…"
          />
          <p className="mt-1 text-xs text-slate-500">
            Helpful context, links, or who owns the next step. (Max 800 characters)
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
            Internal notes
          </label>
          <textarea
            name="notes"
            rows={2}
            maxLength={800}
            className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-indigo-400"
            placeholder="Private notes that won't appear on exported summaries…"
          />
          <p className="mt-1 text-xs text-slate-500">
            For internal details only (phone numbers, access notes, etc.). (Max 800 characters)
          </p>
        </div>

        <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={!canEdit}
              className={`inline-flex items-center rounded-lg px-4 py-2 text-xs font-semibold uppercase tracking-wide shadow-sm ${
                canEdit
                  ? "bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
                  : "cursor-not-allowed bg-slate-800 text-slate-400"
              }`}
            >
              Save task
            </button>

            <Link
              href={`/app/estates/${estateId}/tasks`}
              className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/70"
            >
              Cancel
            </Link>
          </div>

          <p className="text-xs text-slate-500">
            Tasks show up in this estate&apos;s timeline and dashboard.
            <span className="ml-2 text-slate-600">Saves when you submit.</span>
            {!canEdit ? (
              <span className="ml-2 text-rose-300">
                You have view-only access.
              </span>
            ) : null}
          </p>
        </div>
      </form>
    </div>
  );
}