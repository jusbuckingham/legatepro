"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type EstateEvent = {
  id: string;
  ownerId: string;
  estateId: string;
  type: string;
  summary: string;
  detail?: string | null;
  meta?: Record<string, unknown> | null;
  createdAt?: string | Date | null;
};

type ActivityResponse = {
  ok: boolean;
  error?: string;
  estateId?: string;
  events?: EstateEvent[];
  nextCursor?: string | null;
};

async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function formatWhen(value?: string | Date) {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

const TYPE_LABELS: Record<string, string> = {
  INVOICE_CREATED: "Invoice created",
  INVOICE_UPDATED: "Invoice updated",
  INVOICE_STATUS_CHANGED: "Invoice status changed",
  COLLABORATOR_ADDED: "Collaborator added",
  COLLABORATOR_REMOVED: "Collaborator removed",
  COLLABORATOR_ROLE_CHANGED: "Collaborator role changed",
};

function getMetaString(meta: Record<string, unknown> | null | undefined, key: string): string | null {
  if (!meta) return null;
  const v = meta[key];
  if (typeof v === "string" && v.trim().length > 0) return v;
  return null;
}

function buildEventHref(estateId: string, ev: EstateEvent): string | null {
  const safeEstateId = encodeURIComponent(estateId);
  const meta = ev.meta ?? null;

  // Prefer explicit ids if present
  const invoiceId = getMetaString(meta, "invoiceId") ?? getMetaString(meta, "entityId");
  const taskId = getMetaString(meta, "taskId") ?? getMetaString(meta, "entityId");
  const documentId = getMetaString(meta, "documentId") ?? getMetaString(meta, "entityId");
  const noteId = getMetaString(meta, "noteId") ?? getMetaString(meta, "entityId");

  const kind = (getMetaString(meta, "kind") ?? getMetaString(meta, "entityType") ?? "").toLowerCase();

  if (kind === "invoice" && invoiceId) return `/app/estates/${safeEstateId}/invoices/${encodeURIComponent(invoiceId)}`;
  if (kind === "task" && taskId) return `/app/estates/${safeEstateId}/tasks/${encodeURIComponent(taskId)}`;
  if (kind === "document" && documentId) return `/app/estates/${safeEstateId}/documents/${encodeURIComponent(documentId)}`;
  if (kind === "note" && noteId) return `/app/estates/${safeEstateId}/notes#${encodeURIComponent(noteId)}`;

  // Type-based fallbacks
  if (ev.type.startsWith("INVOICE_") && invoiceId) return `/app/estates/${safeEstateId}/invoices/${encodeURIComponent(invoiceId)}`;
  if (ev.type.startsWith("TASK_") && taskId) return `/app/estates/${safeEstateId}/tasks/${encodeURIComponent(taskId)}`;
  if (ev.type.startsWith("DOCUMENT_") && documentId) return `/app/estates/${safeEstateId}/documents/${encodeURIComponent(documentId)}`;

  // No link
  return null;
}

export default function EstateActivityPage({
  params,
}: {
  params: { estateId: string };
}) {
  const estateId = params.estateId;

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [events, setEvents] = useState<EstateEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const [noteText, setNoteText] = useState("");

  const [typeFilter, setTypeFilter] = useState<string>("ALL");

  const viewerBlocked = error?.toLowerCase().includes("viewer access") ?? false;

  const baseUrl = useMemo(
    () => `/api/estates/${encodeURIComponent(estateId)}/activity`,
    [estateId]
  );

  const buildUrl = useCallback(
    (cursor?: string | null) => {
      const url = new URL(baseUrl, window.location.origin);
      url.searchParams.set("limit", "25");

      if (cursor) url.searchParams.set("cursor", cursor);

      if (typeFilter && typeFilter !== "ALL") {
        url.searchParams.set("types", typeFilter);
      }

      return url.toString();
    },
    [baseUrl, typeFilter]
  );

  const fetchFirstPage = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(buildUrl(null), {
        method: "GET",
        headers: { accept: "application/json" },
        cache: "no-store",
      });

      const data = await safeJson<ActivityResponse>(res);

      if (res.status === 401) {
        setError("You’re not signed in. Please refresh and sign in again.");
        setEvents([]);
        setNextCursor(null);
        return;
      }

      if (res.status === 403) {
        setError("You don’t have access to this estate’s activity.");
        setEvents([]);
        setNextCursor(null);
        return;
      }

      if (!res.ok || !data?.ok) {
        setError(data?.error ?? `Failed to load activity (${res.status})`);
        setEvents([]);
        setNextCursor(null);
        return;
      }

      setEvents(Array.isArray(data.events) ? data.events : []);
      setNextCursor(typeof data.nextCursor === "string" ? data.nextCursor : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load activity");
      setEvents([]);
      setNextCursor(null);
    } finally {
      setLoading(false);
    }
  }, [buildUrl]);

  const loadMore = useCallback(async () => {
    if (!nextCursor) return;

    setLoadingMore(true);
    setError(null);

    try {
      const res = await fetch(buildUrl(nextCursor), {
        method: "GET",
        headers: { accept: "application/json" },
        cache: "no-store",
      });

      const data = await safeJson<ActivityResponse>(res);

      if (res.status === 401) {
        setError("You’re not signed in. Please refresh and sign in again.");
        return;
      }

      if (res.status === 403) {
        setError("You don’t have access to load more activity for this estate.");
        return;
      }

      if (!res.ok || !data?.ok) {
        setError(data?.error ?? `Failed to load more activity (${res.status})`);
        return;
      }

      const next = Array.isArray(data.events) ? data.events : [];
      setEvents((prev) => [...prev, ...next]);
      setNextCursor(typeof data.nextCursor === "string" ? data.nextCursor : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load more activity");
    } finally {
      setLoadingMore(false);
    }
  }, [buildUrl, nextCursor]);

  const addNote = useCallback(async () => {
    const trimmed = noteText.trim();
    if (!trimmed) {
      setError("Enter a note first.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(baseUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ note: trimmed }),
      });

      const data = await safeJson<{ ok?: boolean; error?: string }>(res);

      if (res.status === 401) {
        setError("You’re not signed in. Please refresh and sign in again.");
        return;
      }

      if (res.status === 403) {
        setError("Viewer access: you can’t add notes to the activity timeline.");
        return;
      }

      if (!res.ok || data?.ok === false) {
        setError(data?.error ?? `Failed to add note (${res.status})`);
        return;
      }

      setNoteText("");
      await fetchFirstPage();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add note");
    } finally {
      setSaving(false);
    }
  }, [baseUrl, fetchFirstPage, noteText]);

  useEffect(() => {
    void fetchFirstPage();
  }, [fetchFirstPage]);

  const availableTypes = useMemo(() => {
    const set = new Set<string>();
    events.forEach((e) => set.add(e.type));
    return Array.from(set).sort();
  }, [events]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs text-neutral-500">
            <Link href={`/app/estates/${encodeURIComponent(estateId)}`} className="hover:underline">
              ← Back to estate
            </Link>
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Activity</h1>
          <p className="mt-1 text-sm text-neutral-500">
            A timeline of actions taken on this estate.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/app/estates/${encodeURIComponent(estateId)}/timeline`}
            className="h-10 rounded-md border border-neutral-300 bg-white px-4 text-sm text-neutral-900 hover:bg-neutral-50"
          >
            Timeline
          </Link>
          <label className="text-sm text-neutral-600">Filter</label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm"
            disabled={loading}
          >
            <option value="ALL">All</option>
            {/* Prefer a stable, known list, but also show anything else that appears */}
            {Object.keys(TYPE_LABELS).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
            {availableTypes
              .filter((t) => !(t in TYPE_LABELS))
              .map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
          </select>

          <button
            type="button"
            onClick={() => void fetchFirstPage()}
            disabled={loading || loadingMore || saving}
            className="h-10 rounded-md border border-neutral-300 bg-white px-4 text-sm disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="mb-4 rounded-md border border-neutral-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-neutral-900">Add note</h2>
          {saving ? <span className="text-xs text-neutral-500">Saving…</span> : null}
        </div>

        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="Write a note that will appear in the activity timeline…"
          className="mt-3 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          rows={3}
          disabled={saving || loading || viewerBlocked}
        />

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => void addNote()}
            disabled={saving || loading || viewerBlocked || noteText.trim().length === 0}
            className="h-10 rounded-md bg-black px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            Add note
          </button>
        </div>
      </section>

      {loading ? (
        <div className="rounded-md border border-neutral-200 bg-white p-4 text-sm text-neutral-600">
          Loading…
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-md border border-neutral-200 bg-white p-4 text-sm text-neutral-600">
          No activity yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-neutral-200 bg-white">
          <div className="divide-y divide-neutral-200">
            {events.map((ev) => {
              const label = TYPE_LABELS[ev.type] ?? ev.type;
              const when = formatWhen(ev.createdAt ?? undefined);
              const href = buildEventHref(estateId, ev);

              return (
                <div key={ev.id} className="px-4 py-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-neutral-900">{label}</div>
                      <div className="mt-0.5 text-sm text-neutral-700">{ev.summary}</div>
                    </div>

                    <div className="flex items-center gap-3">
                      {href ? (
                        <Link
                          href={href}
                          className="text-xs font-medium text-blue-600 hover:underline"
                        >
                          Open
                        </Link>
                      ) : null}
                      {when ? (
                        <div className="shrink-0 text-xs text-neutral-500">{when}</div>
                      ) : null}
                    </div>
                  </div>

                  {ev.detail ? (
                    <div className="mt-2 text-sm text-neutral-600">{ev.detail}</div>
                  ) : null}

                  {ev.meta && Object.keys(ev.meta).length > 0 ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-neutral-500">
                        Details
                      </summary>
                      <pre className="mt-2 overflow-auto rounded-md bg-neutral-50 p-3 text-xs text-neutral-700">
                        {JSON.stringify(ev.meta, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4 flex justify-center">
        {nextCursor ? (
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loading || loadingMore || saving}
            className="h-10 rounded-md bg-black px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        ) : events.length > 0 && !loading ? (
          <div className="text-sm text-neutral-500">End of activity</div>
        ) : null}
      </div>
    </div>
  );
}