"use client";

import {
  use as usePromise,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  Fragment,
} from "react";
import type { ChangeEvent, FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import PageHeader from "@/components/layout/PageHeader";
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
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatHoursHuman(hoursValue: number): string {
  if (!Number.isFinite(hoursValue) || hoursValue <= 0) return "";
  const minutes = Math.round(hoursValue * 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h <= 0) return `${m} minutes`;
  if (m === 0) return `${h} hour${h === 1 ? "" : "s"}`;
  return `${h} hour${h === 1 ? "" : "s"} ${m} min`;
}

function monthGroupLabel(isoLike: string): string {
  const d = new Date(isoLike);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long" });
}

function getEntryId(entry: TimeEntry): string | null {
  const candidate =
    typeof entry._id === "string"
      ? entry._id
      : typeof entry.id === "string"
        ? entry.id
        : null;

  return candidate && candidate.trim().length > 0 ? candidate : null;
}

export default function EstateTimecardPage({ params }: PageProps) {
  const { estateId } = usePromise(params);
  const estateIdEncoded = encodeURIComponent(estateId);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const clearSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState<string>("1.0");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [isBillable, setIsBillable] = useState(true);
  const [hourlyRate, setHourlyRate] = useState<string>("0.00");

  const parsedHours = useMemo(() => {
    const parsed = Number(hours);
    return Number.isFinite(parsed) ? parsed : NaN;
  }, [hours]);

  const hoursHelp = useMemo(() => {
    if (!Number.isFinite(parsedHours) || parsedHours <= 0) return "";
    return formatHoursHuman(parsedHours);
  }, [parsedHours]);

  const canSubmit = useMemo(() => {
    return !submitting && !loadingEntries && Number.isFinite(parsedHours) && parsedHours > 0 && !!description.trim();
  }, [submitting, loadingEntries, parsedHours, description]);

  const QUICK_ADD_PRESETS = useMemo(
    () =>
      [
        {
          label: "Bank call",
          description: "Called bank re: estate account / balances",
          notes: "Spoke with: ____ | Outcome: ____",
        },
        {
          label: "Court / filing",
          description: "Reviewed/updated court filing requirements",
          notes: "Docs needed: ____ | Deadline: ____",
        },
        {
          label: "Property visit",
          description: "Visited property / coordinated access",
          notes: "Who met: ____ | Condition: ____ | Next step: ____",
        },
        {
          label: "Document review",
          description: "Reviewed mail, statements, and records",
          notes: "Key findings: ____",
        },
        {
          label: "Vendor / maintenance",
          description: "Coordinated vendor/maintenance for estate property",
          notes: "Vendor: ____ | Quote: ____ | Scheduled: ____",
        },
      ] as const,
    [],
  );

  const loadEntries = useCallback(async () => {
    try {
      setLoadingEntries(true);
      setError(null);

      const res = await fetch(`/api/estates/${estateIdEncoded}/time`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      const data: unknown = await safeJson(res);

      if (res.status === 401) {
        const callbackUrl = encodeURIComponent(`/app/estates/${estateIdEncoded}/time`);
        router.push(`/login?callbackUrl=${callbackUrl}`);
        return;
      }

      if (!res.ok) {
        const msg = getErrorFromApiPayload(data, "Failed to load time entries");
        throw new Error(msg);
      }

      if (data && typeof data === "object" && (data as { ok?: unknown }).ok === false) {
        throw new Error(getErrorFromApiPayload(data, "Failed to load time entries"));
      }

      const payload = (data ?? {}) as {
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
      };

      const loadedEntriesRaw = Array.isArray(payload.entries) ? payload.entries : [];

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
      setError(err instanceof Error ? err.message : "Unable to load time entries.");
    } finally {
      setLoadingEntries(false);
    }
  }, [estateId, estateIdEncoded, router]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const setSuccessWithAutoClear = useCallback((message: string) => {
    setSuccess(message);
    if (clearSuccessTimerRef.current) clearTimeout(clearSuccessTimerRef.current);
    clearSuccessTimerRef.current = setTimeout(() => {
      setSuccess(null);
    }, 3500);
  }, []);

  // If we arrive here from the "new" page, allow a query flag to show a one-time success message.
  useEffect(() => {
    const created = searchParams?.get("created");
    if (created !== "1") return;

    setSuccessWithAutoClear("Time entry saved.");

    const params = new URLSearchParams(searchParams?.toString());
    params.delete("created");
    const qs = params.toString();
    const nextUrl = qs ? `${pathname}?${qs}` : pathname;
    router.replace(nextUrl);
  }, [searchParams, router, pathname, setSuccessWithAutoClear]);

  useEffect(() => {
    return () => {
      const timer = clearSuccessTimerRef.current;
      if (timer) clearTimeout(timer);
      clearSuccessTimerRef.current = null;
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const parsedHoursLocal = Number(hours);
    if (Number.isNaN(parsedHoursLocal) || parsedHoursLocal <= 0) {
      setError("Please enter a valid number of hours.");
      return;
    }

    if (!description.trim()) {
      setError("Please add a short description of what you did.");
      return;
    }

    try {
      setSubmitting(true);

      const res = await fetch(`/api/estates/${estateIdEncoded}/time`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estateId,
          date,
          hours: parsedHoursLocal,
          description: description.trim(),
          notes: notes.trim() || undefined,
          isBillable,
        }),
      });

      const data: unknown = await safeJson(res);

      if (res.status === 401) {
        const callbackUrl = encodeURIComponent(`/app/estates/${estateIdEncoded}/time`);
        router.push(`/login?callbackUrl=${callbackUrl}`);
        return;
      }

      if (!res.ok) {
        const msg = getErrorFromApiPayload(data, "Failed to create time entry.");
        throw new Error(msg);
      }

      if (data && typeof data === "object" && (data as { ok?: unknown }).ok === false) {
        throw new Error(getErrorFromApiPayload(data, "Failed to create time entry."));
      }

      setDescription("");
      setNotes("");
      setHours("1.0");
      setSuccessWithAutoClear("Time entry saved.");
      await loadEntries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create time entry.");
    } finally {
      setSubmitting(false);
    }
  }

  const totalHours = useMemo(
    () => entries.reduce((sum, entry) => sum + (entry.hours || 0), 0),
    [entries],
  );

  const billableHours = useMemo(
    () =>
      entries.reduce(
        (sum, entry) => (entry.isBillable === false ? sum : sum + (entry.hours || 0)),
        0,
      ),
    [entries],
  );

  const nonBillableHours = useMemo(() => totalHours - billableHours, [totalHours, billableHours]);

  const now = useMemo(() => new Date(), []);

  const { weekTotalHours, weekBillableHours, monthTotalHours, monthBillableHours } = useMemo(() => {
    const safeDate = (value: string) => {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    };

    // Week starts on Monday.
    const startOfWeek = new Date(now);
    const day = startOfWeek.getDay();
    const diffToMonday = (day + 6) % 7;
    startOfWeek.setDate(startOfWeek.getDate() - diffToMonday);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    startOfMonth.setHours(0, 0, 0, 0);

    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    endOfMonth.setHours(0, 0, 0, 0);

    let weekTotal = 0;
    let weekBillable = 0;
    let monthTotal = 0;
    let monthBillable = 0;

    for (const entry of entries) {
      const d = safeDate(entry.date);
      if (!d) continue;

      const hrs = Number.isFinite(entry.hours) ? entry.hours : 0;
      const isBillableEntry = entry.isBillable !== false;

      if (d >= startOfWeek && d < endOfWeek) {
        weekTotal += hrs;
        if (isBillableEntry) weekBillable += hrs;
      }

      if (d >= startOfMonth && d < endOfMonth) {
        monthTotal += hrs;
        if (isBillableEntry) monthBillable += hrs;
      }
    }

    return {
      weekTotalHours: weekTotal,
      weekBillableHours: weekBillable,
      monthTotalHours: monthTotal,
      monthBillableHours: monthBillable,
    };
  }, [entries, now]);

  const rateNumber = useMemo(() => {
    const parsed = Number.parseFloat(hourlyRate);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [hourlyRate]);

  const billableTotalAmount = useMemo(() => billableHours * rateNumber, [billableHours, rateNumber]);

  const groupedEntries = useMemo(() => {
    const groups = new Map<string, TimeEntry[]>();

    for (const entry of entries) {
      const label = monthGroupLabel(entry.date);
      const list = groups.get(label) ?? [];
      list.push(entry);
      groups.set(label, list);
    }

    // Preserve current sort (entries already sorted desc by date) while keeping groups in that order.
    const orderedLabels: string[] = [];
    for (const entry of entries) {
      const label = monthGroupLabel(entry.date);
      if (!orderedLabels.includes(label)) orderedLabels.push(label);
    }

    return orderedLabels.map((label) => ({
      label,
      entries: groups.get(label) ?? [],
    }));
  }, [entries]);

  function handleExportCsv(mode: "all" | "billable" = "all") {
    if (!entries.length) return;

    const filtered =
      mode === "billable" ? entries.filter((entry) => entry.isBillable !== false) : entries;

    if (filtered.length === 0) return;

    const header = ["Date", "Hours", "Billable", "Description", "Notes", "Rate", "Amount"];

    const rows = filtered.map((entry) => {
      const dateStr = new Date(entry.date).toISOString().slice(0, 10);
      const hoursStr = entry.hours.toFixed(2);
      const billableStr = entry.isBillable === false ? "No" : "Yes";
      const desc = entry.description ?? "";
      const notesStr = entry.notes ?? "";
      const rateStr = rateNumber.toFixed(2);
      const amount = entry.isBillable === false ? 0 : entry.hours * rateNumber;
      const amountStr = amount.toFixed(2);

      const esc = (value: string) => `"${value.replace(/"/g, '""')}"`;

      return [dateStr, hoursStr, billableStr, esc(desc), esc(notesStr), rateStr, amountStr].join(",");
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

  const isBusy = loadingEntries || submitting;
  const canExport = entries.length > 0 && !loadingEntries;
  const hasBillableEntries = entries.some((entry) => entry.isBillable !== false);

  return (
    <div
      className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6 sm:px-6 lg:px-8"
      aria-busy={isBusy}
      aria-live="polite"
    >
      <PageHeader
        eyebrow={
          <nav className="text-xs text-slate-500">
            <Link
              href="/app/estates"
              className="text-slate-400 hover:text-slate-200 hover:underline"
            >
              Estates
            </Link>
            <span className="mx-1 text-slate-600">/</span>
            <Link
              href={`/app/estates/${estateIdEncoded}`}
              className="text-slate-400 hover:text-slate-200 hover:underline"
            >
              Overview
            </Link>
            <span className="mx-1 text-slate-600">/</span>
            <span className="truncate text-rose-200">Time</span>
          </nav>
        }
        title="Timecard"
        description="Track your personal representative time for this estate. These entries help you prepare a court-ready time log."
        actions={
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
              <span className="inline-flex items-center rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5">
                Entries: <span className="ml-1 text-slate-200">{entries.length}</span>
              </span>
              <span className="inline-flex items-center rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5">
                All-time: <span className="ml-1 text-slate-200">{totalHours.toFixed(2)}h</span>
              </span>
              <span className="inline-flex items-center rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5">
                Billable: <span className="ml-1 text-slate-200">{billableHours.toFixed(2)}h</span>
              </span>
              <span className="inline-flex items-center rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5">
                Week: <span className="ml-1 text-slate-200">{weekTotalHours.toFixed(2)}h</span>
              </span>
              <span className="inline-flex items-center rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5">
                Month: <span className="ml-1 text-slate-200">{monthTotalHours.toFixed(2)}h</span>
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link
                href={`/app/estates/${estateIdEncoded}/time/new`}
                className="inline-flex items-center justify-center rounded-md bg-rose-500 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white hover:bg-rose-400"
              >
                New entry
              </Link>

              <button
                type="button"
                onClick={() => handleExportCsv("all")}
                disabled={!canExport}
                className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/60 disabled:cursor-not-allowed disabled:opacity-60"
                title={
                  loadingEntries
                    ? "Loading entries…"
                    : !canExport
                      ? "No entries to export"
                      : "Export all entries as CSV"
                }
              >
                Export all
              </button>

              <button
                type="button"
                onClick={() => handleExportCsv("billable")}
                disabled={!canExport || !hasBillableEntries}
                className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/60 disabled:cursor-not-allowed disabled:opacity-60"
                title={
                  loadingEntries
                    ? "Loading entries…"
                    : !hasBillableEntries
                      ? "No billable entries to export"
                      : "Export billable entries as CSV"
                }
              >
                Export billable
              </button>

              <Link
                href={`/app/estates/${estateIdEncoded}`}
                className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/60"
              >
                Back
              </Link>
            </div>
          </div>
        }
      />

      {success ? (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold text-emerald-100">Saved</div>
              <div className="mt-1 text-xs text-emerald-100/80">{success}</div>
            </div>
            <button
              type="button"
              onClick={() => setSuccess(null)}
              className="inline-flex items-center justify-center rounded-md border border-emerald-500/30 bg-slate-950/60 px-3 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-slate-900/50"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

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
                href={`/app/estates/${estateIdEncoded}`}
                className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-900/50"
              >
                Back to overview
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Total hours</p>
          <p className="mt-1 text-lg font-semibold text-slate-50">{totalHours.toFixed(2)}</p>
          <p className="mt-1 text-[11px] text-slate-500">
            Billable {billableHours.toFixed(2)}h · Non-billable {nonBillableHours.toFixed(2)}h
          </p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Billable hours</p>
          <p className="mt-1 text-lg font-semibold text-slate-50">{billableHours.toFixed(2)}</p>
          <p className="mt-1 text-[11px] text-slate-500">
            Est. value {formatUsd(billableTotalAmount)} @ {rateNumber.toFixed(2)}/hr
          </p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">This week</p>
          <p className="mt-1 text-lg font-semibold text-slate-50">{weekTotalHours.toFixed(2)}h</p>
          <p className="mt-1 text-[11px] text-slate-500">Billable {weekBillableHours.toFixed(2)}h</p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">This month</p>
          <p className="mt-1 text-lg font-semibold text-slate-50">{monthTotalHours.toFixed(2)}h</p>
          <p className="mt-1 text-[11px] text-slate-500">Billable {monthBillableHours.toFixed(2)}h</p>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="text-slate-400">Hourly rate</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={hourlyRate}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              if (error) setError(null);
              if (success) setSuccess(null);
              setHourlyRate(e.target.value);
            }}
            className="w-24 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-right text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-rose-500"
          />
          <span className="text-[11px] text-slate-500">USD per hour (for exports)</span>
        </div>
        <div className="text-[11px] text-slate-400">
          Estimated billable total:{" "}
          <span className="font-semibold text-slate-100">{formatUsd(billableTotalAmount)}</span>
        </div>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold text-slate-100">Add time entry</h2>
          <p className="text-[11px] text-slate-500">
            Tip: keep descriptions concrete (who/what/outcome) so you can export a court-ready log later.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-3 md:grid-cols-4 md:items-end">
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
                if (error) setError(null);
                if (success) setSuccess(null);
                setDate(e.target.value);
              }}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-rose-500"
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
                if (error) setError(null);
                if (success) setSuccess(null);
                setHours(e.target.value);
              }}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-rose-500"
            />
            <p className="text-[11px] text-slate-500">
              Use decimals for partial hours (e.g. 1.5 = 1h 30m).
              {hoursHelp ? (
                <> <span className="text-slate-400">({hoursHelp})</span></>
              ) : null}
            </p>
          </div>

          <div className="flex flex-col gap-1 text-sm md:col-span-2">
            <label htmlFor="description" className="text-slate-300">
              Description
            </label>
            <input
              id="description"
              type="text"
              value={description}
              disabled={isBusy}
              onChange={(e) => {
                if (error) setError(null);
                if (success) setSuccess(null);
                setDescription(e.target.value);
              }}
              placeholder="Reviewed bank statements, called attorney, etc."
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-rose-500"
            />
          </div>

          <div className="flex flex-col gap-1 text-sm md:col-span-3">
            <label htmlFor="notes" className="text-slate-300">
              Notes (optional)
            </label>
            <textarea
              id="notes"
              value={notes}
              disabled={isBusy}
              onChange={(e) => {
                if (error) setError(null);
                if (success) setSuccess(null);
                setNotes(e.target.value);
              }}
              rows={2}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-rose-500"
            />
          </div>

          <div className="flex flex-col gap-2 text-sm">
            <label className="inline-flex items-center gap-2 text-slate-300">
              <input
                type="checkbox"
                checked={isBillable}
                disabled={isBusy}
                onChange={(e) => {
                  if (error) setError(null);
                  if (success) setSuccess(null);
                  setIsBillable(e.target.checked);
                }}
                className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-rose-500 focus:ring-rose-500"
              />
              Billable to estate
            </label>

            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center justify-center rounded-md bg-rose-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              title={
                !canSubmit
                  ? "Add a description and a valid hour amount to save"
                  : "Save time entry"
              }
            >
              {submitting ? "Saving…" : "Save entry"}
            </button>
          </div>
        </form>

        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Quick add</p>
            <p className="text-[11px] text-slate-500">Prefill a common entry, then tweak and save.</p>
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            {QUICK_ADD_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setDescription(preset.description);
                  setNotes(preset.notes);
                  setError(null);
                  setSuccess(null);
                }}
                className="inline-flex items-center rounded-full border border-slate-800 bg-slate-950 px-3 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-900/60"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div aria-live="polite" className="sr-only" role="status">
          {error ?? ""}
        </div>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-100">Recent entries</h2>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            {loadingEntries ? <span className="text-[11px] text-slate-500">Loading…</span> : null}
            <p>
              {entries.length} entr{entries.length === 1 ? "y" : "ies"}
            </p>
          </div>
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
              Start with the first 3–5 things you’ve already done: bank calls, court filings, property
              visits, or document review.
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={`/app/estates/${estateIdEncoded}/time/new`}
                className="inline-flex items-center justify-center rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500"
              >
                New entry
              </Link>
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
          <>
                {/* Mobile cards */}
                <div className="space-y-2 md:hidden">
                  {groupedEntries.map((group) => (
                    <div key={group.label} className="space-y-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        {group.label}
                      </div>

                      {group.entries.map((entry, index) => {
                        const entryId = getEntryId(entry);
                        const hoursText = Number.isFinite(entry.hours) ? entry.hours.toFixed(2) : "0.00";
                        return (
                          <div
                            key={entryId ?? `${entry.date}-${index}`}
                            className="rounded-xl border border-slate-800 bg-slate-950/40 p-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-xs font-medium text-slate-200">
                                  {formatDisplayDate(entry.date)}
                                </div>
                                <div className="mt-1 text-sm font-semibold text-slate-100 line-clamp-2">
                                  {entry.description}
                                </div>
                                <div className="mt-1 text-xs text-slate-400 line-clamp-2">
                                  {entry.notes || "—"}
                                </div>
                              </div>

                              <div className="flex flex-col items-end gap-2">
                                <span className="inline-flex items-center rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5 text-[11px] text-slate-200">
                                  {hoursText}h
                                </span>
                                <span className="text-[11px] text-slate-400">
                                  {entry.isBillable ? "Billable" : "Non-billable"}
                                </span>
                              </div>
                            </div>

                            <div className="mt-3 flex justify-end">
                              {entryId ? (
                                <Link
                                  href={`/app/estates/${estateIdEncoded}/time/${encodeURIComponent(entryId)}`}
                                  className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] font-medium text-slate-100 hover:bg-slate-800"
                                >
                                  View / edit
                                </Link>
                              ) : (
                                <span className="text-[11px] text-slate-500">No ID available</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <div className="hidden overflow-x-auto text-sm md:block">
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
                      {groupedEntries.map((group) => (
                        <Fragment key={group.label}>
                          <tr>
                            <td
                              colSpan={6}
                              className="pt-4 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400"
                            >
                              {group.label}
                            </td>
                          </tr>

                          {group.entries.map((entry, index) => {
                            const entryId = getEntryId(entry);
                            return (
                              <tr
                                key={entryId ?? `${entry.date}-${index}`}
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
                                  {entryId ? (
                                    <Link
                                      href={`/app/estates/${estateIdEncoded}/time/${encodeURIComponent(entryId)}`}
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
                        </Fragment>
                      ))}

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
          </>
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