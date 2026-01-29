import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export const metadata = {
  title: "Log time · LegatePro",
};

export default async function Page({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent("/app/time/new")}`);
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Time
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Log time entry
        </h1>
        <p className="text-sm text-muted-foreground">
          Manually record time spent on estate-related work.
        </p>
      </div>

      {/* How this works */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-semibold text-foreground">How this works</p>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] text-muted-foreground">
          <li>Select the date and number of hours worked.</li>
          <li>Optionally associate the entry with an estate or task.</li>
          <li>Mark entries as billable so they can be invoiced later.</li>
        </ul>
      </div>

      {searchParams?.error ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-600 shadow-sm">
          <p className="text-sm font-semibold">Couldn’t save time entry</p>
          <p className="mt-1 text-[11px] text-rose-600/80">{searchParams.error}</p>
        </div>
      ) : null}

      {/* Form card */}
      <form
        action="/api/time"
        method="post"
        className="rounded-2xl border border-border bg-card p-6 shadow-sm"
        aria-live="polite"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Date */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Date
            </label>
            <input
              name="date"
              type="date"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </div>

          {/* Hours */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Hours
            </label>
            <input
              name="hours"
              type="number"
              step="0.25"
              min="0"
              placeholder="e.g. 1.5"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            />
          </div>

          {/* Estate */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Estate
            </label>
            <select
              name="estateId"
              required
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/25 focus-visible:ring-offset-2 focus-visible:ring-rose-500/25 focus-visible:ring-offset-background"
              defaultValue=""
            >
              <option value="">Select an estate</option>
              {/* TODO: populate estates */}
            </select>
          </div>

          {/* Task */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Task (optional)
            </label>
            <select
              name="taskId"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              defaultValue=""
            >
              <option value="">None</option>
              {/* TODO: populate tasks filtered by estate */}
            </select>
          </div>
        </div>

        {/* Notes */}
        <div className="mt-4 space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Notes (optional)
          </label>
          <textarea
            name="description"
            rows={3}
            placeholder="What did you work on?"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          />
        </div>

        {/* Billable */}
        <div className="mt-4 flex items-center gap-2">
          <input
            id="billable"
            name="_billable"
            type="checkbox"
            defaultChecked
            className="h-4 w-4 rounded border-border text-rose-600 focus-visible:ring-2 focus-visible:ring-rose-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          />
          <label
            htmlFor="billable"
            className="text-xs text-muted-foreground"
          >
            Billable (can be included on an invoice)
          </label>
        </div>

        {/* Footer actions */}
        <div className="mt-6 flex items-center justify-between">
          <Link
            href="/app/time"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </Link>

          <button
            type="submit"
            className="inline-flex items-center rounded-md bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Save and return
          </button>
        </div>
      </form>

      {/* Footer hint */}
      <p className="text-[11px] text-muted-foreground">
        Tip: you can always edit or reassign time entries later.
      </p>
    </div>
  );
}