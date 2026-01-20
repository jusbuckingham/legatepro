import Link from "next/link";

import type { EstateReadinessResult, ReadinessSignal } from "@/lib/estate/readiness";

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

function severityClasses(sev: ReadinessSignal["severity"]) {
  switch (sev) {
    case "high":
      return "border-rose-500/30 bg-rose-500/10 text-rose-100";
    case "medium":
      return "border-amber-500/30 bg-amber-500/10 text-amber-100";
    default:
      return "border-slate-800 bg-slate-950/40 text-slate-200";
  }
}

function scoreTone(score: number) {
  if (score >= 85) return "text-emerald-200";
  if (score >= 65) return "text-amber-200";
  return "text-rose-200";
}

export default function EstateReadinessCard(props: {
  estateId: string;
  readiness: EstateReadinessResult | null;
}) {
  const { estateId, readiness } = props;

  if (!readiness) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Estate readiness
            </div>
            <div className="mt-1 text-sm text-slate-200">Loading readiness…</div>
          </div>
          <div className="h-10 w-20 animate-pulse rounded-lg bg-slate-800" />
        </div>
      </section>
    );
  }

  const score = clamp(Math.round(readiness.score), 0, 100);
  const missingCount = readiness.signals.missing.length;
  const riskCount = readiness.signals.atRisk.length;

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Estate readiness
            </div>
            <span className="inline-flex items-center rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5 text-[11px] text-slate-300">
              {riskCount} risk{riskCount === 1 ? "" : "s"} • {missingCount} missing
            </span>
          </div>

          <p className="mt-1 text-xs text-slate-400">
            A quick signal of completeness across documents, tasks, properties, contacts, and finances.
          </p>

          <div className="mt-3 grid gap-2">
            {MODULES.map(({ key, label }) => {
              const item = readiness.breakdown[key];
              const pct =
                item.max > 0 ? clamp(Math.round((item.score / item.max) * 100), 0, 100) : 0;

              return (
                <div key={key} className="grid grid-cols-[90px,1fr,42px] items-center gap-2">
                  <div className="text-[11px] text-slate-300">{label}</div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-900">
                    <div
                      className="h-full rounded-full bg-emerald-500/50"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="text-right text-[11px] text-slate-400">{pct}%</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className={`text-4xl font-semibold leading-none ${scoreTone(score)}`}>{score}%</div>
          <Link
            href={`/app/estates/${encodeURIComponent(estateId)}/documents`}
            className="text-[11px] text-slate-400 hover:text-slate-200"
          >
            Improve readiness →
          </Link>
        </div>
      </div>

      {(missingCount > 0 || riskCount > 0) && (
        <details className="mt-4 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <summary className="cursor-pointer text-xs font-medium text-slate-200">
            Why this score?
            <span className="ml-2 text-[11px] font-normal text-slate-400">
              View missing and at-risk items
            </span>
          </summary>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Missing
              </div>
              {missingCount === 0 ? (
                <div className="mt-2 text-xs text-slate-500">Nothing missing detected.</div>
              ) : (
                <ul className="mt-2 space-y-1">
                  {readiness.signals.missing.slice(0, 6).map((s) => (
                    <li
                      key={s.key}
                      className={`rounded-md border px-2 py-1 text-xs ${severityClasses(s.severity)}`}
                    >
                      {s.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                At risk
              </div>
              {riskCount === 0 ? (
                <div className="mt-2 text-xs text-slate-500">No risks detected.</div>
              ) : (
                <ul className="mt-2 space-y-1">
                  {readiness.signals.atRisk.slice(0, 6).map((s) => (
                    <li
                      key={s.key}
                      className={`rounded-md border px-2 py-1 text-xs ${severityClasses(s.severity)}`}
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