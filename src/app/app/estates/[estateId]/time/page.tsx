// REPLACED BY PATCH: new implementation below
"use client";

import { useCallback, useEffect, useState, FormEvent, use as usePromise } from "react";
import Link from "next/link";

import { safeJson } from "@/lib/utils";

interface TimeEntry {
  _id?: string;
  id?: string;
  estateId: string;
  date: string;
  hours: number;
  description: string;
  notes?: string;
  isBillable?: boolean;
}

interface PageProps {
  params: Promise<{
    estateId: string;
  }>;
}

type ApiErrorPayload = { ok: false; error: string };

type ApiSuccessPayload<T extends object> = { ok: true } & T;

type ApiPayload<T extends object> = ApiErrorPayload | ApiSuccessPayload<T>;

function getErrorFromApiPayload(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;

  const maybe = payload as { error?: unknown; ok?: unknown };

  if (maybe.ok === false && typeof maybe.error === "string" && maybe.error.trim()) {
    return maybe.error;
  }

  // Some endpoints may still return `{ error: "..." }` without the ok flag.
  if (typeof maybe.error === "string" && maybe.error.trim()) {
    return maybe.error;
  }

  return fallback;
}

function formatDisplayDate(isoLike: string): string {
  if (!isoLike) return "";
  const d = new Date(isoLike);
  if (Number.isNaN(d.getTime())) return isoLike;
  return d.toLocaleDateString();
}

function isValidObjectId(id: unknown): id is string {
  return typeof id === "string" && /^[0-9a-fA-F]{24}$/.test(id);
}

export default function EstateTimecardPage({ params }: PageProps) {
  const { estateId } = usePromise(params);

  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState<string>("1.0");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [isBillable, setIsBillable] = useState(true);
  const [hourlyRate, setHourlyRate] = useState<string>("0.00");

  const loadEntries = useCallback(async () => {
    try {
      setLoadingEntries(true);
      setError(null);

      const res = await fetch(`/api/estates/${encodeURIComponent(estateId)}/time`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      const data: unknown = await safeJson(res);

      // Avoid double-reading the response body by deriving the message from the parsed payload.
      if (!res.ok) {
        const msg = getErrorFromApiPayload(data, "Failed to load time entries");
        console.error("Failed to load time entries:", res.status, res.statusText, data);
        throw new Error(msg);
      }

      const payload = (data ?? {}) as ApiPayload<{
        entries?: Array<{
          id?: string;
          _id?: string;
          estateId?: string;
          date?: string;
          minutes?: number;
          hours?: number;
          description?: string;
          notes?: string;
          note?: string;
          isBillable?: boolean;
        }>;
      }>;

      if (payload && typeof payload === "object" && (payload as ApiErrorPayload).ok === false) {
        throw new Error(getErrorFromApiPayload(payload, "Failed to load time entries"));
      }

      const loadedEntriesRaw = Array.isArray((payload as { entries?: unknown }).entries)
        ? ((payload as { entries: unknown[] }).entries as Array<{
            id?: string;
            _id?: string;
            estateId?: string;
            date?: string;
            minutes?: number;
            hours?: number;
            description?: string;
            notes?: string;
            note?: string;
            isBillable?: boolean;
          }>)
        : [];

      const loadedEntries: TimeEntry[] = loadedEntriesRaw.map((raw) => {
        const id =
          typeof raw.id === "string"
            ? raw.id
            : typeof raw._id === "string"
            ? raw._id
            : undefined;

        const minutesValue =
          typeof raw.minutes === "number" ? raw.minutes : Number(raw.minutes ?? 0) || 0;

        const hoursValueRaw =
          typeof raw.hours === "number" ? raw.hours : Number(raw.hours ?? 0);

        const hoursValue =
          Number.isFinite(hoursValueRaw) && !Number.isNaN(hoursValueRaw)
            ? hoursValueRaw
            : minutesValue / 60;

        const notesValue =
          typeof raw.notes === "string" && raw.notes.trim().length > 0
            ? raw.notes
            : typeof raw.note === "string" && raw.note.trim().length > 0
            ? raw.note
            : "";

        return {
          _id: id,
          id,
          estateId: raw.estateId ?? estateId,
          date: raw.date ?? new Date().toISOString(),
          hours: hoursValue,
          description: raw.description ?? "",
          notes: notesValue,
          isBillable: raw.isBillable !== false,
        };
      });

      loadedEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setEntries(loadedEntries);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to load time entries.");
    } finally {
      setLoadingEntries(false);
    }
  }, [estateId]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const parsedHours = Number(hours);
    if (Number.isNaN(parsedHours) || parsedHours <= 0) {
      setError("Please enter a valid number of hours.");
      return;
    }

    if (!description.trim()) {
      setError("Please add a short description of what you did.");
      return;
    }

    try {
      setSubmitting(true);

      const res = await fetch(`/api/estates/${encodeURIComponent(estateId)}/time`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estateId,
          date,
          hours: parsedHours,
          description: description.trim(),
          notes: notes.trim() || undefined,
          isBillable,
        }),
      });

      const data: unknown = await safeJson(res);

      if (!res.ok) {
        const msg = getErrorFromApiPayload(data, "Failed to create time entry.");
        throw new Error(msg);
      }

      // If the API returns `{ ok: false }` while still sending a 2xx, treat as error.
      if (data && typeof data === "object" && (data as { ok?: unknown }).ok === false) {
        throw new Error(getErrorFromApiPayload(data, "Failed to create time entry."));
      }

      setDescription("");
      setNotes("");
      setHours("1.0");
      await loadEntries();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to create time entry.");
    } finally {
      setSubmitting(false);
    }
  }

  const totalHours = entries.reduce((sum, entry) => sum + (entry.hours || 0), 0);
  const billableHours = entries.reduce(
    (sum, entry) => (entry.isBillable === false ? sum : sum + (entry.hours || 0)),
    0
  );
  const nonBillableHours = totalHours - billableHours;

  const rateNumber = Number(hourlyRate) || 0;
  const billableTotalAmount = billableHours * rateNumber;

  function handleExportCsv(mode: "all" | "billable" = "all") {
    if (!entries.length) return;

    const header = ["Date", "Hours", "Billable", "Description", "Notes", "Rate", "Amount"];

    const filtered =
      mode === "billable" ? entries.filter((entry) => entry.isBillable !== false) : entries;

    const rows = filtered.map((entry) => {
      const date = new Date(entry.date).toISOString().slice(0, 10);
      const hoursStr = entry.hours.toFixed(2);
      const billableStr = entry.isBillable === false ? "No" : "Yes";
      const desc = entry.description ?? "";
      const notesStr = entry.notes ?? "";
      const rateStr = rateNumber.toFixed(2);
      const amount = entry.isBillable === false ? 0 : entry.hours * rateNumber;
      const amountStr = amount.toFixed(2);

      const esc = (value: string) => `"${value.replace(/"/g, '""')}"`;

      return [date, hoursStr, billableStr, esc(desc), esc(notesStr), rateStr, amountStr].join(",");
    });

    const csvContent = [header.join(","), ...rows].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const suffix = mode === "billable" ? "billable" : "all";
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `estate-${estateId}-timecard-${suffix}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">Timecard</h1>
          <p className="text-sm text-slate-400">
            Track your personal representative time for this estate. These entries will help you
            prepare your final time log for the court.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            onClick={() => handleExportCsv("all")}
            disabled={entries.length === 0}
            className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 font-medium text-slate-100 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export all CSV
          </button>
          <button
            type="button"
            onClick={() => handleExportCsv("billable")}
            disabled={entries.length === 0}
            className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 font-medium text-slate-100 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export billable CSV
          </button>
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold text-rose-100">Something went wrong</div>
              <div className="mt-1 text-xs text-rose-100/80">{error}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void loadEntries()}
                className="inline-flex items-center justify-center rounded-md border border-rose-500/30 bg-slate-950/60 px-3 py-1.5 text-xs font-semibold text-rose-100 hover:bg-slate-900/50"
              >
                Retry
              </button>
              <Link
                href={`/app/estates/${estateId}`}
                className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-900/50"
              >
                Back to overview
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {/* Summary stats */}
      <section className="grid gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Total hours</p>
          <p className="mt-1 text-lg font-semibold text-slate-50">{totalHours.toFixed(2)}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Billable hours</p>
          <p className="mt-1 text-lg font-semibold text-slate-50">{billableHours.toFixed(2)}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Non-billable hours</p>
          <p className="mt-1 text-lg font-semibold text-slate-50">{nonBillableHours.toFixed(2)}</p>
        </div>
      </section>

      {/* Rate + estimated total */}
      <section className="flex flex-col gap-2 text-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="text-slate-400">Hourly rate</span>
          <input
            type="number"
            min="0"
            step="1"
            value={hourlyRate}
            onChange={(e) => setHourlyRate(e.target.value)}
            className="w-24 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-right text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
          <span className="text-[11px] text-slate-500">USD per hour (for exports)</span>
        </div>
        <div className="text-[11px] text-slate-400">
          Estimated billable total:{" "}
          <span className="font-semibold text-slate-100">${billableTotalAmount.toFixed(2)}</span>
        </div>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-100">Add time entry</h2>

        <form onSubmit={handleSubmit} className="grid gap-3 md:grid-cols-4 md:items-end">
          <div className="flex flex-col gap-1 text-sm">
            <label htmlFor="date" className="text-slate-300">
              Date
            </label>
            <input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>

          <div className="flex flex-col gap-1 text-sm">
            <label htmlFor="hours" className="text-slate-300">
              Hours
            </label>
            <input
              id="hours"
              type="number"
              step="0.25"
              min="0"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>

          <div className="flex flex-col gap-1 text-sm md:col-span-2">
            <label htmlFor="description" className="text-slate-300">
              Description
            </label>
            <input
              id="description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Reviewed bank statements, called attorney, etc."
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>

          <div className="flex flex-col gap-1 text-sm md:col-span-3">
            <label htmlFor="notes" className="text-slate-300">
              Notes (optional)
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>

          <div className="flex flex-col gap-2 text-sm">
            <label className="inline-flex items-center gap-2 text-slate-300">
              <input
                type="checkbox"
                checked={isBillable}
                onChange={(e) => setIsBillable(e.target.checked)}
                className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-red-500 focus:ring-red-500"
              />
              Billable to estate
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Saving..." : "Save entry"}
            </button>
          </div>
        </form>

        <div aria-live="polite" className="sr-only">
          {error ?? ""}
        </div>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">Recent entries</h2>
          <p className="text-xs text-slate-400">
            {entries.length} entr{entries.length === 1 ? "y" : "ies"}
          </p>
        </div>

        {loadingEntries && entries.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="grid grid-cols-12 items-center gap-3 rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2"
              >
                <div className="col-span-2 h-3 w-20 rounded bg-slate-900/60" />
                <div className="col-span-6 h-3 w-full rounded bg-slate-900/60" />
                <div className="col-span-2 h-3 w-16 justify-self-end rounded bg-slate-900/60" />
                <div className="col-span-2 h-3 w-24 justify-self-end rounded bg-slate-900/60" />
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/40 p-6">
            <div className="text-sm font-semibold text-slate-100">No time entries yet</div>
            <div className="mt-1 text-xs text-slate-400">
              Start with the first 3–5 things you’ve already done: bank calls, court filings,
              property visits, or document review.
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setDescription("Called bank re: estate account setup");
                  setNotes("Spoke with: ____ | Outcome: ____");
                }}
                className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-900"
              >
                Insert example
              </button>
              <button
                type="button"
                onClick={() => void loadEntries()}
                className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-900"
              >
                Refresh
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto text-sm">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-4 text-left">Date</th>
                  <th className="py-2 pr-4 text-left">Description</th>
                  <th className="py-2 pr-4 text-right">Hours</th>
                  <th className="py-2 pr-4 text-left">Notes</th>
                  <th className="py-2 pr-4 text-right">Billable</th>
                  <th className="py-2 pl-2 pr-0 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, index) => {
                  const hasValidId = isValidObjectId(entry._id);
                  return (
                    <tr
                      key={hasValidId ? entry._id : `${entry.date}-${index}`}
                      className="border-b border-slate-800/60 last:border-b-0"
                    >
                      <td className="py-2 pr-4 align-top text-slate-100">
                        {formatDisplayDate(entry.date)}
                      </td>
                      <td className="py-2 pr-4 align-top text-slate-100">{entry.description}</td>
                      <td className="py-2 pr-4 align-top text-right text-slate-100">
                        {Number.isFinite(entry.hours) ? entry.hours.toFixed(2) : "0.00"}
                      </td>
                      <td className="py-2 pr-4 align-top text-slate-300">{entry.notes || "—"}</td>
                      <td className="py-2 pr-4 align-top text-right text-slate-300">
                        {entry.isBillable ? "Yes" : "No"}
                      </td>
                      <td className="py-2 pl-2 pr-0 align-top text-right">
                        {hasValidId ? (
                          <Link
                            href={`/app/estates/${estateId}/time/${entry._id}`}
                            className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] font-medium text-slate-100 hover:bg-slate-800"
                          >
                            View / edit
                          </Link>
                        ) : (
                          <span className="text-[11px] text-slate-500">No ID available</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t border-slate-700 font-semibold text-slate-100">
                  <td className="py-2 pr-4 align-top">Totals</td>
                  <td className="py-2 pr-4 align-top"></td>
                  <td className="py-2 pr-4 align-top text-right">{totalHours.toFixed(2)}</td>
                  <td className="py-2 pr-4 align-top"></td>
                  <td className="py-2 pr-4 align-top"></td>
                  <td className="py-2 pl-2 pr-0 align-top"></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 text-xs text-slate-400">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Coming soon
        </div>
        <p>
          LegatePro will soon combine your time entries, expenses, rent, and tasks into a single
          chronological timeline so you can generate a court-ready activity report in one click.
        </p>
      </section>
    </div>
  );
}