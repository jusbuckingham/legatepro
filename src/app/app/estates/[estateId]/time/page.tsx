"use client";

import { useEffect, useState, FormEvent } from "react";

interface TimeEntry {
  _id: string;
  estateId: string;
  date: string;
  hours: number;
  description: string;
  notes?: string;
  isBillable?: boolean;
}

interface PageProps {
  params: {
    estateId: string;
  };
}

export default function EstateTimecardPage({ params }: PageProps) {
  const { estateId } = params;

  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState<string>("1.0");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [isBillable, setIsBillable] = useState(true);

  async function loadEntries() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/time?estateId=${encodeURIComponent(estateId)}`);
      if (!res.ok) {
        throw new Error("Failed to load time entries");
      }
      const data = await res.json();
      setEntries(data.entries ?? []);
    } catch (err) {
      console.error(err);
      setError("Unable to load time entries.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estateId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const parsedHours = Number(hours);
    if (Number.isNaN(parsedHours) || parsedHours <= 0) {
      setError("Please enter a valid number of hours.");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch("/api/time", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          estateId,
          date,
          hours: parsedHours,
          description,
          notes,
          isBillable,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const msg = data?.error || "Failed to create time entry.";
        throw new Error(msg);
      }

      // Reset form & reload entries
      setDescription("");
      setNotes("");
      setHours("1.0");
      await loadEntries();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to create time entry.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Timecard</h1>
          <p className="text-sm text-slate-400">
            Track your personal representative time for this estate. These entries
            will help you prepare your final time log for the court.
          </p>
        </div>
      </header>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <h2 className="text-sm font-semibold text-slate-100 mb-3">Add time entry</h2>

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
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-red-500"
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
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-red-500"
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
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-red-500"
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
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-red-500"
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
              disabled={loading}
              className="inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Saving..." : "Save entry"}
            </button>
          </div>
        </form>

        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-100">Recent entries</h2>
          <p className="text-xs text-slate-400">
            Total entries: {entries.length}
          </p>
        </div>

        {loading && entries.length === 0 ? (
          <p className="text-sm text-slate-400">Loading time entries…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-slate-400">
            No time entries yet. Start by logging your first activity above.
          </p>
        ) : (
          <div className="overflow-x-auto text-sm">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-4 text-left">Date</th>
                  <th className="py-2 pr-4 text-left">Description</th>
                  <th className="py-2 pr-4 text-right">Hours</th>
                  <th className="py-2 pr-4 text-left">Notes</th>
                  <th className="py-2 pr-0 text-right">Billable</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry._id} className="border-b border-slate-800/60 last:border-b-0">
                    <td className="py-2 pr-4 align-top text-slate-100">
                      {new Date(entry.date).toLocaleDateString()}
                    </td>
                    <td className="py-2 pr-4 align-top text-slate-100">
                      {entry.description}
                    </td>
                    <td className="py-2 pr-4 align-top text-right text-slate-100">
                      {entry.hours.toFixed(2)}
                    </td>
                    <td className="py-2 pr-4 align-top text-slate-300">
                      {entry.notes || "—"}
                    </td>
                    <td className="py-2 pr-0 align-top text-right text-slate-300">
                      {entry.isBillable ? "Yes" : "No"}
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