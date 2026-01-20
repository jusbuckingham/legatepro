"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { EstateReadinessResult } from "@/lib/estate/readiness";

type ReadinessApiResponse =
  | { ok: true; readiness: EstateReadinessResult }
  | { ok: true; result: EstateReadinessResult } // fallback if your route uses `result`
  | { ok: false; error?: string };

const MODULES: Array<{
  key: keyof EstateReadinessResult["breakdown"];
  label: string;
}> = [
  { key: "documents", label: "Documents" },
  { key: "tasks", label: "Tasks" },
  { key: "properties", label: "Properties" },
  { key: "contacts", label: "Contacts" },
  { key: "finances", label: "Finances" },
];

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function scoreTone(score: number) {
  if (score >= 85) return "text-emerald-700";
  if (score >= 65) return "text-amber-700";
  return "text-rose-700";
}

function toTimeLabel(date: Date | null) {
  if (!date) return "—";
  try {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function actionHrefForSignal(estateId: string, signalKey: string): string {
  const key = signalKey.toLowerCase();

  // Heuristic: if the signal key suggests something is missing, try to jump to the “add” section.
  const looksMissing =
    key.startsWith("missing") ||
    key.includes("missing_") ||
    key.includes("_missing") ||
    key.includes("no_") ||
    key.includes("none_") ||
    key.includes("empty_") ||
    key.includes("requires_") ||
    key.includes("need_");

  const estateBase = `/app/estates/${encodeURIComponent(estateId)}`;

  // Documents
  if (key.includes("document") || key.startsWith("docs") || key.startsWith("documents")) {
    return looksMissing ? `${estateBase}/documents#add-document` : `${estateBase}/documents`;
  }

  // Tasks
  if (key.includes("task") || key.startsWith("tasks")) {
    return looksMissing ? `${estateBase}/tasks#add-task` : `${estateBase}/tasks`;
  }

  // Properties
  if (key.includes("property") || key.startsWith("properties")) {
    return looksMissing ? `${estateBase}/properties#add-property` : `${estateBase}/properties`;
  }

  // Contacts
  if (key.includes("contact") || key.startsWith("contacts")) {
    return looksMissing ? `${estateBase}/contacts#add-contact` : `${estateBase}/contacts`;
  }

  // Finances (Invoices / Expenses)
  if (key.includes("invoice")) {
    return looksMissing ? `${estateBase}/invoices#add-invoice` : `${estateBase}/invoices`;
  }

  if (key.includes("expense")) {
    // Expenses are indexed on the invoices page; anchor to the expense section.
    return `${estateBase}/invoices#add-expense`;
  }

  if (key.includes("finance") || key.startsWith("finances")) {
    return looksMissing ? `${estateBase}/invoices#add-invoice` : `${estateBase}/invoices`;
  }

  // Default: documents is usually the fastest way to move readiness forward.
  return looksMissing ? `${estateBase}/documents#add-document` : `${estateBase}/documents`;
}

export default function EstateReadinessCardClient(props: { estateId: string }) {
  const { estateId } = props;

  const [loading, setLoading] = useState(true);
  const [readiness, setReadiness] = useState<EstateReadinessResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const endpoint = useMemo(
    () => `/api/estates/${encodeURIComponent(estateId)}/readiness`,
    [estateId],
  );

  const loadReadiness = useCallback(
    async (opts?: { silent?: boolean; signal?: AbortSignal }) => {
      const silent = opts?.silent ?? false;

      if (!silent) setLoading(true);
      setIsRefreshing(silent);
      setError(null);

      try {
        const res = await fetch(endpoint, {
          method: "GET",
          headers: { accept: "application/json" },
          cache: "no-store",
          signal: opts?.signal,
        });

        const data = (await res.json()) as ReadinessApiResponse;

        const isOk = (
          payload: ReadinessApiResponse,
        ): payload is
          | { ok: true; readiness: EstateReadinessResult }
          | { ok: true; result: EstateReadinessResult } => {
          return typeof payload === "object" && payload !== null && "ok" in payload && payload.ok === true;
        };

        if (!res.ok || !isOk(data)) {
          setReadiness(null);

          // Safely extract an error string when present
          if (
            data &&
            typeof data === "object" &&
            "ok" in data &&
            (data as { ok: boolean }).ok === false &&
            "error" in data
          ) {
            const errVal = (data as { ok: false; error?: string }).error;
            setError(errVal ?? "readiness_unavailable");
          } else {
            setError("readiness_unavailable");
          }

          return;
        }

        const r = "readiness" in data ? data.readiness : "result" in data ? data.result : null;
        setReadiness(r ?? null);
        setLastUpdatedAt(new Date());
      } catch (e) {
        // Abort is expected on unmount
        if (e instanceof DOMException && e.name === "AbortError") return;

        setReadiness(null);
        setError(e instanceof Error ? e.message : "readiness_unavailable");
      } finally {
        if (!silent) setLoading(false);
        setIsRefreshing(false);
      }
    },
    [endpoint],
  );

  useEffect(() => {
    const controller = new AbortController();

    void loadReadiness({ silent: false, signal: controller.signal });

    const onFocus = () => {
      // Silent refresh on focus (premium feel)
      void loadReadiness({ silent: true });
    };

    window.addEventListener("focus", onFocus);

    return () => {
      controller.abort();
      window.removeEventListener("focus", onFocus);
    };
  }, [loadReadiness]);

  // Skeleton
  if (loading) {
    return (
      <section className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="h-4 w-40 animate-pulse rounded bg-gray-200" />
            <div className="mt-2 h-3 w-80 max-w-full animate-pulse rounded bg-gray-100" />
            <div className="mt-4 space-y-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="grid grid-cols-[90px_1fr_42px] items-center gap-2">
                  <div className="h-3 w-20 animate-pulse rounded bg-gray-100" />
                  <div className="h-2 w-full animate-pulse rounded-full bg-gray-100" />
                  <div className="h-3 w-10 animate-pulse rounded bg-gray-100" />
                </div>
              ))}
            </div>
          </div>
          <div className="h-10 w-20 animate-pulse rounded bg-gray-200" />
        </div>
      </section>
    );
  }

  // Unavailable
  if (!readiness) {
    return (
      <section className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Estate readiness</h2>
            <p className="mt-1 text-xs text-gray-500">
              Readiness could not be calculated{error ? ` (${error})` : ""}. Refresh or try again.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void loadReadiness({ silent: false })}
              className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
              disabled={loading}
              aria-busy={loading}
              title="Refresh readiness"
            >
              Refresh
            </button>

            <Link
              href={`/app/estates/${encodeURIComponent(estateId)}/documents`}
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              Improve readiness →
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const score = clamp(Math.round(readiness.score), 0, 100);

  return (
    <section className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-900">Estate readiness</h2>
            <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-700">
              {readiness.signals.atRisk.length} risk
              {readiness.signals.atRisk.length === 1 ? "" : "s"} •{" "}
              {readiness.signals.missing.length} missing
            </span>
          </div>

          <p className="mt-1 text-xs text-gray-500">
            A quick completeness signal across documents, tasks, properties, contacts, and finances.
          </p>

          <div className="mt-3 grid gap-2">
            {MODULES.map(({ key, label }) => {
              const item = readiness.breakdown[key];
              const pct =
                item.max > 0
                  ? clamp(Math.round((item.score / item.max) * 100), 0, 100)
                  : 0;

              return (
                <div key={key} className="grid grid-cols-[90px_1fr_42px] items-center gap-2">
                  <div className="text-[11px] text-gray-700">{label}</div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-blue-600" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-right text-[11px] text-gray-500">{pct}%</div>
                </div>
              );
            })}
          </div>

          {/* Top actions */}
          {(readiness.signals.missing.length > 0 || readiness.signals.atRisk.length > 0) && (
            <div className="mt-4 rounded-md border border-gray-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-semibold uppercase text-gray-600">Top actions</div>
                <span className="text-[11px] text-gray-500">Based on missing + at-risk signals</span>
              </div>

              <ul className="mt-2 space-y-2">
                {[
                  ...readiness.signals.missing
                    .slice(0, 3)
                    .map((s) => ({ ...s, kind: "missing" as const })),
                  ...readiness.signals.atRisk
                    .slice(0, 2)
                    .map((s) => ({ ...s, kind: "risk" as const })),
                ].map((s) => (
                  <li
                    key={`${s.kind}:${s.key}`}
                    className="flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            s.kind === "missing"
                              ? "inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700"
                              : "inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800"
                          }
                        >
                          {s.kind === "missing" ? "Missing" : "At risk"}
                        </span>
                        <span className="truncate text-xs font-medium text-gray-900">{s.label}</span>
                      </div>
                    </div>

                    <Link
                      href={actionHrefForSignal(estateId, s.key)}
                      className="shrink-0 text-xs font-medium text-blue-600 hover:underline"
                    >
                      Fix →
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className={`text-4xl font-semibold leading-none ${scoreTone(score)}`}>
            {score}%
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void loadReadiness({ silent: true })}
              className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
              aria-busy={isRefreshing}
              disabled={isRefreshing}
              title="Refresh readiness"
            >
              {isRefreshing ? "Refreshing…" : "Refresh"}
            </button>

            <span className="text-[11px] text-gray-500">
              Updated: <span className="font-medium text-gray-700">{toTimeLabel(lastUpdatedAt)}</span>
            </span>
          </div>

          <Link
            href={`/app/estates/${encodeURIComponent(estateId)}/documents`}
            className="text-xs font-medium text-blue-600 hover:underline"
          >
            Improve readiness →
          </Link>
        </div>
      </div>

      {(readiness.signals.missing.length > 0 || readiness.signals.atRisk.length > 0) && (
        <details className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3">
          <summary className="cursor-pointer text-xs font-medium text-gray-800">
            Why this score?
            <span className="ml-2 text-[11px] font-normal text-gray-500">
              View missing and at-risk items
            </span>
          </summary>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <div className="text-[11px] font-semibold uppercase text-gray-600">Missing</div>
              {readiness.signals.missing.length === 0 ? (
                <div className="mt-2 text-xs text-gray-500">Nothing missing detected.</div>
              ) : (
                <ul className="mt-2 space-y-1">
                  {readiness.signals.missing.slice(0, 6).map((s) => (
                    <li
                      key={s.key}
                      className={[
                        "rounded-md border px-2 py-1 text-xs",
                        s.severity === "high"
                          ? "border-rose-200 bg-rose-50 text-rose-900"
                          : s.severity === "medium"
                          ? "border-amber-200 bg-amber-50 text-amber-900"
                          : "border-gray-200 bg-white text-gray-800",
                      ].join(" ")}
                    >
                      {s.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <div className="text-[11px] font-semibold uppercase text-gray-600">At risk</div>
              {readiness.signals.atRisk.length === 0 ? (
                <div className="mt-2 text-xs text-gray-500">No risks detected.</div>
              ) : (
                <ul className="mt-2 space-y-1">
                  {readiness.signals.atRisk.slice(0, 6).map((s) => (
                    <li
                      key={s.key}
                      className={[
                        "rounded-md border px-2 py-1 text-xs",
                        s.severity === "high"
                          ? "border-rose-200 bg-rose-50 text-rose-900"
                          : s.severity === "medium"
                          ? "border-amber-200 bg-amber-50 text-amber-900"
                          : "border-gray-200 bg-white text-gray-800",
                      ].join(" ")}
                    >
                      {s.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </details>
      )}
    </section>
  );
}