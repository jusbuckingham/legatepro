import { NextResponse } from "next/server";
import { createHash } from "crypto";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { requireEstateAccess } from "@/lib/estateAccess";
import { getEstateReadiness } from "@/lib/estate/readiness";
import {
  buildReadinessPlanMessages,
  safeParseReadinessPlan,
} from "@/lib/ai/readinessPlan";
import { Estate } from "@/models/Estate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const AI_PROVIDER = process.env.OPENAI_API_KEY ? "openai" : null;

const PLAN_TTL_MS = 24 * 60 * 60 * 1000;

function safeIsoDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isFreshWithinTtl(generatedAtIso: unknown, now: Date = new Date()): boolean {
  const d = safeIsoDate(generatedAtIso);
  if (!d) return false;
  return now.getTime() - d.getTime() <= PLAN_TTL_MS;
}

function snapshotSignals(readiness: EstateReadinessLike): {
  missing: ReadinessSignalLike[];
  atRisk: ReadinessSignalLike[];
} {
  const missing = Array.isArray(readiness?.signals?.missing) ? readiness.signals!.missing! : [];
  const atRisk = Array.isArray(readiness?.signals?.atRisk) ? readiness.signals!.atRisk! : [];

  // Keep snapshot small and stable.
  const pick = (s: ReadinessSignalLike): ReadinessSignalLike => ({
    key: String(s.key),
    label: String(s.label),
    severity: s.severity,
    reason: typeof s.reason === "string" ? s.reason : undefined,
    count: typeof s.count === "number" ? s.count : undefined,
  });

  return {
    missing: missing.map(pick),
    atRisk: atRisk.map(pick),
  };
}

function hashSnapshot(snapshot: { missing: ReadinessSignalLike[]; atRisk: ReadinessSignalLike[] }): string {
  // Stable hash for diffing: sort by key then stringify.
  const stable = {
    missing: [...snapshot.missing].sort((a, b) => String(a.key).localeCompare(String(b.key))),
    atRisk: [...snapshot.atRisk].sort((a, b) => String(a.key).localeCompare(String(b.key))),
  };

  const json = JSON.stringify(stable);
  return createHash("sha256").update(json).digest("hex");
}

async function generatePlanWithAI(params: {
  estateId: string;
  readiness: EstateReadinessLike;
}): Promise<ReadinessPlan | null> {
  if (!AI_PROVIDER) return null;

  try {
    const messages = buildReadinessPlanMessages({
      readiness: {
        estateId: params.estateId,
        score: 0,
        signals: {
          missing: params.readiness.signals?.missing ?? [],
          atRisk: params.readiness.signals?.atRisk ?? [],
        },
      },
      context: {
        estateBasePath: `/app/estates/${encodeURIComponent(params.estateId)}`,
      },
    });

    // NOTE: provider adapter intentionally minimal — swap freely later
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages,
      }),
    });

    if (!res.ok) return null;

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const text = json?.choices?.[0]?.message?.content;
    if (!text) return null;

    const parsed = safeParseReadinessPlan(text);
    if (!parsed) return null;

    const nowIso = new Date().toISOString();

    const normalizedSteps: ReadinessPlanStep[] = Array.isArray((parsed as { steps?: unknown }).steps)
      ? ((parsed as { steps?: ReadinessPlanStep[] }).steps ?? []).map((s, idx) => {
          const title = normalizeTitle((s as { title?: unknown }).title);
          const details = normalizeDetails((s as { details?: unknown }).details);
          const hrefRaw = (s as { href?: unknown }).href;
          const href = typeof hrefRaw === "string" && hrefRaw.trim().length > 0 ? hrefRaw : stepHrefForSignal(params.estateId, title);

          const kindRaw = (s as { kind?: unknown }).kind;
          const kind: ReadinessPlanStep["kind"] =
            kindRaw === "missing" || kindRaw === "risk" || kindRaw === "general" ? kindRaw : "general";

          const severityRaw = (s as { severity?: unknown }).severity;
          const severity: ReadinessPlanStep["severity"] =
            severityRaw === "high" || severityRaw === "medium" || severityRaw === "low" ? severityRaw : "medium";

          const countRaw = (s as { count?: unknown }).count;
          const count = typeof countRaw === "number" ? countRaw : undefined;

          const idRaw = (s as { id?: unknown }).id;
          const id = typeof idRaw === "string" && idRaw.trim().length > 0 ? idRaw : `ai:${idx}:${createHash("sha1").update(title).digest("hex").slice(0, 8)}`;

          return {
            id,
            title,
            details,
            href,
            kind,
            severity,
            count,
          };
        })
      : [];

    return {
      estateId: params.estateId,
      generatedAt: nowIso,
      generator: "openai:gpt-4o-mini",
      steps: normalizedSteps,
    };
  } catch {
    return null;
  }
}

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

type ReadinessSignalLike = {
  key: string;
  label: string;
  severity: "low" | "medium" | "high";
  reason?: string;
  count?: number;
};

type EstateReadinessLike = {
  signals?: {
    missing?: ReadinessSignalLike[];
    atRisk?: ReadinessSignalLike[];
  };
};

function severityRank(severity: string): number {
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

function looksMissingKey(key: string): boolean {
  const k = key.toLowerCase();
  return (
    k.startsWith("missing") ||
    k.includes("missing_") ||
    k.includes("_missing") ||
    k.startsWith("no_") ||
    k.includes("no_") ||
    k.includes("none_") ||
    k.includes("empty_") ||
    k.includes("requires_") ||
    k.includes("need_")
  );
}

function stepHrefForSignal(estateId: string, signalKey: string): string {
  const key = signalKey.toLowerCase();
  const estateBase = `/app/estates/${encodeURIComponent(estateId)}`;

  const isMissing = looksMissingKey(key);

  if (key.includes("document") || key.startsWith("docs") || key.startsWith("documents")) {
    return isMissing ? `${estateBase}/documents#add-document` : `${estateBase}/documents`;
  }

  if (key.includes("task") || key.startsWith("tasks")) {
    return isMissing ? `${estateBase}/tasks#add-task` : `${estateBase}/tasks`;
  }

  if (key.includes("property") || key.startsWith("properties")) {
    return isMissing ? `${estateBase}/properties#add-property` : `${estateBase}/properties`;
  }

  if (key.includes("contact") || key.startsWith("contacts")) {
    return isMissing ? `${estateBase}/contacts#add-contact` : `${estateBase}/contacts`;
  }

  if (key.includes("expense")) {
    return `${estateBase}/invoices#add-expense`;
  }

  if (key.includes("invoice")) {
    return isMissing ? `${estateBase}/invoices#add-invoice` : `${estateBase}/invoices`;
  }

  if (key.includes("finance") || key.startsWith("finances")) {
    return isMissing ? `${estateBase}/invoices#add-invoice` : `${estateBase}/invoices`;
  }

  // Default: documents usually improves readiness fastest.
  return isMissing ? `${estateBase}/documents#add-document` : `${estateBase}/documents`;
}

function normalizeTitle(value: unknown): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) return "Next step";

  // Collapse whitespace and remove trailing punctuation noise.
  const collapsed = s.replace(/\s+/g, " ").replace(/[\s.:;-]+$/g, "");

  // If it already starts with an action verb, keep it as-is.
  return collapsed;
}

function normalizeDetails(value: unknown): string | undefined {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) return undefined;

  // Normalize whitespace and paragraphs; keep it readable.
  return s.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
}

function normalizeCachedPlan(estateId: string, planUnknown: unknown): ReadinessPlan | null {
  if (!planUnknown || typeof planUnknown !== "object") return null;

  const p = planUnknown as {
    estateId?: unknown;
    generatedAt?: unknown;
    generator?: unknown;
    steps?: unknown;
    meta?: unknown;
  };

  const generatedAt = typeof p.generatedAt === "string" && p.generatedAt.trim().length > 0 ? p.generatedAt : new Date().toISOString();
  const generator = typeof p.generator === "string" && p.generator.trim().length > 0 ? p.generator : "unknown";

  const stepsRaw = Array.isArray(p.steps) ? (p.steps as unknown[]) : [];

  const steps: ReadinessPlanStep[] = stepsRaw.map((stepUnknown, idx) => {
    const s = (stepUnknown ?? {}) as {
      id?: unknown;
      title?: unknown;
      details?: unknown;
      href?: unknown;
      kind?: unknown;
      severity?: unknown;
      count?: unknown;
    };

    const title = normalizeTitle(s.title);
    const details = normalizeDetails(s.details);

    const hrefRaw = s.href;
    const href = typeof hrefRaw === "string" && hrefRaw.trim().length > 0 ? hrefRaw : stepHrefForSignal(estateId, title);

    const kindRaw = s.kind;
    const kind: ReadinessPlanStep["kind"] =
      kindRaw === "missing" || kindRaw === "risk" || kindRaw === "general" ? kindRaw : "general";

    const severityRaw = s.severity;
    const severity: ReadinessPlanStep["severity"] =
      severityRaw === "high" || severityRaw === "medium" || severityRaw === "low" ? severityRaw : "medium";

    const countRaw = s.count;
    const count = typeof countRaw === "number" ? countRaw : undefined;

    const idRaw = s.id;
    const id = typeof idRaw === "string" && idRaw.trim().length > 0 ? idRaw : `cached:${idx}:${createHash("sha1").update(title).digest("hex").slice(0, 8)}`;

    return {
      id,
      title,
      details,
      href,
      kind,
      severity,
      count,
    };
  });

  // Keep the cached estateId if it matches; otherwise force to requested estateId.
  const outEstateId = typeof p.estateId === "string" && p.estateId === estateId ? p.estateId : estateId;

  return {
    estateId: outEstateId,
    generatedAt,
    generator,
    steps,
  };
}

function buildPlanFromReadiness(estateId: string, readiness: EstateReadinessLike): ReadinessPlan {
  const missing = Array.isArray(readiness?.signals?.missing) ? readiness.signals!.missing! : [];
  const atRisk = Array.isArray(readiness?.signals?.atRisk) ? readiness.signals!.atRisk! : [];

  const merged: Array<ReadinessSignalLike & { kind: "missing" | "risk" }> = [
    ...missing.map((s) => ({ ...s, kind: "missing" as const })),
    ...atRisk.map((s) => ({ ...s, kind: "risk" as const })),
  ].filter((s): s is ReadinessSignalLike & { kind: "missing" | "risk" } =>
    Boolean(s && typeof s.key === "string" && typeof s.label === "string"),
  );

  merged.sort((a, b) => {
    const sev = severityRank(b.severity) - severityRank(a.severity);
    if (sev !== 0) return sev;

    const countA = typeof a.count === "number" ? a.count : 0;
    const countB = typeof b.count === "number" ? b.count : 0;
    const cnt = countB - countA;
    if (cnt !== 0) return cnt;

    if (a.kind !== b.kind) return a.kind === "missing" ? -1 : 1;

    return String(a.label).localeCompare(String(b.label));
  });

  const steps: ReadinessPlanStep[] = merged.slice(0, 5).map((s, idx) => {
    const href = stepHrefForSignal(estateId, s.key);

    return {
      id: `${s.key}:${idx}`,
      title: normalizeTitle(s.label),
      details: normalizeDetails(s.reason),
      href,
      kind: s.kind,
      severity: (s.severity ?? "medium") as "low" | "medium" | "high",
      count: typeof s.count === "number" ? s.count : undefined,
    };
  });

  // If there are no actionable signals, provide a couple of general next steps.
  if (steps.length === 0) {
    steps.push(
      {
        id: "general:review-documents",
        title: normalizeTitle("Review your document index"),
        details: normalizeDetails("Confirm you have court letters, IDs, banking statements, and property docs recorded."),
        href: stepHrefForSignal(estateId, "documents"),
        kind: "general",
        severity: "low",
      },
      {
        id: "general:review-tasks",
        title: normalizeTitle("Confirm your next deadlines"),
        details: normalizeDetails("Make sure key tasks are created and assigned: inventory, notices, and property security."),
        href: stepHrefForSignal(estateId, "tasks"),
        kind: "general",
        severity: "low",
      },
    );
  }

  return {
    estateId,
    generatedAt: new Date().toISOString(),
    generator: "heuristic-v1",
    steps,
  };
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ estateId: string }> },
) {
  try {
    const { estateId } = await context.params;
    const url = new URL(_req.url);
    const refresh = url.searchParams.get("refresh") === "1";

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    await requireEstateAccess({ estateId, userId: session.user.id });

    // If not forcing refresh, attempt to reuse a fresh plan.
    // We only trust a cached plan when:
    // - it is structurally valid
    // - it is within TTL
    // - AND (when available) its inputHash matches the current readiness snapshot
    if (!refresh) {
      const existingEstate = await Estate.findById(estateId).select("readinessPlan").lean();
      const existingPlan = existingEstate?.readinessPlan as unknown;

      if (existingPlan && typeof existingPlan === "object") {
        const p = existingPlan as {
          estateId?: unknown;
          generatedAt?: unknown;
          generator?: unknown;
          steps?: unknown;
          meta?: unknown;
        };

        const hasShape =
          typeof p.estateId === "string" &&
          typeof p.generatedAt === "string" &&
          typeof p.generator === "string" &&
          Array.isArray(p.steps);

        if (hasShape && isFreshWithinTtl(p.generatedAt)) {
          // If the plan contains an inputHash, only reuse it if readiness inputs match.
          const meta = (p.meta ?? null) as null | { inputHash?: unknown };
          const cachedHash = meta && typeof meta.inputHash === "string" ? meta.inputHash : null;

          if (!cachedHash) {
            const normalized = normalizeCachedPlan(estateId, existingPlan);
            return NextResponse.json({ ok: true, plan: normalized ?? existingPlan }, { status: 200 });
          }

          const readinessNow = (await getEstateReadiness(estateId)) as unknown as EstateReadinessLike;
          const snapshotNow = snapshotSignals(readinessNow);
          const hashNow = hashSnapshot(snapshotNow);

          if (hashNow === cachedHash) {
            const normalized = normalizeCachedPlan(estateId, existingPlan);
            return NextResponse.json({ ok: true, plan: normalized ?? existingPlan }, { status: 200 });
          }
          // If hash differs, fall through to regenerate.
        }
      }
    }

    const readiness = (await getEstateReadiness(estateId)) as unknown as EstateReadinessLike;

    const signalsSnapshot = snapshotSignals(readiness);
    const inputHash = hashSnapshot(signalsSnapshot);

    const aiPlan = await generatePlanWithAI({ estateId, readiness });
    const basePlan = aiPlan ?? buildPlanFromReadiness(estateId, readiness);

    // Persist extra metadata for diffing/history later.
    const plan = {
      ...basePlan,
      meta: {
        inputHash,
        signals: signalsSnapshot,
      },
    };

    await Estate.findByIdAndUpdate(
      estateId,
      { $set: { readinessPlan: plan } },
      { new: false },
    );

    return NextResponse.json({ ok: true, plan }, { status: 200 });
  } catch (err) {
    console.error("readiness plan error", err);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}