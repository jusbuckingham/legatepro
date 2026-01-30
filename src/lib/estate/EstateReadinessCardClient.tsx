"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { EstateReadinessResult } from "@/lib/estate/readiness";
import {
  diffPlans,
  snapshotFromPlan,
  type PlanSnapshot,
  type PlanStepSnapshot,
} from "@/lib/estate/readinessPlanDiff";

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
  impact?: {
    estimatedScoreDelta?: number;
    affectedSignals?: number;
    confidence?: "low" | "medium" | "high";
  };
};

type ReadinessPlan = {
  estateId: string;
  generatedAt: string;
  generator: string;
  steps: ReadinessPlanStep[];
};


type ModuleKey = "documents" | "tasks" | "properties" | "contacts" | "invoices";

const JSON_HEADERS = { accept: "application/json" } as const;

type ReadinessPlanApiResponse =
  | { ok: true; plan: ReadinessPlan }
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

const PLAN_TTL_MS = 24 * 60 * 60 * 1000;
const PLAN_SNAPSHOT_STORAGE_PREFIX = "legatepro:readinessPlanSnapshot:";
const PLAN_HISTORY_STORAGE_PREFIX = "legatepro:readinessPlanHistory:";
const MAX_PLAN_HISTORY = 5;

type PlanHistory = PlanSnapshot[];

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

function moduleFromHref(href: string | undefined | null): ModuleKey | null {
  if (!href) return null;
  if (href.includes("/documents")) return "documents";
  if (href.includes("/tasks")) return "tasks";
  if (href.includes("/properties")) return "properties";
  if (href.includes("/contacts")) return "contacts";
  if (href.includes("/invoices")) return "invoices";
  return null;
}

function moduleFromText(title: string): ModuleKey | null {
  const t = title.toLowerCase();
  if (
    t.includes("document") ||
    t.includes("upload") ||
    t.includes("will") ||
    t.includes("trust")
  )
    return "documents";
  if (
    t.includes("task") ||
    t.includes("checklist") ||
    t.includes("todo")
  )
    return "tasks";
  if (
    t.includes("property") ||
    t.includes("home") ||
    t.includes("house") ||
    t.includes("deed")
  )
    return "properties";
  if (
    t.includes("contact") ||
    t.includes("beneficiar") ||
    t.includes("heir") ||
    t.includes("attorney") ||
    t.includes("lawyer")
  )
    return "contacts";
  if (
    t.includes("invoice") ||
    t.includes("expense") ||
    t.includes("bill") ||
    t.includes("payment") ||
    t.includes("finance")
  )
    return "invoices";
  return null;
}

function resolvedHrefForPlanStep(
  estateId: string,
  href: string | undefined | null,
  title: string
): string {
  if (href && typeof href === "string" && href.trim().length > 0) return href;
  // Fallback: reuse the existing signal routing heuristic.
  // Using title text is still better than defaulting to documents for everything.
  return actionHrefForSignal(estateId, title);
}

function ctaLabelForStep(step: Pick<ReadinessPlanStep, "kind">): string {
  if (step.kind === "missing") return "Add →";
  if (step.kind === "risk") return "Review →";
  return "Open →";
}

function fallbackDetailsForStep(step: Pick<ReadinessPlanStep, "kind" | "severity" | "count" | "href" | "title">): string {
  const moduleKey = moduleFromHref(step.href) ?? moduleFromText(step.title);

  const kindPhrase =
    step.kind === "missing"
      ? "This is missing"
      : step.kind === "risk"
      ? "This is at risk"
      : "This is a general improvement";

  const severityPhrase =
    step.severity === "high"
      ? "High severity means it’s likely blocking progress or creating risk."
      : step.severity === "medium"
      ? "Medium severity means it’s worth addressing soon."
      : "Low severity means it’s a smaller, quick win.";

  const countPhrase =
    typeof step.count === "number" && step.count > 1
      ? `It appears to affect about ${step.count} items.`
      : typeof step.count === "number" && step.count === 1
      ? "It appears to affect about 1 item."
      : "";

  const modulePhrase =
    moduleKey === "documents"
      ? "You can usually resolve this in Documents."
      : moduleKey === "tasks"
      ? "You can usually resolve this in Tasks."
      : moduleKey === "properties"
      ? "You can usually resolve this in Properties."
      : moduleKey === "contacts"
      ? "You can usually resolve this in Contacts."
      : moduleKey === "invoices"
      ? "You can usually resolve this in Invoices/Expenses."
      : "";

  return [kindPhrase + ".", severityPhrase, countPhrase, modulePhrase].filter(Boolean).join(" ");
}

function confidenceLegendItem(conf: "high" | "medium" | "low") {
  if (conf === "high") {
    return { icon: "▲", label: "High", detail: "Multiple signals" };
  }
  if (conf === "medium") {
    return { icon: "●", label: "Medium", detail: "Limited signals" };
  }
  return { icon: "○", label: "Low", detail: "Heuristic estimate" };
}

function ConfidenceLegend() {
  const items: Array<"high" | "medium" | "low"> = ["high", "medium", "low"];

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
      <span className="font-medium text-gray-600">Confidence:</span>
      {items.map((c) => {
        const meta = confidenceLegendItem(c);
        return (
          <span
            key={c}
            className="inline-flex items-center gap-1"
            title={`${meta.label} confidence. ${meta.detail}.`}
          >
            <span aria-hidden>{meta.icon}</span>
            <span>
              {meta.label}
              <span className="text-gray-400"> — {meta.detail}</span>
            </span>
          </span>
        );
      })}
    </div>
  );
}

function isAllResolved(readiness: EstateReadinessResult | null): boolean {
  if (!readiness) return false;
  const missing = readiness.signals?.missing?.length ?? 0;
  const risk = readiness.signals?.atRisk?.length ?? 0;
  return missing === 0 && risk === 0;
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
  const [showAllResolved, setShowAllResolved] = useState(false);
  const [showPlanChanges, setShowPlanChanges] = useState(false);
  const [showPlanCompare, setShowPlanCompare] = useState(false);
  const [planCompareTab, setPlanCompareTab] = useState<"summary" | "details">("summary");

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

  const planHistoryStorageKey = useMemo(
    () => `${PLAN_HISTORY_STORAGE_PREFIX}${encodeURIComponent(estateId)}`,
    [estateId],
  );

  const didAutoPlanRef = useRef<string | null>(null);
  const didAutoPlanRefreshRef = useRef<string | null>(null);
  const didAutoPlanOutdatedRefreshRef = useRef<string | null>(null);
  const latestPlanRef = useRef<ReadinessPlan | null>(null);
  const latestIsPlanLoadingRef = useRef(false);
  const latestPlanIsOutdatedRef = useRef(false);

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

  // Keep latestPlanRef, latestIsPlanLoadingRef, latestPlanIsOutdatedRef in sync with state
  useEffect(() => {
    latestPlanRef.current = plan;
  }, [plan]);

  useEffect(() => {
    latestIsPlanLoadingRef.current = isPlanLoading;
  }, [isPlanLoading]);

  useEffect(() => {
    latestPlanIsOutdatedRef.current = planIsOutdated;
  }, [planIsOutdated]);

  const loadReadiness = useCallback(
    async (opts?: { silent?: boolean; signal?: AbortSignal }) => {
      const silent = opts?.silent ?? false;

      if (!silent) setLoading(true);
      setIsRefreshing(silent);
      setError(null);

      try {
        const res = await fetch(endpoint, {
          method: "GET",
          headers: JSON_HEADERS,
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
      setShowAllResolved(false);

      try {
        const res = await fetch(`${planEndpoint}${opts?.refresh ? "?refresh=1" : ""}`, {
          method: "GET",
          headers: JSON_HEADERS,
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

          // Persist snapshot + a small rolling history for diffing / future UX.
          // IMPORTANT: capture the *previous* snapshot BEFORE we overwrite storage.
          if (typeof window !== "undefined") {
            const nextSnap = snapshotFromPlan(nextPlan);

            // Prefer history[0] as the previous snapshot when available.
            const existingHistory = safeJsonParse<PlanHistory>(
              window.localStorage.getItem(planHistoryStorageKey),
            );
            const prevFromHistory = Array.isArray(existingHistory)
              ? existingHistory.find((h) => h && h.estateId === estateId)
              : null;

            const existingLatest = safeJsonParse<PlanSnapshot>(
              window.localStorage.getItem(planSnapshotStorageKey),
            );

            const prev =
              prevFromHistory && prevFromHistory.estateId === estateId
                ? prevFromHistory
                : existingLatest && existingLatest.estateId === estateId
                  ? existingLatest
                  : null;

            setPreviousPlanSnapshot(prev);

            // Update latest snapshot
            window.localStorage.setItem(planSnapshotStorageKey, JSON.stringify(nextSnap));

            // Update rolling history (dedupe by generatedAt)
            const historyBase = Array.isArray(existingHistory) ? existingHistory : [];
            const normalized = historyBase.filter(
              (h) => h && h.estateId === estateId && typeof h.generatedAt === "string",
            );

            const merged = [nextSnap, ...normalized].filter(
              (snap, idx, arr) =>
                arr.findIndex(
                  (x) => x.generatedAt === snap.generatedAt && x.estateId === snap.estateId,
                ) === idx,
            );

            const trimmed = merged.slice(0, MAX_PLAN_HISTORY);
            window.localStorage.setItem(planHistoryStorageKey, JSON.stringify(trimmed));
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
    [planEndpoint, estateId, planSnapshotStorageKey, planHistoryStorageKey],
  );

  useEffect(() => {
    const controller = new AbortController();

    void loadReadiness({ silent: false, signal: controller.signal });

    // Reset plan state on estate switch
    setPlan(null);
    setPlanError(null);
    didAutoPlanRef.current = null;
    didAutoPlanOutdatedRefreshRef.current = null;

    // Load previous plan snapshot for diffing (prefer history[0])
    if (typeof window !== "undefined") {
      const history = safeJsonParse<PlanHistory>(window.localStorage.getItem(planHistoryStorageKey));
      const prevFromHistory = Array.isArray(history)
        ? history.find((h) => h && h.estateId === estateId)
        : null;

      if (prevFromHistory && prevFromHistory.estateId === estateId) {
        setPreviousPlanSnapshot(prevFromHistory);
      } else {
        const stored = safeJsonParse<PlanSnapshot>(window.localStorage.getItem(planSnapshotStorageKey));
        if (stored && stored.estateId === estateId) setPreviousPlanSnapshot(stored);
        else setPreviousPlanSnapshot(null);
      }
    } else {
      setPreviousPlanSnapshot(null);
    }

    return () => {
      controller.abort();
    };
  }, [loadReadiness, estateId, planSnapshotStorageKey, planHistoryStorageKey]);

  useEffect(() => {
    const onFocus = () => {
      // Silent refresh on focus (premium feel)
      void loadReadiness({ silent: true });

      // If a plan is already on-screen, quietly refresh it if readiness changed.
      // Read from refs to avoid re-binding this handler on every render.
      const currentPlan = latestPlanRef.current;
      if (currentPlan && !latestIsPlanLoadingRef.current && latestPlanIsOutdatedRef.current) {
        void loadPlan({ refresh: true, reason: "auto" });
      }
    };

    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
    };
  }, [loadReadiness, loadPlan]);

  const score = clamp(Math.round(readiness?.score ?? 0), 0, 100);

  const allResolved = useMemo(() => isAllResolved(readiness), [readiness]);

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

  const preferredPlanModules = useMemo(() => {
    // Use topActions as the signal for “what to do next”.
    // Convert each signal key into a module by reusing the same routing heuristic.
    const order: ModuleKey[] = [];

    for (const s of topActions) {
      const href = actionHrefForSignal(estateId, s.key);
      const mod = moduleFromHref(href);
      if (mod && !order.includes(mod)) order.push(mod);
    }

    return order;
  }, [topActions, estateId]);

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



  const planDiff = useMemo(() => diffPlans(plan, previousPlanSnapshot), [plan, previousPlanSnapshot]);

  useEffect(() => {
    if (!showPlanCompare) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowPlanCompare(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showPlanCompare]);

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

  const changeExplanationForStep = useCallback(
    (step: ReadinessPlanStep): string | null => {
      const isNew = planStepChanges.added.has(step.id);
      const ch = planStepChanges.severityChanged.get(step.id);

      if (!isNew && !ch) return null;

      const kindLabel =
        step.kind === "missing" ? "missing item" : step.kind === "risk" ? "risk" : "step";

      if (isNew) {
        return `This ${kindLabel} appeared since your last plan based on your latest readiness signals.`;
      }

      if (ch) {
        const delta = severityRankLocal(ch.to) - severityRankLocal(ch.from);
        if (delta > 0) {
          return `This ${kindLabel} became more urgent since your last plan (severity ${ch.from} → ${ch.to}).`;
        }
        if (delta < 0) {
          return `This ${kindLabel} became less urgent since your last plan (severity ${ch.from} → ${ch.to}).`;
        }
        return `This ${kindLabel} changed since your last plan.`;
      }

      return null;
    },
    [planStepChanges.added, planStepChanges.severityChanged],
  );

  // --- Impact estimation logic ---
  const estimateImpactForStep = useCallback(
    (
      step: ReadinessPlanStep,
      opts: {
        isNew: boolean;
        severityDeltaUp: number;
        preferredModuleIndex: number; // -1 if not preferred
      },
    ): { estimatedScoreDelta: number; affectedSignals?: number; confidence: "low" | "medium" | "high" } => {
      // Base impact by severity
      const base =
        step.severity === "high" ? 8 : step.severity === "medium" ? 5 : 3;

      // Missing tends to unblock more than risk, general is usually a smaller bump.
      const kindBoost = step.kind === "missing" ? 2 : step.kind === "risk" ? 1 : 0;

      // Count bonus (bounded)
      const c = typeof step.count === "number" ? step.count : 0;
      const countBoost = c >= 10 ? 3 : c >= 5 ? 2 : c >= 2 ? 1 : 0;

      // Preferred module boost (earlier preferred modules get a slightly higher bump)
      const preferredBoost = opts.preferredModuleIndex >= 0 ? Math.max(0, 2 - opts.preferredModuleIndex) : 0;

      // New + severity delta up get a tiny nudge
      const noveltyBoost = opts.isNew ? 1 : 0;
      const deltaBoost = opts.severityDeltaUp > 0 ? 1 : 0;

      // Total (bounded)
      const raw = base + kindBoost + countBoost + preferredBoost + noveltyBoost + deltaBoost;
      const estimatedScoreDelta = clamp(Math.round(raw), 1, 15);

      // Confidence: higher when we have count and when kind is missing/risk.
      const confidence: "low" | "medium" | "high" =
        step.kind === "general"
          ? "low"
          : typeof step.count === "number"
          ? step.count > 1
            ? "high"
            : "medium"
          : "medium";

      const affectedSignals = typeof step.count === "number" ? step.count : undefined;

      return { estimatedScoreDelta, affectedSignals, confidence };
    },
    [],
  );

  const planStepImpact = useMemo(() => {
    if (!plan) return new Map<string, { estimatedScoreDelta: number; affectedSignals?: number; confidence: "low" | "medium" | "high" }>();

    const map = new Map<
      string,
      { estimatedScoreDelta: number; affectedSignals?: number; confidence: "low" | "medium" | "high" }
    >();

    const kindToModule = (s: ReadinessPlanStep) => moduleFromHref(s.href) ?? moduleFromText(s.title);

    for (const s of plan.steps ?? []) {
      const isNew = planStepChanges.added.has(s.id);
      const deltaUp = (() => {
        const ch = planStepChanges.severityChanged.get(s.id);
        if (!ch) return 0;
        return severityRankLocal(ch.to) - severityRankLocal(ch.from);
      })();

      const mod = kindToModule(s);
      const preferredModuleIndex = mod ? preferredPlanModules.indexOf(mod) : -1;

      map.set(
        s.id,
        estimateImpactForStep(s, {
          isNew,
          severityDeltaUp: deltaUp,
          preferredModuleIndex,
        }),
      );
    }

    return map;
  }, [plan, planStepChanges.added, planStepChanges.severityChanged, preferredPlanModules, estimateImpactForStep]);

  const rankedPlanSteps = useMemo(() => {
    if (!plan) return [] as ReadinessPlanStep[];

    const kindRank = (k: ReadinessPlanStep["kind"]) => {
      // Missing steps usually unblock the most progress.
      if (k === "missing") return 3;
      if (k === "risk") return 2;
      return 1;
    };

    const isNew = (id: string) => planStepChanges.added.has(id);

    const severityDeltaUp = (id: string) => {
      const ch = planStepChanges.severityChanged.get(id);
      if (!ch) return 0;
      return severityRankLocal(ch.to) - severityRankLocal(ch.from);
    };

    const priority = (s: ReadinessPlanStep) => {
      const sev = severityRankLocal(s.severity);
      const k = kindRank(s.kind);
      const n = isNew(s.id) ? 1 : 0;
      const delta = severityDeltaUp(s.id);
      const deltaUp = delta > 0 ? 1 : 0;
      const stepModule = moduleFromHref(s.href) ?? moduleFromText(s.title);
      const preferredIdx = stepModule ? preferredPlanModules.indexOf(stepModule) : -1;
      // Earlier preferred modules should be nudged higher.
      const moduleBoost = preferredIdx >= 0 ? Math.max(0, 5 - preferredIdx) : 0;

      // Weighted so that severity dominates, then “new/changed”, then preferred module, then kind.
      return (
        sev * 100 +
        n * 20 +
        deltaUp * 10 +
        moduleBoost * 6 +
        k * 5 +
        (typeof s.count === "number" ? Math.min(9, s.count) : 0)
      );
    };

    return [...(plan.steps ?? [])].sort((a, b) => {
      const pa = priority(a);
      const pb = priority(b);
      if (pb !== pa) return pb - pa;

      // Stable-ish tie-breakers
      const sev = severityRankLocal(b.severity) - severityRankLocal(a.severity);
      if (sev !== 0) return sev;

      const kd = kindRank(b.kind) - kindRank(a.kind);
      if (kd !== 0) return kd;

      return a.title.localeCompare(b.title);
    });
  }, [plan, planStepChanges, preferredPlanModules]);

  useEffect(() => {
    if (loading) return;
    if (!readiness) return;
    if (allResolved) return;
    if (isPlanLoading) return;
    if (plan) return;

    // Only run once per estateId unless user explicitly regenerates.
    if (didAutoPlanRef.current === estateId) return;

    didAutoPlanRef.current = estateId;
    void loadPlan({ reason: "auto" });
  }, [estateId, loading, readiness, allResolved, plan, isPlanLoading, loadPlan]);

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

  useEffect(() => {
    if (!plan) return;
    if (!planIsOutdated) return;
    if (isPlanLoading) return;

    // Only auto-refresh once per outdated plan version.
    const key = `${estateId}:${plan.generatedAt}`;
    if (didAutoPlanOutdatedRefreshRef.current === key) return;
    didAutoPlanOutdatedRefreshRef.current = key;

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
      const id = ric(run, { timeout: 1500 });
      return () => {
        if (cancel) cancel(id);
      };
    }

    const t = globalThis.setTimeout(run, 800);
    return () => globalThis.clearTimeout(t);
  }, [estateId, plan, planIsOutdated, isPlanLoading, loadPlan]);

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
            <h2 className="text-sm font-semibold text-gray-900">Readiness</h2>
            <p className="mt-1 text-xs text-gray-500">
              We couldn’t calculate readiness right now{error ? ` (${error})` : ""}. Please refresh and try again.
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
              Go to documents →
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
            <h2 className="text-sm font-semibold text-gray-900">Readiness</h2>
            <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-700">
              {readiness.signals.atRisk.length} risk
              {readiness.signals.atRisk.length === 1 ? "" : "s"} •{" "}
              {readiness.signals.missing.length} missing
            </span>
          </div>

          <p className="mt-1 text-xs text-gray-500">
            A quick snapshot of what’s complete and what needs attention across documents, tasks, properties, contacts, and finances.
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
                <div className="text-[11px] font-semibold uppercase text-gray-600">Top priorities</div>
                <span className="text-[11px] text-gray-500">Based on missing and at-risk items</span>
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
                      Resolve →
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Next steps (Copilot) */}
          <div className="mt-3 rounded-md border border-gray-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-[11px] font-semibold uppercase text-gray-600">Next steps</div>

                {planLabel ? (
                  <span className={planLabel.className} title={planLabel.title}>
                    {planLabel.text}
                  </span>
                ) : null}

                {planDiff.hasPrevious && planDiff.totalChanges > 0 ? (
                  <span
                    className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700"
                    title="Compared to your previous plan"
                  >
                    Updated · {planDiff.totalChanges} change{planDiff.totalChanges === 1 ? "" : "s"}
                  </span>
                ) : null}

                {planDiff.hasPrevious && planDiff.totalChanges > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowPlanChanges((v) => !v)}
                    className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
                    title={showPlanChanges ? "Hide changes" : "See changes"}
                  >
                    {showPlanChanges ? "Hide changes" : "See changes"}
                  </button>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                {planDiff.hasPrevious ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPlanCompareTab("summary");
                      setShowPlanCompare(true);
                    }}
                    className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
                    title="Compare plans"
                  >
                    Compare plans
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => void loadPlan({ refresh: Boolean(plan), reason: "manual" })}
                  className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
                  aria-busy={isPlanLoading}
                  disabled={isPlanLoading}
                  title={plan ? "Refresh the plan" : "Create a 5-step plan"}
                >
                  {isPlanLoading ? "Building…" : plan ? "Refresh plan" : "Create plan"}
                </button>
              </div>
            </div>

            {allResolved ? (
              <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-emerald-900">All set</div>
                    <div className="mt-0.5 text-[11px] text-emerald-800">
                      No missing or at-risk items detected. Keep logging updates to stay on track.
                    </div>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                    On track
                  </span>
                </div>

                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <Link
                    href={`/app/estates/${encodeURIComponent(estateId)}/documents`}
                    className="rounded-md border border-emerald-200 bg-white px-3 py-2 text-xs font-medium text-emerald-900 hover:bg-emerald-100"
                  >
                    Add a new document
                    <div className="mt-0.5 text-[11px] font-normal text-emerald-800">
                      Wills, letters, court docs, receipts
                    </div>
                  </Link>
                  <Link
                    href={`/app/estates/${encodeURIComponent(estateId)}/tasks`}
                    className="rounded-md border border-emerald-200 bg-white px-3 py-2 text-xs font-medium text-emerald-900 hover:bg-emerald-100"
                  >
                    Add a maintenance task
                    <div className="mt-0.5 text-[11px] font-normal text-emerald-800">
                      Follow-ups, calls, deadlines, reminders
                    </div>
                  </Link>
                  <Link
                    href={`/app/estates/${encodeURIComponent(estateId)}/properties`}
                    className="rounded-md border border-emerald-200 bg-white px-3 py-2 text-xs font-medium text-emerald-900 hover:bg-emerald-100"
                  >
                    Review properties
                    <div className="mt-0.5 text-[11px] font-normal text-emerald-800">
                      Ownership, utilities, inspections
                    </div>
                  </Link>
                  <Link
                    href={`/app/estates/${encodeURIComponent(estateId)}/invoices`}
                    className="rounded-md border border-emerald-200 bg-white px-3 py-2 text-xs font-medium text-emerald-900 hover:bg-emerald-100"
                  >
                    Add an expense
                    <div className="mt-0.5 text-[11px] font-normal text-emerald-800">
                      Bills and reimbursements
                    </div>
                  </Link>
                </div>

                <div className="mt-3 text-[11px] text-emerald-800">
                  Tip: If anything changes, refresh your plan to update next steps.
                </div>
              </div>
            ) : (
              <>
                {plan ? (
                  <div className="mt-2">
                    <ConfidenceLegend />
                  </div>
                ) : null}

                {planError ? (
                  <div className="mt-2 text-xs text-rose-700">
                    Plan unavailable{planError ? ` (${planError})` : ""}.
                  </div>
                ) : null}


                {!plan ? (
                  <div className="mt-2 text-xs text-gray-500">
                    Create a short, prioritized checklist based on your current readiness.
                  </div>
                ) : rankedPlanSteps.length === 0 ? (
                  <div className="mt-2 text-xs text-gray-500">No steps to show.</div>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {rankedPlanSteps.map((step) => (
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
                              {step.kind === "missing" ? "Missing" : step.kind === "risk" ? "At risk" : "General"}
                            </span>

                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <span className="min-w-0 truncate text-xs font-medium text-gray-900">{step.title}</span>

                              {(() => {
                                const impact = planStepImpact.get(step.id);
                                if (!impact) return null;

                                const confTone =
                                  impact.confidence === "high"
                                    ? "text-gray-600"
                                    : impact.confidence === "medium"
                                      ? "text-gray-500"
                                      : "text-gray-400";

                                const affected =
                                  typeof impact.affectedSignals === "number" && impact.affectedSignals > 1
                                    ? ` • ${impact.affectedSignals} items`
                                    : typeof impact.affectedSignals === "number" && impact.affectedSignals === 1
                                      ? " • 1 item"
                                      : "";

                                const confLabel =
                                  impact.confidence === "high"
                                    ? "High confidence"
                                    : impact.confidence === "medium"
                                      ? "Medium confidence"
                                      : "Low confidence";

                                const basis =
                                  impact.confidence === "high"
                                    ? "Based on multiple readiness signals."
                                    : impact.confidence === "medium"
                                      ? "Based on limited readiness signals."
                                      : "Heuristic estimate (may change after refresh).";

                                const itemCountLabel =
                                  typeof impact.affectedSignals === "number"
                                    ? impact.affectedSignals === 1
                                      ? "1 item"
                                      : `${impact.affectedSignals} items`
                                    : null;

                                const impactLine = itemCountLabel
                                  ? `Likely impact: +${impact.estimatedScoreDelta}% readiness • ${itemCountLabel}`
                                  : `Likely impact: +${impact.estimatedScoreDelta}% readiness`;

                                const tooltip = `${confLabel}. ${basis}\n${impactLine}\n\nHow this is estimated: severity + type + item count + recent changes.`;

                                return (
                                  <span className={`inline-flex items-center gap-1 text-[11px] ${confTone}`} title={tooltip}>
                                    <span aria-hidden>
                                      {impact.confidence === "high" ? "▲" : impact.confidence === "medium" ? "●" : "○"}
                                    </span>
                                    <span className="sr-only">{confLabel}</span>
                                    <span>
                                      Likely impact: +{impact.estimatedScoreDelta}% readiness{affected}
                                    </span>
                                  </span>
                                );
                              })()}

                              {planStepChanges.added.has(step.id) ? (
                                <span
                                  className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700"
                                  title="This step is new since your last plan"
                                >
                                  New
                                </span>
                              ) : null}

                              {planStepChanges.severityChanged.has(step.id)
                                ? (() => {
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
                                      <span className={cls} title={`Severity changed: ${ch.from} → ${ch.to}`}>
                                        {meta.tone === "up"
                                          ? "Risk increased"
                                          : meta.tone === "down"
                                            ? "Risk reduced"
                                            : "Severity changed"}
                                      </span>
                                    );
                                  })()
                                : null}

                              {(() => {
                                const why = changeExplanationForStep(step);
                                if (!why) return null;

                                return (
                                  <details className="group">
                                    <summary className="cursor-pointer select-none text-[11px] font-medium text-gray-500 hover:text-gray-700">
                                      What changed?
                                    </summary>
                                    <div className="mt-1 max-w-[560px] rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700">
                                      {why}
                                    </div>
                                  </details>
                                );
                              })()}

                              {typeof step.count === "number" && step.count > 1 ? (
                                <span className="inline-flex shrink-0 items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
                                  {step.count}
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <details className="mt-1" open={step.severity === "high"}>
                            <summary className="cursor-pointer text-[11px] font-medium text-blue-600 hover:underline">
                              Details
                            </summary>

                            <div className="mt-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-[11px] text-gray-700">
                              <div className="whitespace-pre-wrap">{step.details ?? fallbackDetailsForStep(step)}</div>

                              <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-gray-500">
                                <span>
                                  Severity: <span className="font-medium text-gray-700">{step.severity}</span>
                                </span>
                                <span>
                                  Type: <span className="font-medium text-gray-700">{step.kind}</span>
                                </span>
                              </div>
                            </div>
                          </details>
                        </div>

                        <Link
                          href={resolvedHrefForPlanStep(estateId, step.href, step.title)}
                          className="shrink-0 text-xs font-medium text-blue-600 hover:underline"
                        >
                          {ctaLabelForStep(step)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}

                {planDiff.hasPrevious && planDiff.removed.length > 0
                  ? (() => {
                      const MAX_DEFAULT = 5;

                      const visibleResolved = showAllResolved
                        ? planDiff.removed
                        : planDiff.removed.slice(0, MAX_DEFAULT);

                      const resolvedTone = (k?: ReadinessPlanStep["kind"]) => {
                        if (k === "missing") return "border-slate-200 bg-white";
                        if (k === "risk") return "border-amber-200 bg-amber-50";
                        if (k === "general") return "border-emerald-200 bg-emerald-50";
                        return "border-gray-200 bg-white";
                      };

                      return (
                        <details className="mt-2 rounded-md border border-gray-200 bg-gray-50 p-2">
                          <summary className="cursor-pointer text-[11px] font-medium text-gray-700">
                            Resolved since last plan
                            <span className="ml-2 font-normal text-gray-500">({planDiff.removed.length})</span>
                          </summary>

                          <ul className="mt-2 space-y-1">
                            {visibleResolved.map((s) => {
                              const href = resolvedHrefForPlanStep(estateId, s.href, s.title);
                              return (
                                <li key={s.id}>
                                  <Link
                                    href={href}
                                    className={[
                                      "flex items-start justify-between gap-2 rounded-md border px-2 py-1 hover:underline",
                                      resolvedTone(s.kind),
                                    ].join(" ")}
                                  >
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
                                          Resolved
                                        </span>
                                        <span className="min-w-0 truncate text-[11px] font-medium text-gray-800 line-through">
                                          {s.title}
                                        </span>
                                        <span className="shrink-0 text-[11px] text-gray-500">({s.severity})</span>
                                      </div>
                                    </div>
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>

                          {planDiff.removed.length > MAX_DEFAULT ? (
                            <div className="mt-2 flex items-center justify-between">
                              <div className="text-[11px] text-gray-500">
                                {showAllResolved
                                  ? "Showing all resolved items."
                                  : `Showing top ${MAX_DEFAULT} resolved items.`}
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setShowAllResolved((v) => !v);
                                }}
                                className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
                              >
                                {showAllResolved ? "Show less" : "Show all"}
                              </button>
                            </div>
                          ) : null}
                        </details>
                      );
                    })()
                  : null}

                {plan ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                    <span title={planGeneratedAt ? planGeneratedAt.toLocaleString() : plan.generatedAt}>
                      Plan: <span className="font-medium text-gray-700">{toRelativeAgeLabel(planGeneratedAt)}</span>
                    </span>

                    {planIsOutdated ? (
                      <span
                        className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800"
                        title="Readiness changed since this plan was generated. Regenerate to refresh next steps."
                      >
                        Out of date
                      </span>
                    ) : null}

                    {planIsStale ? (
                      <span
                        className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800"
                        title="This plan is older than 24 hours. The server will refresh it automatically soon, but you can regenerate now."
                      >
                        {isPlanAutoRefreshing ? "Refreshing…" : "Old plan"}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {planDiff.hasPrevious && planDiff.totalChanges > 0 && showPlanChanges ? (
                  <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 p-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[11px] font-medium text-gray-700">
                        Changes since last plan
                        <span className="ml-2 font-normal text-gray-500">
                          {planDiff.added.length} new, {planDiff.severityChanged.length} severity update
                          {planDiff.severityChanged.length === 1 ? "" : "s"}, {planDiff.removed.length} resolved
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowPlanChanges(false)}
                        className="text-[11px] font-medium text-gray-600 hover:text-gray-800"
                        title="Hide changes"
                      >
                        Dismiss
                      </button>
                    </div>

                    <div className="mt-2 space-y-2 text-[11px] text-gray-700">
                      {planDiff.added.length > 0 ? (
                        <div>
                          <div className="font-semibold text-gray-800">New</div>
                          <ul className="mt-1 list-disc space-y-0.5 pl-5">
                            {planDiff.added.slice(0, 5).map((s) => (
                              <li key={s.id}>
                                <Link
                                  href={resolvedHrefForPlanStep(estateId, s.href, s.title)}
                                  className="font-medium text-gray-800 hover:underline"
                                >
                                  {s.title}
                                </Link>
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
                                <Link
                                  href={resolvedHrefForPlanStep(estateId, c.href, c.title)}
                                  className="font-medium text-gray-800 hover:underline"
                                >
                                  {c.title}
                                </Link>
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
                                <Link
                                  href={resolvedHrefForPlanStep(estateId, s.href, s.title)}
                                  className="font-medium text-gray-800 hover:underline line-through"
                                >
                                  {s.title}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {planDiff.added.length > 5 || planDiff.severityChanged.length > 5 || planDiff.removed.length > 5 ? (
                        <div className="text-gray-500">Showing top 5 per section.</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </>
            )}
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
            Go to documents →
          </Link>
        </div>
      </div>

      {showPlanCompare ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Compare plans"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowPlanCompare(false);
          }}
        >
          <div className="w-full max-w-2xl rounded-lg border border-gray-200 bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900">Compare plans</div>
                <div className="mt-0.5 text-[11px] text-gray-500">
                  {planDiff.hasPrevious
                    ? `${planDiff.added.length} new • ${planDiff.severityChanged.length} severity change${
                        planDiff.severityChanged.length === 1 ? "" : "s"
                      } • ${planDiff.removed.length} resolved`
                    : "No previous plan snapshot found."}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowPlanCompare(false)}
                className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
                aria-label="Dismiss"
              >
                Dismiss
              </button>
            </div>

            <div className="px-4 py-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPlanCompareTab("summary")}
                  className={
                    planCompareTab === "summary"
                      ? "rounded-md bg-gray-900 px-2 py-1 text-[11px] font-medium text-white"
                      : "rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
                  }
                >
                  Summary
                </button>
                <button
                  type="button"
                  onClick={() => setPlanCompareTab("details")}
                  className={
                    planCompareTab === "details"
                      ? "rounded-md bg-gray-900 px-2 py-1 text-[11px] font-medium text-white"
                      : "rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
                  }
                >
                  Details
                </button>
              </div>

              {!planDiff.hasPrevious ? (
                <div className="mt-3 text-xs text-gray-600">
                  Create a plan, then refresh it after updates to compare changes.
                </div>
              ) : planDiff.totalChanges === 0 ? (
                <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                  No changes detected between your previous plan snapshot and the current plan.
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  {planCompareTab === "summary" ? (
                    <div className="space-y-3">
                      {planDiff.added.length > 0 ? (
                        <div>
                          <div className="text-[11px] font-semibold uppercase text-gray-600">New</div>
                          <ul className="mt-1 space-y-1">
                            {planDiff.added.slice(0, 8).map((s) => (
                              <li key={s.id} className="flex items-center justify-between gap-2">
                                <Link
                                  href={resolvedHrefForPlanStep(estateId, s.href, s.title)}
                                  onClick={() => setShowPlanCompare(false)}
                                  className="min-w-0 truncate text-xs font-medium text-gray-900 hover:underline"
                                >
                                  {s.title}
                                </Link>
                                <span className="shrink-0 text-[11px] text-gray-500">{s.severity}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {planDiff.severityChanged.length > 0 ? (
                        <div>
                          <div className="text-[11px] font-semibold uppercase text-gray-600">Severity changes</div>
                          <ul className="mt-1 space-y-1">
                            {planDiff.severityChanged.slice(0, 8).map((c) => (
                              <li key={c.id} className="flex items-center justify-between gap-2">
                                <Link
                                  href={resolvedHrefForPlanStep(estateId, c.href, c.title)}
                                  onClick={() => setShowPlanCompare(false)}
                                  className="min-w-0 truncate text-xs font-medium text-gray-900 hover:underline"
                                >
                                  {c.title}
                                </Link>
                                <span className="shrink-0 text-[11px] text-gray-500">
                                  {c.from} → {c.to}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {planDiff.removed.length > 0 ? (
                        <div>
                          <div className="text-[11px] font-semibold uppercase text-gray-600">Resolved</div>
                          <ul className="mt-1 space-y-1">
                            {planDiff.removed.slice(0, 8).map((s) => (
                              <li key={s.id} className="flex items-center justify-between gap-2">
                                <Link
                                  href={resolvedHrefForPlanStep(estateId, s.href, s.title)}
                                  onClick={() => setShowPlanCompare(false)}
                                  className="min-w-0 truncate text-xs font-medium text-gray-700 hover:underline line-through"
                                >
                                  {s.title}
                                </Link>
                                <span className="shrink-0 text-[11px] text-gray-400">{s.severity}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {planDiff.added.length > 8 ||
                      planDiff.severityChanged.length > 8 ||
                      planDiff.removed.length > 8 ? (
                        <div className="text-[11px] text-gray-500">Showing top 8 per section.</div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-xs text-gray-700">
                        This view lists current plan steps and highlights what changed.
                      </div>
                      <ul className="space-y-2">
                        {rankedPlanSteps.map((step) => {
                          const isNew = planStepChanges.added.has(step.id);
                          const ch = planStepChanges.severityChanged.get(step.id);
                          const changeLabel = isNew ? "New" : ch ? `Severity: ${ch.from} → ${ch.to}` : null;

                          if (!changeLabel) return null;

                          return (
                            <li key={step.id} className="rounded-md border border-gray-200 bg-gray-50 p-2">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="truncate text-xs font-medium text-gray-900">{step.title}</span>
                                    <span className="inline-flex items-center rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-gray-700">
                                      {changeLabel}
                                    </span>
                                  </div>
                                  {step.details ? (
                                    <div className="mt-1 line-clamp-2 text-[11px] text-gray-600">{step.details}</div>
                                  ) : null}
                                </div>

                                <Link
                                  href={resolvedHrefForPlanStep(estateId, step.href, step.title)}
                                  onClick={() => setShowPlanCompare(false)}
                                  className="shrink-0 text-xs font-medium text-blue-600 hover:underline"
                                >
                                  Open →
                                </Link>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-gray-200 px-4 py-3">
              <div className="text-[11px] text-gray-500">Tip: refresh after updates to keep your plan in sync.</div>
              <button
                type="button"
                onClick={() => setShowPlanCompare(false)}
                className="rounded-md bg-gray-900 px-3 py-1.5 text-[11px] font-medium text-white"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

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