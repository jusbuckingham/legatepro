

"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";

interface TimeEntryForm {
  date: string;
  hours: string; // keep as string for easier input handling
  rate: string;
  activity: string;
  notes: string;
}

export default function NewTimeEntryPage() {
  const router = useRouter();
  const { estateId } = useParams<{ estateId: string }>();

  const [form, setForm] = useState<TimeEntryForm>({
    date: "",
    hours: "",
    rate: "",
    activity: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (
    field: keyof TimeEntryForm,
    value: string
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!estateId) return;

    setSubmitting(true);
    setError(null);

    try {
      const hoursNumberRaw = form.hours ? Number.parseFloat(form.hours) : 0;
      const hoursNumber = Number.isFinite(hoursNumberRaw) ? hoursNumberRaw : 0;

      const rateNumberRaw = form.rate ? Number.parseFloat(form.rate) : undefined;
      const rateNumber =
        typeof rateNumberRaw === "number" && Number.isFinite(rateNumberRaw) && rateNumberRaw >= 0
          ? rateNumberRaw
          : undefined;

      if (!form.date || Number.isNaN(hoursNumber) || hoursNumber <= 0) {
        setError("Please provide a date and a positive number of hours.");
        setSubmitting(false);
        return;
      }

      const res = await fetch("/api/time", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          estateId,
          date: form.date,
          hours: hoursNumber,
          rate: rateNumber,
          activity: form.activity.trim() || undefined,
          notes: form.notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const details = await res.json().catch(() => null);
        const message =
          details?.error || "Failed to save time entry. Please try again.";
        throw new Error(message);
      }

      // On success, go back to the main timecard list
      router.push(`/app/estates/${estateId}/time`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-950/70 px-3 py-1 text-xs text-slate-300">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-400" />
          New time entry
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
            Log personal representative time
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Courts often ask for a detailed timecard before closing probate.
            Use this screen to record your hours so you don&apos;t have to
            reconstruct everything at the end.
          </p>
        </div>
      </header>

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-xl border border-slate-800 bg-slate-950/70 p-4 sm:p-6"
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1 md:col-span-1">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Date <span className="text-rose-400">*</span>
            </label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => handleChange("date", e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-rose-500/70"
              required
            />
          </div>

          <div className="space-y-1 md:col-span-1">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Hours <span className="text-rose-400">*</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.25"
              value={form.hours}
              onChange={(e) => handleChange("hours", e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-rose-500/70"
              placeholder="e.g. 1.5"
              required
            />
          </div>

          <div className="space-y-1 md:col-span-1">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Hourly value (optional)
            </label>
            <div className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100">
              <span className="text-slate-500">$</span>
              <input
                type="number"
                min="0"
                step="1"
                value={form.rate}
                onChange={(e) => handleChange("rate", e.target.value)}
                className="w-full bg-transparent text-sm outline-none"
                placeholder="e.g. 50"
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Some courts allow you to request compensation for your time.
              This field helps you estimate that value.
            </p>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
            What were you working on?
          </label>
          <input
            type="text"
            value={form.activity}
            onChange={(e) => handleChange("activity", e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-rose-500/70"
            placeholder="e.g. Called utility company about final bill"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Internal notes
          </label>
          <textarea
            value={form.notes}
            onChange={(e) => handleChange("notes", e.target.value)}
            className="min-h-[100px] w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-rose-500/70"
            placeholder="Anything you&apos;d want a judge or your attorney to understand about this block of time."
          />
        </div>

        {error && (
          <p className="text-sm text-rose-400" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => router.push(`/app/estates/${estateId}/time`)}
            className="text-sm text-slate-400 hover:text-slate-200"
          >
            Cancel and go back
          </button>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center rounded-md bg-rose-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Saving entry…" : "Save time entry"}
          </button>
        </div>
      </form>
    </div>
  );
}