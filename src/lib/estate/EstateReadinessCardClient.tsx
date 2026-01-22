"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { EstateReadinessResult } from "@/lib/estate/readiness";

type ReadinessApiResponse =
  | { ok: true; readiness: EstateReadinessResult }
  | { ok: true; result: EstateReadinessResult } // fallback if your route uses `result`
  | { ok: false; error?: string };

type ReadinessPlanStep = {
  id: string;
  title: string;
  details?: string;
  href: string;
  kind: "missing" | "risk" | "general";
  severity: "low" | "medium" | "high";
  count?: number;
};

type ReadinessPlan = {
  estateId: string;
  generatedAt: string;
  generator: string;
  steps: ReadinessPlanStep[];
};

type ReadinessPlanApiResponse = { ok: true; plan: ReadinessPlan } | { ok: false; error?: string };

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


const PLAN_TTL_MS = 24 * 60 * 60 * 1000;
const PLAN_SNAPSHOT_STORAGE_PREFIX = "legatepro:readinessPlanSnapshot:";

type PlanStepSnapshot = {
  id: string;
  title: string;
  severity: ReadinessPlanStep["severity"];
  href?: string;
  kind?: ReadinessPlanStep["kind"];
};

type PlanSnapshot = {
  estateId: string;
  generatedAt: string;
  steps: PlanStepSnapshot[];
};

type PlanDiff = {
  hasPrevious: boolean;
  added: PlanStepSnapshot[];
  removed: PlanStepSnapshot[];
  severityChanged: Array<{
    id: string;
    title: string;
    from: ReadinessPlanStep["severity"];
    to: ReadinessPlanStep["severity"];
  }>;
  totalChanges: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

type SignalWithKind =
  | (EstateReadinessResult["signals"]["missing"][number] & { kind: "missing" })
  | (EstateReadinessResult["signals"]["atRisk"][number] & { kind: "risk" });

function severityRankLocal(severity: string): number {
  switch (severity) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function snapshotFromPlan(plan: ReadinessPlan): PlanSnapshot {
  return {
    estateId: plan.estateId,
    generatedAt: plan.generatedAt,
    steps: (plan.steps ?? []).map((s) => ({
      id: s.id,
      title: s.title,
      severity: s.severity,
      href: s.href,
      kind: s.kind,
    })),
  };
}

function diffPlans(current: ReadinessPlan | null, previous: PlanSnapshot | null): PlanDiff {
  if (!current) {
    return {
      hasPrevious: Boolean(previous),
      added: [],
      removed: [],
      severityChanged: [],
      totalChanges: 0,
    };
  }

  const curSteps: PlanStepSnapshot[] = (current.steps ?? []).map((s) => ({
    id: s.id,
    title: s.title,
    severity: s.severity,
  }));

  const prevSteps = previous?.steps ?? [];

  const curMap = new Map(curSteps.map((s) => [s.id, s] as const));
  const prevMap = new Map(prevSteps.map((s) => [s.id, s] as const));

  const added: PlanStepSnapshot[] = [];
  const removed: PlanStepSnapshot[] = [];
  const severityChanged: PlanDiff["severityChanged"] = [];

  for (const [id, cur] of curMap.entries()) {
    const prev = prevMap.get(id);
    if (!prev) {
      added.push(cur);
      continue;
    }
    if (prev.severity !== cur.severity) {
      severityChanged.push({ id, title: cur.title, from: prev.severity, to: cur.severity });
    }
  }

  for (const [id, prev] of prevMap.entries()) {
    if (!curMap.has(id)) removed.push(prev);
  }

  severityChanged.sort(
    (a, b) => severityRankLocal(b.to) - severityRankLocal(a.to) || a.title.localeCompare(b.title),
  );

  added.sort(
    (a, b) =>
      severityRankLocal(b.severity) - severityRankLocal(a.severity) || a.title.localeCompare(b.title),
  );

  removed.sort(
    (a, b) =>
      severityRankLocal(b.severity) - severityRankLocal(a.severity) || a.title.localeCompare(b.title),
  );

  const totalChanges = added.length + removed.length + severityChanged.length;

  return {
    hasPrevious: Boolean(previous),
    added,
    removed,
    severityChanged,
    totalChanges,
  };
}

function rankTopActions(signals: SignalWithKind[]): SignalWithKind[] {
  return [...signals].sort((a, b) => {
    const sev = severityRankLocal(b.severity) - severityRankLocal(a.severity);
    if (sev !== 0) return sev;

    const countA = typeof a.count === "number" ? a.count : 0;
    const countB = typeof b.count === "number" ? b.count : 0;
    const cnt = countB - countA;
    if (cnt !== 0) return cnt;

    // Missing before at-risk when tied.
    if (a.kind !== b.kind) return a.kind === "missing" ? -1 : 1;

    return a.label.localeCompare(b.label);
  });
}

type PlainSignal = EstateReadinessResult["signals"]["missing"][number];

function rankSignals(signals: PlainSignal[]): PlainSignal[] {
  return [...signals].sort((a, b) => {
    const sev = severityRankLocal(b.severity) - severityRankLocal(a.severity);
    if (sev !== 0) return sev;

    const countA = typeof a.count === "number" ? a.count : 0;
    const countB = typeof b.count === "number" ? b.count : 0;
    const cnt = countB - countA;
    if (cnt !== 0) return cnt;

    return a.label.localeCompare(b.label);
  });
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

function toRelativeAgeLabel(from: Date | null, now: Date = new Date()): string {
  if (!from) return "—";
  const ms = now.getTime() - from.getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";

  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;

  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;

  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function actionHrefForPlanStepTitle(estateId: string, title: string): string {
  const t = title.toLowerCase();
  const estateBase = `/app/estates/${encodeURIComponent(estateId)}`;

  if (t.includes("document") || t.includes("upload") || t.includes("will") || t.includes("trust")) {
    return `${estateBase}/documents`;
  }
  if (t.includes("task") || t.includes("checklist") || t.includes("todo")) {
    return `${estateBase}/tasks`;
  }
  if (t.includes("property") || t.includes("home") || t.includes("house") || t.includes("deed")) {
    return `${estateBase}/properties`;
  }
  if (
    t.includes("contact") ||
    t.includes("beneficiar") ||
    t.includes("heir") ||
    t.includes("attorney") ||
    t.includes("lawyer")
  ) {
    return `${estateBase}/contacts`;
  }
  if (
    t.includes("invoice") ||
    t.includes("expense") ||
    t.includes("bill") ||
    t.includes("payment") ||
    t.includes("finance")
  ) {
    return `${estateBase}/invoices`;
  }

  return `${estateBase}/documents`;
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

  const [plan, setPlan] = useState<ReadinessPlan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [isPlanLoading, setIsPlanLoading] = useState(false);
  const [isPlanAutoRefreshing, setIsPlanAutoRefreshing] = useState(false);
  const [previousPlanSnapshot, setPreviousPlanSnapshot] = useState<PlanSnapshot | null>(null);

  const endpoint = useMemo(
    () => `/api/estates/${encodeURIComponent(estateId)}/readiness`,
    [estateId],
  );

  const planEndpoint = useMemo(
    () => `/api/estates/${encodeURIComponent(estateId)}/readiness/plan`,
    [estateId],
  );

  const planSnapshotStorageKey = useMemo(
    () => `${PLAN_SNAPSHOT_STORAGE_PREFIX}${encodeURIComponent(estateId)}`,
    [estateId],
  );

  const didAutoPlanRef = useRef<string | null>(null);
  const didAutoPlanRefreshRef = useRef<string | null>(null);

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
        ): payload is { ok: true; readiness: EstateReadinessResult } | { ok: true; result: EstateReadinessResult } => {
          return (
            typeof payload === "object" &&
            payload !== null &&
            "ok" in payload &&
            payload.ok === true
          );
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

  const loadPlan = useCallback(
    async (opts?: { refresh?: boolean; reason?: "manual" | "auto" }) => {
      setIsPlanLoading(true);
      setIsPlanAutoRefreshing(opts?.reason === "auto");
      setPlanError(null);

      try {
        const res = await fetch(`${planEndpoint}${opts?.refresh ? "?refresh=1" : ""}`, {
          method: "GET",
          headers: { accept: "application/json" },
          cache: "no-store",
        });

        const data = (await res.json()) as ReadinessPlanApiResponse;

        if (!res.ok || !data || typeof data !== "object" || ("ok" in data && data.ok === false)) {
          const errVal =
            data && typeof data === "object" && "error" in data
              ? (data as { ok: false; error?: string }).error
              : undefined;
          setPlan(null);
          setPlanError(errVal ?? "plan_unavailable");
          return;
        }

        if ("plan" in data && data.plan) {
          const nextPlan = data.plan;
          setPlan(nextPlan);

          // Persist snapshot for diffing
          if (typeof window !== "undefined") {
            const existing = safeJsonParse<PlanSnapshot>(window.localStorage.getItem(planSnapshotStorageKey));
            if (existing && existing.estateId === estateId) {
              setPreviousPlanSnapshot(existing);
            }
            window.localStorage.setItem(planSnapshotStorageKey, JSON.stringify(snapshotFromPlan(nextPlan)));
          }
        } else {
          setPlan(null);
          setPlanError("plan_unavailable");
        }
      } catch (e) {
        setPlan(null);
        setPlanError(e instanceof Error ? e.message : "plan_unavailable");
      } finally {
        setIsPlanLoading(false);
        setIsPlanAutoRefreshing(false);
      }
    },
    [planEndpoint, estateId, planSnapshotStorageKey],
  );

  useEffect(() => {
    const controller = new AbortController();

    void loadReadiness({ silent: false, signal: controller.signal });
    setPlan(null);
    setPlanError(null);
    didAutoPlanRef.current = null;

    // Load previous plan snapshot for diffing
    if (typeof window !== "undefined") {
      const stored = safeJsonParse<PlanSnapshot>(window.localStorage.getItem(planSnapshotStorageKey));
      if (stored && stored.estateId === estateId) setPreviousPlanSnapshot(stored);
      else setPreviousPlanSnapshot(null);
    } else {
      setPreviousPlanSnapshot(null);
    }

    const onFocus = () => {
      // Silent refresh on focus (premium feel)
      setPlan(null);
      setPlanError(null);
      void loadReadiness({ silent: true });
    };

    window.addEventListener("focus", onFocus);

    return () => {
      controller.abort();
      window.removeEventListener("focus", onFocus);
    };
  }, [loadReadiness, estateId, planSnapshotStorageKey]);

  const score = clamp(Math.round(readiness?.score ?? 0), 0, 100);

  const topActions = useMemo(() => {
    const missing = (readiness?.signals?.missing ?? []).map((s) => ({
      ...s,
      kind: "missing" as const,
    }));

    const risk = (readiness?.signals?.atRisk ?? []).map((s) => ({
      ...s,
      kind: "risk" as const,
    }));

    return rankTopActions([...missing, ...risk]).slice(0, 5);
  }, [readiness]);

  const rankedMissing = useMemo(
    () => rankSignals(readiness?.signals?.missing ?? []).slice(0, 6),
    [readiness],
  );

  const rankedAtRisk = useMemo(
    () => rankSignals(readiness?.signals?.atRisk ?? []).slice(0, 6),
    [readiness],
  );

  const planLabel = useMemo(() => {
    if (!plan) return null;
    const isRuleBased = plan.generator === "heuristic-v1";
    return {
      text: isRuleBased ? "Rule-based" : "AI",
      title: isRuleBased ? "Generated by rules" : `Generated by: ${plan.generator}`,
      className: isRuleBased
        ? "inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700"
        : "inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800",
    };
  }, [plan]);

  const planGeneratedAt = useMemo(() => {
    if (!plan?.generatedAt) return null;
    const d = new Date(plan.generatedAt);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [plan]);

  const planIsOutdated = useMemo(() => {
    if (!planGeneratedAt) return false;
    if (!lastUpdatedAt) return false;
    return lastUpdatedAt.getTime() > planGeneratedAt.getTime();
  }, [lastUpdatedAt, planGeneratedAt]);

  const planIsStale = useMemo(() => {
    if (!planGeneratedAt) return false;
    return Date.now() - planGeneratedAt.getTime() > PLAN_TTL_MS;
  }, [planGeneratedAt]);

  const planDiff = useMemo(() => diffPlans(plan, previousPlanSnapshot), [plan, previousPlanSnapshot]);

  const planStepChanges = useMemo(() => {
    const added = new Map<string, PlanStepSnapshot>();
    for (const s of planDiff.added) added.set(s.id, s);

    const severityChanged = new Map<
      string,
      { from: ReadinessPlanStep["severity"]; to: ReadinessPlanStep["severity"] }
    >();
    for (const c of planDiff.severityChanged) severityChanged.set(c.id, { from: c.from, to: c.to });

    return { added, severityChanged };
  }, [planDiff.added, planDiff.severityChanged]);

  const severityDeltaLabel = useCallback(
    (from: ReadinessPlanStep["severity"], to: ReadinessPlanStep["severity"]) => {
      const d = severityRankLocal(to) - severityRankLocal(from);
      if (d > 0) return { text: "Severity ↑", tone: "up" as const };
      if (d < 0) return { text: "Severity ↓", tone: "down" as const };
      return { text: "Severity", tone: "same" as const };
    },
    [],
  );

  useEffect(() => {
    if (loading) return;
    if (!readiness) return;
    if (isPlanLoading) return;
    if (plan) return;

    // Only run once per estateId unless user explicitly regenerates.
    if (didAutoPlanRef.current === estateId) return;

    didAutoPlanRef.current = estateId;
    void loadPlan({ reason: "auto" });
  }, [estateId, loading, readiness, plan, isPlanLoading, loadPlan]);

  useEffect(() => {
    if (!plan) return;
    if (!planIsStale) return;
    if (isPlanLoading) return;

    // Only auto-refresh once per stale plan version.
    const key = `${estateId}:${plan.generatedAt}`;
    if (didAutoPlanRefreshRef.current === key) return;
    didAutoPlanRefreshRef.current = key;

    const run = () => {
      void loadPlan({ refresh: true, reason: "auto" });
    };

    // Prefer idle time; fallback to a short timeout.
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const ric = (
        window as unknown as {
          requestIdleCallback: (cb: () => void, opts?: { timeout?: number }) => number;
        }
      ).requestIdleCallback;
      const cancel = (window as unknown as { cancelIdleCallback?: (id: number) => void })
        .cancelIdleCallback;
      const id = ric(run, { timeout: 2000 });
      return () => {
        if (cancel) cancel(id);
      };
    }

    const t = globalThis.setTimeout(run, 1200);
    return () => globalThis.clearTimeout(t);
  }, [estateId, plan, planIsStale, isPlanLoading, loadPlan]);

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
              const pct = item.max > 0 ? clamp(Math.round((item.score / item.max) * 100), 0, 100) : 0;

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
          {topActions.length > 0 && (
            <div className="mt-4 rounded-md border border-gray-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-semibold uppercase text-gray-600">Top actions</div>
                <span className="text-[11px] text-gray-500">Based on missing + at-risk signals</span>
              </div>

              <ul className="mt-2 space-y-2">
                {topActions.map((s) => (
                  <li key={`${s.kind}:${s.key}`} className="flex items-start justify-between gap-3">
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

                        <div className="flex min-w-0 items-center gap-2">
                          <span className="min-w-0 truncate text-xs font-medium text-gray-900">{s.label}</span>
                          {typeof s.count === "number" && s.count > 1 ? (
                            <span className="inline-flex shrink-0 items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
                              {s.count}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {s.reason ? (
                        <div className="mt-0.5 truncate text-[11px] text-gray-500" title={s.reason}>
                          {s.reason}
                        </div>
                      ) : null}
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

          {/* Next steps (Copilot) */}
          <div className="mt-3 rounded-md border border-gray-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="text-[11px] font-semibold uppercase text-gray-600">Next steps</div>
                {planLabel ? (
                  <span className={planLabel.className} title={planLabel.title}>
                    {planLabel.text}
                  </span>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => void loadPlan({ refresh: Boolean(plan), reason: "manual" })}
                className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
                aria-busy={isPlanLoading}
                disabled={isPlanLoading}
                title={plan ? "Regenerate plan (forces refresh)" : "Generate a 5-step plan"}
              >
                {isPlanLoading ? "Generating…" : plan ? "Regenerate" : "Generate"}
              </button>
            </div>

            {planError ? (
              <div className="mt-2 text-xs text-rose-700">
                Could not generate plan{planError ? ` (${planError})` : ""}.
              </div>
            ) : null}

            {!plan ? (
              <div className="mt-2 text-xs text-gray-500">
                Get a short, prioritized checklist based on your current readiness signals.
              </div>
            ) : plan.steps.length === 0 ? (
              <div className="mt-2 text-xs text-gray-500">No next steps available.</div>
            ) : (
              <ul className="mt-2 space-y-2">
                {plan.steps.map((step) => (
                  <li
                    key={step.id}
                    className={[
                      "flex items-start justify-between gap-3 rounded-md p-1",
                      planStepChanges.added.has(step.id)
                        ? "bg-slate-50"
                        : planStepChanges.severityChanged.has(step.id)
                        ? "bg-amber-50"
                        : "",
                    ].join(" ")}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            step.kind === "missing"
                              ? "inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700"
                              : step.kind === "risk"
                              ? "inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800"
                              : "inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800"
                          }
                        >
                          {step.kind === "missing"
                            ? "Missing"
                            : step.kind === "risk"
                            ? "At risk"
                            : "General"}
                        </span>

                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="min-w-0 truncate text-xs font-medium text-gray-900">
                            {step.title}
                          </span>

                          {planStepChanges.added.has(step.id) ? (
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                              New
                            </span>
                          ) : null}

                          {planStepChanges.severityChanged.has(step.id) ? (() => {
                            const ch = planStepChanges.severityChanged.get(step.id);
                            if (!ch) return null;
                            const meta = severityDeltaLabel(ch.from, ch.to);
                            const cls =
                              meta.tone === "up"
                                ? "inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-800"
                                : meta.tone === "down"
                                ? "inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800"
                                : "inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700";
                            return (
                              <span
                                className={cls}
                                title={`Severity changed: ${ch.from} → ${ch.to}`}
                              >
                                {meta.text}
                              </span>
                            );
                          })() : null}

                          {typeof step.count === "number" && step.count > 1 ? (
                            <span className="inline-flex shrink-0 items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
                              {step.count}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {step.details ? (
                        <details className="mt-1" open={step.severity === "high"}>
                          <summary className="cursor-pointer text-[11px] font-medium text-blue-600 hover:underline">
                            Why this step?
                          </summary>

                          <div className="mt-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-[11px] text-gray-700">
                            <div className="whitespace-pre-wrap">{step.details}</div>

                            <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-gray-500">
                              <span>
                                Severity:{" "}
                                <span className="font-medium text-gray-700">{step.severity}</span>
                              </span>
                              <span>
                                Type: <span className="font-medium text-gray-700">{step.kind}</span>
                              </span>
                            </div>
                          </div>
                        </details>
                      ) : null}
                    </div>

                    <Link
                      href={step.href}
                      className="shrink-0 text-xs font-medium text-blue-600 hover:underline"
                    >
                      Go →
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {/* Resolved items since last plan */}
            {planDiff.hasPrevious && planDiff.removed.length > 0 ? (
              <details className="mt-2 rounded-md border border-gray-200 bg-gray-50 p-2">
                <summary className="cursor-pointer text-[11px] font-medium text-gray-700">
                  Resolved since last plan
                  <span className="ml-2 font-normal text-gray-500">({planDiff.removed.length})</span>
                </summary>

                <ul className="mt-2 space-y-1">
                  {planDiff.removed.slice(0, 5).map((s) => {
                    const href = s.href ?? actionHrefForPlanStepTitle(estateId, s.title);
                    return (
                      <li key={s.id} className="flex items-start justify-between gap-2">
                        <Link href={href} className="text-[11px] text-gray-800 hover:underline">
                          <span className="font-medium">{s.title}</span>
                          <span className="ml-1 text-gray-500">({s.severity})</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>

                {planDiff.removed.length > 5 ? (
                  <div className="mt-2 text-[11px] text-gray-500">Showing top 5 resolved items.</div>
                ) : null}
              </details>
            ) : null}

            {plan ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                <span title={planGeneratedAt ? planGeneratedAt.toLocaleString() : plan.generatedAt}>
                  Generated:{" "}
                  <span className="font-medium text-gray-700">
                    {toRelativeAgeLabel(planGeneratedAt)}
                  </span>
                </span>

                {planIsOutdated ? (
                  <span
                    className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800"
                    title="Readiness changed since this plan was generated. Regenerate to refresh next steps."
                  >
                    Plan may be outdated
                  </span>
                ) : null}

                {planIsStale ? (
                  <span
                    className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800"
                    title="This plan is older than 24 hours. The server will refresh it automatically soon, but you can regenerate now."
                  >
                    {isPlanAutoRefreshing ? "Refreshing plan…" : "Plan is stale"}
                  </span>
                ) : null}

                {planDiff.hasPrevious && planDiff.totalChanges > 0 ? (
                  <span
                    className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700"
                    title="Compared to your previous plan"
                  >
                    {planDiff.totalChanges} change{planDiff.totalChanges === 1 ? "" : "s"} since last plan
                  </span>
                ) : null}
              </div>
            ) : null}

            {planDiff.hasPrevious && planDiff.totalChanges > 0 ? (
              <details className="mt-2 rounded-md border border-gray-200 bg-gray-50 p-2">
                <summary className="cursor-pointer text-[11px] font-medium text-gray-700">
                  What changed?
                  <span className="ml-2 font-normal text-gray-500">
                    {planDiff.added.length} new, {planDiff.severityChanged.length} severity update
                    {planDiff.severityChanged.length === 1 ? "" : "s"}, {planDiff.removed.length} resolved
                  </span>
                </summary>

                <div className="mt-2 space-y-2 text-[11px] text-gray-700">
                  {planDiff.added.length > 0 ? (
                    <div>
                      <div className="font-semibold text-gray-800">New</div>
                      <ul className="mt-1 list-disc space-y-0.5 pl-5">
                        {planDiff.added.slice(0, 5).map((s) => (
                          <li key={s.id}>
                            <span className="font-medium">{s.title}</span>
                            <span className="ml-1 text-gray-500">({s.severity})</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {planDiff.severityChanged.length > 0 ? (
                    <div>
                      <div className="font-semibold text-gray-800">Severity changes</div>
                      <ul className="mt-1 list-disc space-y-0.5 pl-5">
                        {planDiff.severityChanged.slice(0, 5).map((c) => (
                          <li key={c.id}>
                            <span className="font-medium">{c.title}</span>
                            <span className="ml-1 text-gray-500">
                              ({c.from} → {c.to})
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {planDiff.removed.length > 0 ? (
                    <div>
                      <div className="font-semibold text-gray-800">Resolved</div>
                      <ul className="mt-1 list-disc space-y-0.5 pl-5">
                        {planDiff.removed.slice(0, 5).map((s) => (
                          <li key={s.id}>
                            <span className="font-medium">{s.title}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {planDiff.added.length > 5 || planDiff.severityChanged.length > 5 || planDiff.removed.length > 5 ? (
                    <div className="text-gray-500">Showing top 5 per section.</div>
                  ) : null}
                </div>
              </details>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className={`text-4xl font-semibold leading-none ${scoreTone(score)}`}>{score}%</div>

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
              Updated:{" "}
              <span className="font-medium text-gray-700">{toTimeLabel(lastUpdatedAt)}</span>
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
                  {rankedMissing.map((s) => (
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
                      <div className="flex items-start justify-between gap-2">
                        <span>{s.label}</span>
                        {typeof s.count === "number" && s.count > 1 ? (
                          <span className="inline-flex shrink-0 items-center rounded-full bg-white/60 px-2 py-0.5 text-[11px] font-medium">
                            {s.count}
                          </span>
                        ) : null}
                      </div>
                      {s.reason ? (
                        <div className="mt-0.5 text-[11px] opacity-80" title={s.reason}>
                          {s.reason}
                        </div>
                      ) : null}
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
                  {rankedAtRisk.map((s) => (
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
                      <div className="flex items-start justify-between gap-2">
                        <span>{s.label}</span>
                        {typeof s.count === "number" && s.count > 1 ? (
                          <span className="inline-flex shrink-0 items-center rounded-full bg-white/60 px-2 py-0.5 text-[11px] font-medium">
                            {s.count}
                          </span>
                        ) : null}
                      </div>
                      {s.reason ? (
                        <div className="mt-0.5 text-[11px] opacity-80" title={s.reason}>
                          {s.reason}
                        </div>
                      ) : null}
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