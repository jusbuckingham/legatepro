

/**
 * Readiness Copilot prompting helpers.
 *
 * This module is intentionally dependency-free (no OpenAI SDK imports) so it can be
 * used from route handlers regardless of which LLM provider you choose.
 */

export type ReadinessSignal = {
  key: string;
  label: string;
  severity: "low" | "medium" | "high";
  reason?: string;
  count?: number;
};

export type ReadinessSnapshot = {
  estateId: string;
  score: number;
  signals: {
    missing: ReadinessSignal[];
    atRisk: ReadinessSignal[];
  };
};

export type ReadinessPlanStep = {
  id: string;
  title: string;
  details?: string;
  href: string;
  kind: "missing" | "risk" | "general";
  severity: "low" | "medium" | "high";
  count?: number;
};

export type ReadinessPlan = {
  estateId: string;
  generatedAt: string;
  generator: string;
  steps: ReadinessPlanStep[];
};

export type ReadinessPlanContext = {
  /** Base URL path for estate pages, e.g. /app/estates/<id> */
  estateBasePath: string;
  /** Optional extra context from the estate record (display name, case number, etc.) */
  estateLabel?: string;
  /** If true, include sensitive items in guidance. */
  includeSensitive?: boolean;
};

export type ReadinessPlanPromptInput = {
  readiness: ReadinessSnapshot;
  context: ReadinessPlanContext;
  /** Maximum number of steps to return; defaults to 5. */
  maxSteps?: number;
};

export type ChatMessage = {
  role: "system" | "user";
  content: string;
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function escapeForJsonString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
}

export function buildReadinessPlanSystemPrompt(): string {
  return [
    "You are LegatePro Readiness Copilot.",
    "Your job: turn readiness signals into a short, prioritized plan the user can execute.",
    "Return STRICT JSON only. No markdown. No commentary.",
    "Rules:",
    "- Output must match the provided JSON schema exactly.",
    "- Steps must be actionable verbs (Add, Create, Review, Collect, Verify, Pay, Notify, etc.).",
    "- Keep titles short; details optional but helpful.",
    "- Use the provided hrefs; do NOT invent routes.",
    "- Prefer fixing HIGH severity first, then MEDIUM, then LOW.",
    "- If there are zero signals, return 2-3 general steps.",
  ].join("\n");
}

export function buildReadinessPlanUserPrompt(input: ReadinessPlanPromptInput): string {
  const maxSteps = clamp(input.maxSteps ?? 5, 1, 10);
  const score = clamp(Math.round(input.readiness.score), 0, 100);

  const schema = {
    estateId: "string",
    generatedAt: "ISO-8601 string",
    generator: "string",
    steps: [
      {
        id: "string",
        title: "string",
        details: "string (optional)",
        href: "string",
        kind: '"missing" | "risk" | "general"',
        severity: '"low" | "medium" | "high"',
        count: "number (optional)",
      },
    ],
  };

  // Provide the model with explicit hrefs derived server-side.
  const signals = {
    missing: input.readiness.signals.missing,
    atRisk: input.readiness.signals.atRisk,
  };

  const payload = {
    estateId: input.readiness.estateId,
    estateLabel: input.context.estateLabel ?? null,
    includeSensitive: Boolean(input.context.includeSensitive),
    score,
    maxSteps,
    estateBasePath: input.context.estateBasePath,
    signals,
    // Hints for href mapping (LLM should still use server-provided href fields in steps).
    hrefHints: {
      documents: `${input.context.estateBasePath}/documents#add-document`,
      tasks: `${input.context.estateBasePath}/tasks#add-task`,
      properties: `${input.context.estateBasePath}/properties#add-property`,
      contacts: `${input.context.estateBasePath}/contacts#add-contact`,
      invoices: `${input.context.estateBasePath}/invoices#add-invoice`,
      expenses: `${input.context.estateBasePath}/invoices#add-expense`,
    },
    outputSchema: schema,
  };

  // Stringify without risking accidental markdown formatting.
  const json = JSON.stringify(payload);

  return [
    `Generate a readiness plan with up to ${maxSteps} steps.`,
    "Return STRICT JSON that matches outputSchema.",
    "Do NOT include markdown.",
    "Do NOT include extra keys.",
    "Payload:",
    json,
  ].join("\n");
}

export function buildReadinessPlanMessages(input: ReadinessPlanPromptInput): ChatMessage[] {
  return [
    { role: "system", content: buildReadinessPlanSystemPrompt() },
    { role: "user", content: buildReadinessPlanUserPrompt(input) },
  ];
}

export function safeParseReadinessPlan(jsonText: string): ReadinessPlan | null {
  try {
    const parsed = JSON.parse(jsonText) as unknown;

    if (!parsed || typeof parsed !== "object") return null;

    const obj = parsed as {
      estateId?: unknown;
      generatedAt?: unknown;
      generator?: unknown;
      steps?: unknown;
    };

    if (typeof obj.estateId !== "string") return null;
    if (typeof obj.generatedAt !== "string") return null;
    if (typeof obj.generator !== "string") return null;
    if (!Array.isArray(obj.steps)) return null;

    const steps: ReadinessPlanStep[] = [];

    for (const step of obj.steps) {
      if (!step || typeof step !== "object") continue;

      const s = step as {
        id?: unknown;
        title?: unknown;
        details?: unknown;
        href?: unknown;
        kind?: unknown;
        severity?: unknown;
        count?: unknown;
      };

      if (typeof s.id !== "string") continue;
      if (typeof s.title !== "string") continue;
      if (typeof s.href !== "string") continue;

      const kind = s.kind;
      if (kind !== "missing" && kind !== "risk" && kind !== "general") continue;

      const severity = s.severity;
      if (severity !== "low" && severity !== "medium" && severity !== "high") continue;

      steps.push({
        id: s.id,
        title: s.title,
        details: typeof s.details === "string" ? s.details : undefined,
        href: s.href,
        kind,
        severity,
        count: typeof s.count === "number" ? s.count : undefined,
      });
    }

    return {
      estateId: obj.estateId,
      generatedAt: obj.generatedAt,
      generator: obj.generator,
      steps,
    };
  } catch {
    return null;
  }
}

/**
 * Small helper for providers that need JSON escaped prompts.
 */
export function buildReadinessPlanPromptEscaped(input: ReadinessPlanPromptInput): string {
  return escapeForJsonString(buildReadinessPlanUserPrompt(input));
}