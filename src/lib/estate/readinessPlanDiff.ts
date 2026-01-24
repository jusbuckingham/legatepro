

export type PlanStepSnapshot = {
  id: string;
  title: string;
  severity: "low" | "medium" | "high";
  href?: string;
  kind?: "missing" | "risk" | "general";
};

export type PlanSnapshot = {
  estateId: string;
  generatedAt: string;
  steps: PlanStepSnapshot[];
};

export type PlanDiff = {
  hasPrevious: boolean;
  added: PlanStepSnapshot[];
  removed: PlanStepSnapshot[];
  severityChanged: Array<{
    id: string;
    title: string;
    from: PlanStepSnapshot["severity"];
    to: PlanStepSnapshot["severity"];
    href?: string;
  }>;
  totalChanges: number;
};

function severityRank(sev: string): number {
  switch (sev) {
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

export function snapshotFromPlan(plan: {
  estateId: string;
  generatedAt: string;
  steps: Array<{
    id: string;
    title: string;
    severity: "low" | "medium" | "high";
    href?: string;
    kind?: "missing" | "risk" | "general";
  }>;
}): PlanSnapshot {
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

export function diffPlans(
  current: {
    estateId: string;
    generatedAt: string;
    steps: Array<{
      id: string;
      title: string;
      severity: "low" | "medium" | "high";
      href?: string;
      kind?: "missing" | "risk" | "general";
    }>;
  } | null,
  previous: PlanSnapshot | null,
): PlanDiff {
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
    href: s.href,
    kind: s.kind,
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
      severityChanged.push({
        id,
        title: cur.title,
        from: prev.severity,
        to: cur.severity,
        href: cur.href,
      });
    }
  }

  for (const [id, prev] of prevMap.entries()) {
    if (!curMap.has(id)) removed.push(prev);
  }

  added.sort(
    (a, b) =>
      severityRank(b.severity) - severityRank(a.severity) ||
      a.title.localeCompare(b.title),
  );

  removed.sort(
    (a, b) =>
      severityRank(b.severity) - severityRank(a.severity) ||
      a.title.localeCompare(b.title),
  );

  severityChanged.sort(
    (a, b) =>
      severityRank(b.to) - severityRank(a.to) ||
      a.title.localeCompare(b.title),
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