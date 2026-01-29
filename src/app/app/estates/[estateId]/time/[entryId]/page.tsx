"use client";

import {
  Fragment,
  FormEvent,
  use as usePromise,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
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

function formatDisplayDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

function formatHours(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function buildTimeUrl(estateId: string, params?: { anchor?: string; date?: string }): string {
  const sp = new URLSearchParams();
  if (params?.date) sp.set("date", params.date);
  const qs = sp.toString();
  const base = `/app/estates/${encodeURIComponent(estateId)}/time${qs ? `?${qs}` : ""}`;
  return params?.anchor ? `${base}#${params.anchor}` : base;
}

function confirmLeaveIfDirty(isDirty: boolean): boolean {
  if (!isDirty) return true;
  return window.confirm("You have unsaved changes. Leave without saving?");
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
  const isBusy = saving || deleting;
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const lastLoadedKeyRef = useRef<string | null>(null);

  // Form state
  const [date, setDate] = useState<string>("");
  const [hours, setHours] = useState<string>("1.0");
  const [description, setDescription] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [isBillable, setIsBillable] = useState<boolean>(true);

  const isDirty = useMemo(() => {
    if (!entry) return false;

    const parsedHours = Number(hours);
    const hoursNormalized = Number.isFinite(parsedHours) ? parsedHours : NaN;

    const entryHours = Number.isFinite(entry.hours) ? entry.hours : NaN;

    const sameHours =
      Number.isFinite(hoursNormalized) &&
      Number.isFinite(entryHours) &&
      Math.abs(hoursNormalized - entryHours) < 0.0001;

    const sameDate = (date || "") === (entry.date || "");
    const sameDesc = (description || "").trim() === (entry.description || "").trim();
    const sameNotes = (notes || "").trim() === ((entry.notes ?? "") || "").trim();
    const sameBillable = Boolean(isBillable) === Boolean(entry.isBillable !== false);

    return !(sameHours && sameDate && sameDesc && sameNotes && sameBillable);
  }, [entry, date, hours, description, notes, isBillable]);

  const hoursHelp = useMemo(() => {
    const parsed = Number(hours);
    if (!Number.isFinite(parsed) || parsed <= 0) return "";
    const minutes = Math.round(parsed * 60);
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h <= 0) return `${m} minutes`;
    if (m === 0) return `${h} hour${h === 1 ? "" : "s"}`;
    return `${h} hour${h === 1 ? "" : "s"} ${m} min`;
  }, [hours]);

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
          `/api/estates/${encodeURIComponent(estateId)}/time/${encodeURIComponent(entryId)}`,
          {
            headers: {
              "Cache-Control": "no-store",
            },
          },
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
          description:
            typeof rawEntry.description === "string" ? rawEntry.description : "",
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

        if (!localMissingKind) {
          localMissingKind = "error";
          setMissingKind("error");
        }
      } finally {
        setLoading(false);
      }
    },
    [estateId, entryId],
  );

  useEffect(() => {
    void loadEntry(false);
  }, [loadEntry]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!entry) return;
    if (deleting) return;

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
        `/api/estates/${encodeURIComponent(estateId)}/time/${encodeURIComponent(
          entryId,
        )}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
          body: JSON.stringify({
            date,
            hours: parsedHours,
            description: description.trim(),
            notes: notes.trim() ? notes.trim() : undefined,
            isBillable,
          }),
        },
      );

      const data: unknown = await safeJson(res);
      const apiError = getErrorFromApiPayload(data);

      if (!res.ok || apiError) {
        throw new Error(apiError || "Failed to update time entry.");
      }

      const updated =
        data &&
        typeof data === "object" &&
        "entry" in data &&
        typeof (data as { entry: unknown }).entry === "object"
          ? (data as { entry: Record<string, unknown> }).entry
          : null;

      if (updated) {
        const minutes = typeof updated.minutes === "number" ? updated.minutes : 0;
        const hoursValue =
          typeof updated.hours === "number" ? updated.hours : minutes / 60;

        const normalized: TimeEntry = {
          _id: String(updated._id ?? entry._id),
          estateId: String(updated.estateId ?? entry.estateId),
          date:
            typeof updated.date === "string"
              ? new Date(updated.date).toISOString().slice(0, 10)
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
          isBillable: updated.isBillable === false ? false : true,
        };
        setEntry(normalized);
      }

      setSuccess("Time entry updated.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update time entry.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!entry) return;
    if (saving) return;

    const label = entry
      ? `${new Date(entry.date).toLocaleDateString()} • ${entry.hours.toFixed(
          2,
        )}h • ${entry.description || "(no description)"}`
      : "this time entry";

    const confirmed = window.confirm(`Delete ${label}? This cannot be undone.`);
    if (!confirmed) return;

    setError(null);
    setSuccess(null);

    try {
      setDeleting(true);
      const res = await fetch(
        `/api/estates/${encodeURIComponent(estateId)}/time/${encodeURIComponent(
          entryId,
        )}`,
        {
          method: "DELETE",
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );

      const data: unknown = await safeJson(res);
      const apiError = getErrorFromApiPayload(data);

      if (!res.ok || apiError) {
        throw new Error(apiError || "Failed to delete time entry.");
      }

      router.push(`/app/estates/${estateId}/time`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete time entry.");
    } finally {
      setDeleting(false);
    }
  }

  const titleDate = entry?.date ? formatDisplayDate(entry.date) : "";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="space-y-4">
        <nav className="text-xs text-slate-500">
          <Link
            href="/app/estates"
            className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
            onClick={(e) => {
              if (!confirmLeaveIfDirty(isDirty)) e.preventDefault();
            }}
          >
            Estates
          </Link>
          <span className="mx-1 text-slate-600">/</span>
          <Link
            href={`/app/estates/${estateId}`}
            className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
            onClick={(e) => {
              if (!confirmLeaveIfDirty(isDirty)) e.preventDefault();
            }}
          >
            Estate
          </Link>
          <span className="mx-1 text-slate-600">/</span>
          <Link
            href={buildTimeUrl(estateId)}
            className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
            onClick={(e) => {
              if (!confirmLeaveIfDirty(isDirty)) e.preventDefault();
            }}
          >
            Time
          </Link>
          <span className="mx-1 text-slate-600">/</span>
          <span className="text-rose-300">Entry</span>
        </nav>

        {entry && isDirty ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">Unsaved changes</p>
                <p className="text-xs text-amber-200">You have edits that haven’t been saved yet.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!entry) return;
                  setDate(entry.date);
                  setHours(entry.hours.toString());
                  setDescription(entry.description);
                  setNotes(entry.notes ?? "");
                  setIsBillable(entry.isBillable !== false);
                  setError(null);
                  setSuccess(null);
                }}
                className="mt-2 inline-flex items-center justify-center rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-500/25 sm:mt-0"
              >
                Discard changes
              </button>
            </div>
          </div>
        ) : null}

        {error && !loading ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">Something went wrong</p>
                <p className="text-xs text-rose-200">{error}</p>
              </div>
              <button
                type="button"
                onClick={() => void loadEntry(true)}
                disabled={loading}
                className="mt-2 inline-flex items-center justify-center rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-100 hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-60 sm:mt-0"
              >
                {loading ? "Retrying…" : "Retry"}
              </button>
            </div>
          </div>
        ) : null}

        {success ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            <p className="font-medium">{success}</p>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Time entry</span>
              {entry ? (
                <span className="rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.2em] text-slate-300">
                  {titleDate}
                </span>
              ) : null}
              {entry?.isBillable === false ? (
                <span className="rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.2em] text-slate-300">
                  Non-billable
                </span>
              ) : entry ? (
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
                  Billable
                </span>
              ) : null}
            </div>

            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-50">Entry details</h1>
            <p className="mt-1 text-sm text-slate-400">
              Review, edit, or remove this time entry. Changes update your estate time totals.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Link
              href={buildTimeUrl(estateId)}
              className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 font-medium text-slate-200 hover:border-rose-500/70 hover:text-rose-100"
              onClick={(e) => {
                if (!confirmLeaveIfDirty(isDirty)) e.preventDefault();
              }}
            >
              ← Back to time
            </Link>

            {entry ? (
              <Link
                href={`/app/estates/${estateId}/time/new?date=${encodeURIComponent(entry.date)}`}
                className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-3 py-1 font-semibold text-white hover:bg-rose-500"
                onClick={(e) => {
                  if (!confirmLeaveIfDirty(isDirty)) e.preventDefault();
                }}
              >
                + New entry
              </Link>
            ) : null}

            <button
              type="button"
              onClick={handleDelete}
              disabled={!entry || loading || isBusy}
              className="inline-flex items-center justify-center rounded-full border border-rose-800/60 bg-rose-950/40 px-3 py-1 text-xs font-semibold text-rose-100 hover:bg-rose-900/50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      </header>

      {/* Summary cards */}
      {entry ? (
        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Hours</p>
            <p className="mt-1 text-lg font-semibold text-slate-50">{formatHours(entry.hours)}</p>
            <p className="mt-1 text-xs text-slate-500">{hoursHelp ? (
              <Fragment>
                {hoursHelp} total
              </Fragment>
            ) : ""}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Date</p>
            <p className="mt-1 text-lg font-semibold text-slate-50">{titleDate || "—"}</p>
            <p className="mt-1 text-xs text-slate-500">Log entries daily for clean accounting.</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Billable</p>
            <p className="mt-1 text-lg font-semibold text-slate-50">{entry.isBillable === false ? "No" : "Yes"}</p>
            <p className="mt-1 text-xs text-slate-500">Controls billing totals and reporting.</p>
          </div>
        </section>
      ) : null}

      {/* Body */}
      <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Edit entry</h2>
            <p className="text-xs text-slate-500">Update the date, hours, description, and notes.</p>
          </div>
          <div className="text-[11px] text-slate-500">{entry ? `ID • ${String(entry._id).slice(-6)}` : ""}</div>
        </div>

        {loading ? (
          <div className="space-y-3">
            <div className="h-4 w-40 animate-pulse rounded bg-slate-800" />
            <div className="grid gap-3 md:grid-cols-2">
              <div className="h-10 animate-pulse rounded bg-slate-800" />
              <div className="h-10 animate-pulse rounded bg-slate-800" />
              <div className="h-10 animate-pulse rounded bg-slate-800" />
              <div className="h-24 animate-pulse rounded bg-slate-800 md:col-span-2" />
            </div>
          </div>
        ) : !entry ? (
          <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-6">
            <p className="text-sm font-medium text-slate-100">
              {missingKind === "unauthorized"
                ? "Unauthorized"
                : missingKind === "not_found"
                ? "Time entry not found"
                : "Unable to load time entry"}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              {error ||
                (missingKind === "unauthorized"
                  ? "You don’t have permission to view this entry."
                  : missingKind === "not_found"
                  ? "This entry may have been deleted or the link is incorrect."
                  : "Something went wrong while loading this entry.")}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={buildTimeUrl(estateId)}
                className="inline-flex items-center rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-900/40"
              >
                Back to time
              </Link>

              {missingKind === "error" ? (
                <button
                  type="button"
                  onClick={() => void loadEntry(true)}
                  className="inline-flex items-center rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500"
                >
                  Retry
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSave}
            aria-busy={isBusy}
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
                  disabled={isBusy}
                  onChange={(e) => {
                    setError(null);
                    setSuccess(null);
                    setDate(e.target.value);
                  }}
                  className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-rose-500"
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
                  disabled={isBusy}
                  onChange={(e) => {
                    setError(null);
                    setSuccess(null);
                    setHours(e.target.value);
                  }}
                  className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-rose-500"
                />
                <p className="text-[11px] text-slate-500">
                  Use decimals for partial hours (e.g. 1.5 = 1 hour 30 minutes).
                  {hoursHelp ? (
                    <Fragment>
                      {" "}
                      <span className="text-slate-400">({hoursHelp})</span>
                    </Fragment>
                  ) : null}
                </p>
              </div>

              <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={isBillable}
                  disabled={isBusy}
                  onChange={(e) => {
                    setError(null);
                    setSuccess(null);
                    setIsBillable(e.target.checked);
                  }}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-rose-500 focus:ring-rose-500"
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
                  disabled={isBusy}
                  onChange={(e) => {
                    setError(null);
                    setSuccess(null);
                    setDescription(e.target.value);
                  }}
                  placeholder="Reviewed mail, called attorney, organized documents…"
                  className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-rose-500"
                />
              </div>

              <div className="flex flex-col gap-1 text-sm">
                <label htmlFor="notes" className="text-slate-300">
                  Notes (optional)
                </label>
                <textarea
                  id="notes"
                  value={notes}
                  disabled={isBusy}
                  onChange={(e) => {
                    setError(null);
                    setSuccess(null);
                    setNotes(e.target.value);
                  }}
                  rows={4}
                  className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-rose-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    if (!confirmLeaveIfDirty(isDirty)) return;
                    router.push(buildTimeUrl(estateId));
                  }}
                  disabled={isBusy}
                  className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-900/40 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isBusy || !isDirty}
                  className="rounded-md bg-rose-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
                  title={!isDirty ? "No changes to save" : undefined}
                >
                  {saving ? "Saving…" : !isDirty ? "Saved" : "Save changes"}
                </button>
              </div>
            </div>
          </form>
        )}
      </section>

      {/* Danger zone */}
      {entry && !loading ? (
        <section className="rounded-2xl border border-rose-900/40 bg-rose-950/20 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-rose-100">Danger zone</h3>
              <p className="mt-1 text-xs text-rose-200">
                Deleting removes the entry permanently and updates time totals.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isBusy}
              className="inline-flex items-center justify-center rounded-md border border-rose-800/60 bg-rose-950/40 px-3 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-900/50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleting ? "Deleting…" : "Delete entry"}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}