import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { requireEstateAccess } from "@/lib/estateAccess";
import { getEstateReadiness } from "@/lib/estate/readiness";
import {
  buildReadinessPlanMessages,
  safeParseReadinessPlan,
} from "@/lib/ai/readinessPlan";

export const dynamic = "force-dynamic";

const AI_PROVIDER = process.env.OPENAI_API_KEY ? "openai" : null;

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

    return parsed;
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

function normalizeTitle(label: string): string {
  // Keep titles short and action-oriented.
  const trimmed = label.trim();
  if (!trimmed) return "Take the next readiness step";

  // If label already starts with a verb like “Add …”, “Create …” keep it.
  return trimmed;
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
      title: normalizeTitle(String(s.label)),
      details: typeof s.reason === "string" && s.reason.trim() ? s.reason : undefined,
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
        title: "Review your document index",
        details: "Confirm you have court letters, IDs, banking statements, and property docs recorded.",
        href: stepHrefForSignal(estateId, "documents"),
        kind: "general",
        severity: "low",
      },
      {
        id: "general:review-tasks",
        title: "Confirm your next deadlines",
        details: "Make sure key tasks are created and assigned: inventory, notices, and property security.",
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

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    await requireEstateAccess({ estateId, userId: session.user.id });

    const readiness = (await getEstateReadiness(estateId)) as unknown as EstateReadinessLike;

    const aiPlan = await generatePlanWithAI({ estateId, readiness });
    const plan = aiPlan ?? buildPlanFromReadiness(estateId, readiness);

    return NextResponse.json({ ok: true, plan }, { status: 200 });
  } catch (err) {
    console.error("readiness plan error", err);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}