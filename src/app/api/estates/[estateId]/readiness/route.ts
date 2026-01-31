import { NextResponse } from "next/server";
import mongoose from "mongoose";

import { auth } from "@/lib/auth";
import { requireEstateAccess } from "@/lib/estateAccess";
import { connectToDatabase } from "@/lib/db";
import * as readinessLib from "@/lib/estate/readiness";
import { Estate } from "@/models/Estate";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

function isObjectIdLike(value: string): boolean {
  return mongoose.Types.ObjectId.isValid(value);
}

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

type ReadinessFn = (estateId: string) => Promise<unknown>;

function resolveReadinessFn(): ReadinessFn | null {
  const libUnknown: unknown = readinessLib;
  if (!libUnknown || typeof libUnknown !== "object") return null;

  const lib = libUnknown as Record<string, unknown>;

  const candidateKeys = ["default", "getEstateReadiness", "calculateEstateReadiness"];
  for (const key of candidateKeys) {
    const v = lib[key];
    if (typeof v === "function") return v as ReadinessFn;
  }

  return null;
}

export async function GET(
  _req: Request,
  ctx: { params: { estateId: string } | Promise<{ estateId: string }> },
) {
  const params = await ctx.params;
  const estateId = params?.estateId;

  if (!estateId || typeof estateId !== "string") {
    return NextResponse.json({ ok: false, error: "INVALID_ESTATE_ID" }, { status: 400, headers: NO_STORE_HEADERS });
  }

  if (!isObjectIdLike(estateId)) {
    return NextResponse.json({ ok: false, error: "INVALID_ESTATE_ID" }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const getEstateReadiness = resolveReadinessFn();
  if (!getEstateReadiness) {
    return NextResponse.json(
      {
        ok: false,
        error: "READINESS_FN_NOT_FOUND",
        ...(process.env.NODE_ENV === "development"
          ? { message: "Could not resolve readiness function export from /lib/estate/readiness" }
          : null),
      },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  try {
    await connectToDatabase();

    await requireEstateAccess({ estateId, userId: session.user.id });

    const readinessRaw = await getEstateReadiness(estateId);
    const readiness =
      readinessRaw && typeof readinessRaw === "object"
        ? (readinessRaw as Record<string, unknown>)
        : null;

    if (!readiness) {
      return NextResponse.json({ ok: false, error: "READINESS_UNAVAILABLE" }, { status: 500, headers: NO_STORE_HEADERS });
    }

    const signals =
      typeof readiness.signals === "object" && readiness.signals !== null
        ? (readiness.signals as Record<string, unknown>)
        : {};

    const missing = Array.isArray(signals.missing) ? signals.missing : [];
    const atRisk = Array.isArray(signals.atRisk) ? signals.atRisk : [];

    const orderedMissing = sortSignals(
      missing.filter((x): x is { severity: string; label: string; count?: number } => {
        return (
          !!x &&
          typeof x === "object" &&
          typeof (x as Record<string, unknown>).severity === "string" &&
          typeof (x as Record<string, unknown>).label === "string"
        );
      }),
    );

    const orderedAtRisk = sortSignals(
      atRisk.filter((x): x is { severity: string; label: string; count?: number } => {
        return (
          !!x &&
          typeof x === "object" &&
          typeof (x as Record<string, unknown>).severity === "string" &&
          typeof (x as Record<string, unknown>).label === "string"
        );
      }),
    );

    const orderedReadiness = {
      ...readiness,
      signals: {
        ...signals,
        missing: orderedMissing,
        atRisk: orderedAtRisk,
      },
    };

    // Persist a lightweight summary for list badges (avoids N+1 readiness calls).
    const scoreRaw = (orderedReadiness as Record<string, unknown>).score;
    const score = typeof scoreRaw === "number" && Number.isFinite(scoreRaw) ? Math.round(scoreRaw) : 0;

    const missingCount = orderedMissing.length;
    const atRiskCount = orderedAtRisk.length;

    await Estate.findByIdAndUpdate(
      estateId,
      {
        $set: {
          readinessSummary: {
            score,
            missingCount,
            atRiskCount,
            updatedAt: new Date(),
          },
        },
      },
      { new: false },
    );

    return NextResponse.json({ ok: true, readiness: orderedReadiness }, { status: 200, headers: NO_STORE_HEADERS });
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN_ERROR";
    const lower = message.toLowerCase();

    if (lower.includes("forbidden") || lower.includes("unauthorized") || lower.includes("not authorized")) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403, headers: NO_STORE_HEADERS });
    }

    if (lower.includes("not found")) {
      return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404, headers: NO_STORE_HEADERS });
    }

    return NextResponse.json(
      {
        ok: false,
        error: "SERVER_ERROR",
        ...(process.env.NODE_ENV === "development" ? { message } : null),
      },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
