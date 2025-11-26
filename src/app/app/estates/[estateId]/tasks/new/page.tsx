import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";
import { Task, type TaskPriority, type TaskStatus } from "@/models/Task";

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

  const estateDoc = await Estate.findOne({
    _id: estateId,
    ownerId: session.user.id,
  }).lean();

  if (!estateDoc) {
    notFound();
  }

  type EstateNameSource = {
    caseName?: string | null;
    displayName?: string | null;
    decedentName?: string | null;
  };

  const estateForName = estateDoc as EstateNameSource;

  const estateName =
    estateForName.caseName ||
    estateForName.displayName ||
    estateForName.decedentName ||
    "Estate";

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
    const date = dateRaw ? new Date(dateRaw) : new Date();

    const priority =
      (formData.get("priority") as TaskPriority | null) ?? "MEDIUM";
    const status =
      (formData.get("status") as TaskStatus | null) ?? "OPEN";

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
    redirect(`/app/estates/${estateIdForAction}/tasks`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
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

        <div className="flex items-center justify-between gap-3 pt-2">
          <button
            type="submit"
            className="inline-flex items-center rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-950 shadow-sm hover:bg-emerald-400"
          >
            Save task
          </button>
          <p className="text-xs text-slate-500">
            Tasks are auto-linked to this estate&apos;s timecard &amp; dashboard.
          </p>
        </div>
      </form>
    </div>
  );
}