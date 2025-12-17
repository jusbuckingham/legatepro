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
};

export default async function NewTaskPage({ params }: PageProps) {
  // ✅ In Next 16, params is a Promise
  const { estateId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  await connectToDatabase();

  // Permission gate (helper signature may vary across the codebase, so keep this call minimal)
  const access = await requireEstateAccess({ estateId });

  // Defensive read of role from the access result
  const role = (access as { role?: string }).role;
  const canEdit = role !== "VIEWER";

  // We may not always have the estate record on the access helper result.
  // If you want the actual display name, fetch the Estate model here.
  const estateName = "Estate";

  // Capture values for the server action so we don't ever touch `params` inside it
  const estateIdForAction = estateId;
  const ownerIdForAction = session.user.id;

  const createTask = async (formData: FormData) => {
    "use server";

    if (!canEdit) {
      redirect(`/app/estates/${estateIdForAction}/tasks?requestAccess=1`);
    }

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
      // Minimal guard; you could enhance this later with form state
      throw new Error("Subject is required");
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
      <div className="flex items-center justify-between gap-4">
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
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            New task
          </p>
          <h1 className="text-xl font-semibold text-slate-50">
            Add task for {estateName}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Track follow-ups, filings, and reminders for this estate.
          </p>
        </div>
      </div>

      <form
        action={createTask}
        className="max-w-2xl space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Subject<span className="text-rose-400"> *</span>
            </label>
            <input
              name="subject"
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-indigo-400"
              placeholder="e.g. File inventory with the court"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Due date
            </label>
            <input
              type="date"
              name="date"
              className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none ring-0 focus:border-indigo-400"
            />
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
            className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-indigo-400"
            placeholder="Optional details about this task…"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
            Internal notes
          </label>
          <textarea
            name="notes"
            rows={2}
            className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-indigo-400"
            placeholder="Private notes that won't appear on exported summaries…"
          />
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
            Tasks are auto-linked to this estate&apos;s timecard &amp; dashboard.
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