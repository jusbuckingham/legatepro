"use client";

import {
  use as usePromise,
  useCallback,
  useEffect,
  useRef,
  useState,
  FormEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { safeJson } from "@/lib/utils";

interface TimeEntry {
  _id: string;
  estateId: string;
  date: string; // ISO date (yyyy-mm-dd)
  hours: number;
  description: string;
  notes?: string;
  isBillable?: boolean;
}

interface PageProps {
  params: Promise<{
    estateId: string;
    entryId: string;
  }>;
}

function getErrorFromApiPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;

  // Preferred contract: { ok: false, error: "..." }
  if ("ok" in payload && (payload as { ok?: unknown }).ok === false) {
    const err = (payload as { error?: unknown }).error;
    return typeof err === "string" && err.trim() ? err : "Request failed.";
  }

  // Legacy fallbacks
  const err = (payload as { error?: unknown }).error;
  if (typeof err === "string" && err.trim()) return err;

  const msg = (payload as { message?: unknown }).message;
  if (typeof msg === "string" && msg.trim()) return msg;

  return null;
}

export default function TimeEntryDetailPage({ params }: PageProps) {
  const { estateId, entryId } = usePromise(params);
  const router = useRouter();

  const [entry, setEntry] = useState<TimeEntry | null>(null);
  const [missingKind, setMissingKind] = useState<
    "unauthorized" | "not_found" | "error" | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const lastLoadedKeyRef = useRef<string | null>(null);

  // Form state
  const [date, setDate] = useState<string>("");
  const [hours, setHours] = useState<string>("1.0");
  const [description, setDescription] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [isBillable, setIsBillable] = useState<boolean>(true);

  const loadEntry = useCallback(
    async (force = false) => {
      const loadKey = `${estateId}:${entryId}`;
      if (!force && lastLoadedKeyRef.current === loadKey) return;
      lastLoadedKeyRef.current = loadKey;

      setLoading(true);
      setError(null);
      setSuccess(null);
      setMissingKind(null);
      let localMissingKind: "unauthorized" | "not_found" | "error" | null = null;

      try {
        const res = await fetch(
          `/api/estates/${encodeURIComponent(
            estateId
          )}/time/${encodeURIComponent(entryId)}`
        );

        const data: unknown = await safeJson(res);
        const apiError = getErrorFromApiPayload(data);

        if (!res.ok || apiError) {
          const status = res.status;

          if (status === 401 || status === 403) {
            localMissingKind = "unauthorized";
            setMissingKind("unauthorized");
            throw new Error(apiError || "You don’t have access to this time entry.");
          }

          if (status === 404) {
            localMissingKind = "not_found";
            setMissingKind("not_found");
            throw new Error(apiError || "This time entry no longer exists.");
          }

          localMissingKind = "error";
          setMissingKind("error");
          throw new Error(apiError || "Failed to load time entry.");
        }

        const rawEntry =
          data &&
          typeof data === "object" &&
          "entry" in data &&
          typeof (data as { entry: unknown }).entry === "object"
            ? (data as { entry: Record<string, unknown> }).entry
            : ({} as Record<string, unknown>);

        const minutes = typeof rawEntry.minutes === "number" ? rawEntry.minutes : 0;

        const hoursValue =
          typeof rawEntry.hours === "number" ? rawEntry.hours : minutes / 60;

        const normalized: TimeEntry = {
          _id: String(rawEntry._id ?? entryId),
          estateId: String(rawEntry.estateId ?? estateId),
          date:
            typeof rawEntry.date === "string"
              ? new Date(rawEntry.date).toISOString().slice(0, 10)
              : new Date().toISOString().slice(0, 10),
          hours: Number.isFinite(hoursValue) ? hoursValue : 0,
          description: typeof rawEntry.description === "string" ? rawEntry.description : "",
          notes: typeof rawEntry.notes === "string" ? rawEntry.notes : "",
          isBillable: rawEntry.isBillable === false ? false : true,
        };

        setEntry(normalized);
        setDate(normalized.date);
        setHours(normalized.hours.toString());
        setDescription(normalized.description);
        setNotes(normalized.notes ?? "");
        setIsBillable(normalized.isBillable ?? true);
      } catch (err) {
        setEntry(null);
        setError(err instanceof Error ? err.message : "Unable to load time entry.");

        // If we failed before setting a specific missing kind, default to a generic error state.
        if (!localMissingKind) {
          localMissingKind = "error";
          setMissingKind("error");
        }
      } finally {
        setLoading(false);
      }
    },
    [estateId, entryId]
  );

  // Load the entry on mount / param change
  useEffect(() => {
    void loadEntry(false);
  }, [loadEntry]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!entry) return;

    setError(null);
    setSuccess(null);

    const parsedHours = Number(hours);
    if (Number.isNaN(parsedHours) || parsedHours <= 0) {
      setError("Please enter a valid number of hours.");
      return;
    }

    if (!description.trim()) {
      setError("Description is required.");
      return;
    }

    try {
      setSaving(true);
      const res = await fetch(
        `/api/estates/${encodeURIComponent(
          estateId
        )}/time/${encodeURIComponent(entryId)}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            date,
            hours: parsedHours,
            description: description.trim(),
            notes: notes.trim() || undefined,
            isBillable,
          }),
        }
      );

      const data: unknown = await safeJson(res);
      const apiError = getErrorFromApiPayload(data);

      if (!res.ok || apiError) {
        throw new Error(apiError || "Failed to update time entry.");
      }

      // Update local entry from response if available
      const updated =
        data &&
        typeof data === "object" &&
        "entry" in data &&
        typeof (data as { entry: unknown }).entry === "object"
          ? (data as { entry: Record<string, unknown> }).entry
          : null;

      if (updated) {
        const minutes =
          typeof updated.minutes === "number"
            ? updated.minutes
            : 0;
        const hoursValue =
          typeof updated.hours === "number"
            ? updated.hours
            : minutes / 60;

        const normalized: TimeEntry = {
          _id: String(updated._id ?? entry._id),
          estateId: String(updated.estateId ?? entry.estateId),
          date:
            typeof updated.date === "string"
              ? new Date(updated.date)
                  .toISOString()
                  .slice(0, 10)
              : date,
          hours: Number.isFinite(hoursValue) ? hoursValue : parsedHours,
          description:
            typeof updated.description === "string"
              ? updated.description
              : description.trim(),
          notes:
            typeof updated.notes === "string"
              ? updated.notes
              : notes.trim() || undefined,
          isBillable:
            updated.isBillable === false ? false : true,
        };
        setEntry(normalized);
      }

      setSuccess("Time entry updated.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to update time entry."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!entry) return;

    const confirmed = window.confirm(
      "Delete this time entry? This cannot be undone."
    );
    if (!confirmed) return;

    setError(null);
    setSuccess(null);

    try {
      setDeleting(true);
      const res = await fetch(
        `/api/estates/${encodeURIComponent(
          estateId
        )}/time/${encodeURIComponent(entryId)}`,
        {
          method: "DELETE",
        }
      );

      const data: unknown = await safeJson(res);
      const apiError = getErrorFromApiPayload(data);

      if (!res.ok || apiError) {
        throw new Error(apiError || "Failed to delete time entry.");
      }

      router.push(`/app/estates/${estateId}/time`);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to delete time entry."
      );
    } finally {
      setDeleting(false);
    }
  }

  const titleDate = entry
    ? new Date(entry.date).toLocaleDateString()
    : "";

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs text-slate-500">
            <Link
              href={`/app/estates/${estateId}/time`}
              className="text-slate-400 hover:text-slate-200"
            >
              ← Back to timecard
            </Link>
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-50">
            Time entry
          </h1>
          {entry && (
            <p className="text-sm text-slate-400">
              {titleDate} • {entry.hours.toFixed(2)} hours
              {entry.isBillable === false ? " (non-billable)" : ""}
            </p>
          )}
        </div>

        {entry && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="inline-flex items-center justify-center rounded-md border border-red-800/60 bg-red-950/40 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-900/50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {deleting ? "Deleting…" : "Delete entry"}
          </button>
        )}
      </header>

      {/* Status + meta */}
      {entry && (
        <section className="grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">
              Billable
            </p>
            <p className="mt-1 text-sm font-medium text-slate-50">
              {entry.isBillable === false ? "No" : "Yes"}
            </p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">
              Date
            </p>
            <p className="mt-1 text-sm font-medium text-slate-50">
              {titleDate}
            </p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">
              Hours logged
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-50">
              {entry.hours.toFixed(2)}
            </p>
          </div>
        </section>
      )}

      {/* Edit form */}
      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-100">
          Edit time entry
        </h2>

        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : !entry ? (
          <div className="rounded-md border border-slate-800 bg-slate-950/40 p-4">
            <h3 className="text-sm font-semibold text-slate-100">
              {missingKind === "unauthorized"
                ? "Unauthorized"
                : missingKind === "not_found"
                ? "Time entry not found"
                : "Unable to load time entry"}
            </h3>
            <p className="mt-1 text-sm text-slate-400">
              {error ||
                (missingKind === "unauthorized"
                  ? "You don’t have permission to view this entry."
                  : missingKind === "not_found"
                  ? "This entry may have been deleted or the link is incorrect."
                  : "Something went wrong while loading this entry.")}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={`/app/estates/${estateId}/time`}
                className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
              >
                Back to timecard
              </Link>

              {missingKind === "error" && (
                <button
                  type="button"
                  onClick={() => void loadEntry(true)}
                  className="inline-flex items-center rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={loading}
                >
                  {loading ? "Retrying…" : "Retry"}
                </button>
              )}
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSave}
            className="grid gap-4 md:grid-cols-2 md:items-start"
          >
            <div className="space-y-3">
              <div className="flex flex-col gap-1 text-sm">
                <label htmlFor="date" className="text-slate-300">
                  Date
                </label>
                <input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setSuccess(null);
                    setDate(e.target.value);
                  }}
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
                  onChange={(e) => {
                    setSuccess(null);
                    setHours(e.target.value);
                  }}
                  className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-red-500"
                />
                <p className="text-[11px] text-slate-500">
                  Use decimals for partial hours (e.g. 1.5 = 1 hour 30
                  minutes).
                </p>
              </div>

              <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={isBillable}
                  onChange={(e) => {
                    setSuccess(null);
                    setIsBillable(e.target.checked);
                  }}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-red-500 focus:ring-red-500"
                />
                Billable to estate
              </label>
            </div>

            <div className="space-y-3">
              <div className="flex flex-col gap-1 text-sm">
                <label htmlFor="description" className="text-slate-300">
                  Description
                </label>
                <input
                  id="description"
                  type="text"
                  value={description}
                  onChange={(e) => {
                    setSuccess(null);
                    setDescription(e.target.value);
                  }}
                  placeholder="Reviewed mail, called attorney, organized documents…"
                  className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>

              <div className="flex flex-col gap-1 text-sm">
                <label htmlFor="notes" className="text-slate-300">
                  Notes (optional)
                </label>
                <textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => {
                    setSuccess(null);
                    setNotes(e.target.value);
                  }}
                  rows={4}
                  className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() =>
                    router.push(`/app/estates/${estateId}/time`)
                  }
                  className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md bg-red-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>

            {(error || success) && (
              <div className="md:col-span-2">
                {error && (
                  <p className="text-xs text-red-400" role="alert">
                    {error}
                  </p>
                )}
                {success && (
                  <p className="text-xs text-emerald-400" role="status">
                    {success}
                  </p>
                )}
              </div>
            )}
          </form>
        )}
      </section>
    </div>
  );
}