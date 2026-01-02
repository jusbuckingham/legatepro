"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

import PageHeader from "@/components/layout/PageHeader";
import { getApiErrorMessage, safeJson } from "@/lib/utils";

interface TimeEntryForm {
  date: string;
  hours: string; // keep as string for easier input handling
  rate: string; // optional hourly value
  activity: string;
  notes: string;
  isBillable: boolean;
}

function getErrorFromApiPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;

  const record = payload as Record<string, unknown>;

  // Preferred contract: { ok: false, error: "..." }
  if (record.ok === false) {
    const err = record.error;
    if (typeof err === "string" && err.trim()) return err;
    return "Request failed.";
  }

  // Legacy fallbacks
  const err = record.error;
  if (typeof err === "string" && err.trim()) return err;

  const msg = record.message;
  if (typeof msg === "string" && msg.trim()) return msg;

  return null;
}

export default function NewTimeEntryPage() {
  const router = useRouter();
  const { estateId } = useParams<{ estateId: string }>();

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [form, setForm] = useState<TimeEntryForm>({
    date: todayIso,
    hours: "",
    rate: "",
    activity: "",
    notes: "",
    isBillable: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hoursNumber = useMemo(() => {
    const raw = form.hours.trim();
    if (!raw) return 0;
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [form.hours]);

  const canSubmit = !submitting && form.date.trim().length > 0 && hoursNumber > 0;

  const handleChange = <K extends keyof TimeEntryForm>(field: K, value: TimeEntryForm[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (error) setError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!estateId) {
      setError("Missing estate id.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const hoursValue = hoursNumber;

    try {
      const rateNumberRaw = form.rate ? Number.parseFloat(form.rate) : undefined;
      const rateNumber =
        typeof rateNumberRaw === "number" &&
        Number.isFinite(rateNumberRaw) &&
        rateNumberRaw >= 0
          ? rateNumberRaw
          : undefined;

      if (!form.date || hoursValue <= 0) {
        setError("Please provide a date and a positive number of hours.");
        return;
      }

      const res = await fetch(
        `/api/estates/${encodeURIComponent(estateId)}/time`,
        {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            estateId,
            date: form.date,
            hours: hoursValue,
            rate: rateNumber,
            activity: form.activity.trim() || undefined,
            notes: form.notes.trim() || undefined,
            isBillable: form.isBillable,
          }),
        }
      );

      // Clone before reading the body so `getApiErrorMessage` can still inspect it.
      const resForError = res.clone();

      const details: unknown = await safeJson(res);
      const payloadError = getErrorFromApiPayload(details);

      if (!res.ok || payloadError) {
        const apiMsg = await Promise.resolve(getApiErrorMessage(resForError));
        throw new Error(
          payloadError || apiMsg || "Failed to save time entry. Please try again."
        );
      }

      // On success, go back to the main timecard list
      router.push(`/app/estates/${encodeURIComponent(estateId)}/time?created=1`);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 p-6">
      <PageHeader
        eyebrow={
          <nav className="text-xs text-slate-500">
            <Link href="/app/estates" className="text-slate-400 hover:text-slate-200 hover:underline">
              Estates
            </Link>
            <span className="mx-1 text-slate-600">/</span>
            <Link
              href={`/app/estates/${encodeURIComponent(estateId ?? "")}`}
              className="text-slate-400 hover:text-slate-200 hover:underline"
            >
              Overview
            </Link>
            <span className="mx-1 text-slate-600">/</span>
            <Link
              href={`/app/estates/${encodeURIComponent(estateId ?? "")}/time`}
              className="text-slate-400 hover:text-slate-200 hover:underline"
            >
              Time
            </Link>
            <span className="mx-1 text-slate-600">/</span>
            <span className="truncate text-rose-200">New</span>
          </nav>
        }
        title="New time entry"
        description="Record personal representative time so you don’t have to reconstruct it later."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link
              href={`/app/estates/${encodeURIComponent(estateId ?? "")}/time`}
              className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/60"
            >
              Back
            </Link>
          </div>
        }
      />

      <form
        onSubmit={handleSubmit}
        aria-busy={submitting}
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
              disabled={submitting}
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
              disabled={submitting}
            />
            <p className="mt-1 text-xs text-slate-500">Use decimals (e.g. 1.5 = 1h 30m).</p>
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
                disabled={submitting}
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Some courts allow compensation for your time. This helps you estimate that value.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 md:items-start">
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
              disabled={submitting}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Internal notes
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => handleChange("notes", e.target.value)}
              className="min-h-[44px] w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-rose-500/70"
              rows={2}
              placeholder="Anything you’d want a judge or your attorney to understand."
              disabled={submitting}
            />
          </div>
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={form.isBillable}
            onChange={(e) => handleChange("isBillable", e.target.checked)}
            className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-rose-500 focus:ring-rose-500"
            disabled={submitting}
          />
          Billable to estate
        </label>

        <div role="status" aria-live="polite">
          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-950/40 p-3 text-sm text-rose-100" role="alert">
              {error}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/app/estates/${encodeURIComponent(estateId ?? "")}/time`}
            className="text-sm text-slate-400 hover:text-slate-200"
          >
            Cancel and go back
          </Link>

          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="inline-flex items-center rounded-md bg-rose-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Saving entry…" : "Save time entry"}
          </button>
        </div>
      </form>
    </div>
  );
}