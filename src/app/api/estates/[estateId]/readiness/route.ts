import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { requireEstateAccess } from "@/lib/estateAccess";
import { connectToDatabase } from "@/lib/db";
import getEstateReadiness from "@/lib/estate/readiness";


export const dynamic = "force-dynamic";

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

function sortSignals<T extends { severity: string; label: string; count?: number }>(signals: T[]): T[] {
  return [...signals].sort((a, b) => {
    const sev = severityRank(b.severity) - severityRank(a.severity);
    if (sev !== 0) return sev;

    const countA = typeof a.count === "number" ? a.count : 0;
    const countB = typeof b.count === "number" ? b.count : 0;
    const cnt = countB - countA;
    if (cnt !== 0) return cnt;

    return a.label.localeCompare(b.label);
  });
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ estateId: string }> },
) {
  const { estateId } = await ctx.params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    await connectToDatabase();

    await requireEstateAccess({ estateId, userId: session.user.id });

    const readiness = await getEstateReadiness(estateId);

    const orderedReadiness = {
      ...readiness,
      signals: {
        ...readiness.signals,
        missing: sortSignals(readiness.signals.missing ?? []),
        atRisk: sortSignals(readiness.signals.atRisk ?? []),
      },
    };

    return NextResponse.json({ ok: true, readiness: orderedReadiness }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN_ERROR";

    // If your `requireEstateAccess` throws a forbidden-ish error, normalize it here.
    // We intentionally keep this simple and conservative.
    if (message.toLowerCase().includes("forbidden") || message.toLowerCase().includes("unauthorized")) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    return NextResponse.json(
      { ok: false, error: "SERVER_ERROR" },
      { status: 500 },
    );
  }
}
