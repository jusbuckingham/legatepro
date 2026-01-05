// src/app/app/estates/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";
import { EstateEvent } from "@/models/EstateEvent";

type EstateListItem = {
  _id: string | { toString(): string };
  name?: string;
  estateName?: string;
  caseNumber?: string;
  courtCaseNumber?: string;
  status?: string;
  createdAt?: string | Date;
  county?: string;
  jurisdiction?: string;
  lastActivityAt?: string | Date | null;
  lastActivitySummary?: string | null;
  lastActivityType?: string | null;
};

function formatShortDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

async function getEstates(userId: string): Promise<EstateListItem[]> {
  await connectToDatabase();

  // Show estates the user owns OR collaborates on
  const estates = await Estate.find({
    $or: [{ ownerId: userId }, { "collaborators.userId": userId }],
  })
    .sort({ createdAt: -1 })
    .lean();

  const estateItems = estates as EstateListItem[];

  const estateIds = estateItems
    .map((e) => (typeof e._id === "string" ? e._id : e._id?.toString?.() ?? ""))
    .filter((id): id is string => Boolean(id));

  if (estateIds.length === 0) return estateItems;

  // EstateEvent.estateId is stored as a string in this project
  const events = await EstateEvent.find(
    { estateId: { $in: estateIds } },
    { estateId: 1, createdAt: 1, summary: 1, type: 1 }
  )
    .sort({ createdAt: -1 })
    .lean()
    .exec();

  const latestByEstateId = new Map<string, { createdAt?: string | Date | null; summary?: string | null; type?: string | null }>();

  for (const ev of events) {
    const evEstateId = typeof (ev as { estateId?: unknown }).estateId === "string" ? (ev as { estateId: string }).estateId : null;
    if (!evEstateId) continue;
    if (latestByEstateId.has(evEstateId)) continue;

    latestByEstateId.set(evEstateId, {
      createdAt: (ev as { createdAt?: string | Date | null }).createdAt ?? null,
      summary: (ev as { summary?: string | null }).summary ?? null,
      type: (ev as { type?: string | null }).type ?? null,
    });
  }

  return estateItems.map((e) => {
    const id = typeof e._id === "string" ? e._id : e._id?.toString?.() ?? "";
    const latest = latestByEstateId.get(id);
    return {
      ...e,
      lastActivityAt: latest?.createdAt ?? null,
      lastActivitySummary: latest?.summary ?? null,
      lastActivityType: latest?.type ?? null,
    };
  });
}

export default async function EstatesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/app/estates");

  const estates = await getEstates(session.user.id);

  const hasEstates = Array.isArray(estates) && estates.length > 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Estates</h2>
          <p className="text-sm text-slate-400">
            Matter-centric view of everything tied to each probate estate: properties, tasks, notes,
            invoices, rent, contacts, and documents.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Link
            href="/app"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-800 bg-slate-950/40 px-4 text-sm font-medium text-slate-200 shadow-sm hover:bg-slate-900/40"
          >
            Back to dashboard
          </Link>
          <Link
            href="/app/estates/new"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-500 bg-emerald-500/10 px-4 text-sm font-medium text-emerald-200 shadow-sm hover:bg-emerald-500/20"
          >
            + Create estate
          </Link>
        </div>
      </header>

      {!hasEstates ? (
        <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/60 p-6 shadow-sm sm:p-8">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/40">
              <span className="text-lg">📁</span>
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-100">No estates yet</p>
            <p className="mt-1 text-xs text-slate-400">
              Start by creating an estate. Then track tasks, notes, documents, invoices, rent, and contacts in one place.
            </p>

            <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
              <Link
                href="/app/estates/new"
                className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-500 bg-emerald-500/10 px-4 text-sm font-medium text-emerald-200 shadow-sm hover:bg-emerald-500/20"
              >
                + Create your first estate
              </Link>
              <Link
                href="/app"
                className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-800 bg-slate-950/40 px-4 text-sm font-medium text-slate-200 shadow-sm hover:bg-slate-900/40"
              >
                Go to dashboard
              </Link>
            </div>

            <div className="mt-6 grid gap-3 text-left sm:grid-cols-3">
              <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
                <p className="text-xs font-semibold text-slate-100">1) Add details</p>
                <p className="mt-1 text-[11px] text-slate-400">Name, case number, county, and status.</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
                <p className="text-xs font-semibold text-slate-100">2) Track work</p>
                <p className="mt-1 text-[11px] text-slate-400">Tasks + notes keep everything moving.</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
                <p className="text-xs font-semibold text-slate-100">3) Capture money</p>
                <p className="mt-1 text-[11px] text-slate-400">Invoices, rent, and expenses in one place.</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 shadow-sm">
            <p className="text-sm text-slate-200">
              <span className="font-semibold text-slate-100">{estates.length}</span> estate{estates.length === 1 ? "" : "s"}
            </p>
            <Link
              href="/app/estates/new"
              className="inline-flex h-9 items-center justify-center rounded-xl border border-emerald-500 bg-emerald-500/10 px-3 text-xs font-medium text-emerald-200 shadow-sm hover:bg-emerald-500/20"
            >
              + New estate
            </Link>
          </div>
          {/* Mobile cards */}
          <div className="grid gap-3 sm:hidden">
            {estates.map((estate: EstateListItem) => {
              const id = estate._id?.toString?.() ?? String(estate._id ?? "");
              const name = estate.name || estate.estateName || "Untitled estate";
              const caseNumber = estate.caseNumber || estate.courtCaseNumber || "—";
              const status = estate.status || "Draft";

              const createdLabel = formatShortDate(estate.createdAt);
              const lastActivityLabel = formatShortDate(estate.lastActivityAt);

              return (
                <div key={id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 shadow-sm transition hover:bg-slate-900/30">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-100">{name}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        <span className="text-slate-500">Case:</span> {caseNumber}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        <span className="text-slate-500">Created:</span> {createdLabel}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        <span className="text-slate-500">Last activity:</span> {lastActivityLabel}
                      </p>
                      {estate.lastActivitySummary ? (
                        <p className="mt-1 line-clamp-1 text-xs text-slate-500">
                          {estate.lastActivitySummary}
                        </p>
                      ) : null}
                      {estate.county || estate.jurisdiction ? (
                        <p className="mt-1 text-xs text-slate-500">{estate.county || estate.jurisdiction}</p>
                      ) : null}
                    </div>

                    <span className="shrink-0 rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] uppercase tracking-wide text-slate-200">
                      {status}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      href={`/app/estates/${id}`}
                      className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/40 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-900/70"
                    >
                      Open
                    </Link>
                    <Link
                      href={`/app/estates/${id}/tasks`}
                      className="inline-flex items-center rounded-full border border-slate-800 bg-slate-950/40 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-900/40"
                    >
                      Tasks
                    </Link>
                    <Link
                      href={`/app/estates/${id}/documents`}
                      className="inline-flex items-center rounded-full border border-slate-800 bg-slate-950/40 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-900/40"
                    >
                      Documents
                    </Link>
                    <Link
                      href={`/app/estates/${id}/activity`}
                      className="inline-flex items-center rounded-full border border-slate-800 bg-slate-950/40 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-900/40"
                    >
                      Activity
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60 shadow-sm sm:block">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-800 bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Estate</th>
                  <th className="px-4 py-3 font-medium">Case #</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">Last activity</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {estates.map((estate: EstateListItem) => {
                  const id = estate._id?.toString?.() ?? String(estate._id ?? "");
                  const name = estate.name || estate.estateName || "Untitled estate";
                  const caseNumber = estate.caseNumber || estate.courtCaseNumber || "—";
                  const status = estate.status || "Draft";

                  const createdLabel = formatShortDate(estate.createdAt);
                  const lastActivityLabel = formatShortDate(estate.lastActivityAt);

                  return (
                    <tr key={id} className="border-t border-slate-900/80 hover:bg-slate-900/40">
                      <td className="px-4 py-3 align-middle">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-slate-100">{name}</span>
                          {estate.county || estate.jurisdiction ? (
                            <span className="text-xs text-slate-500">{estate.county || estate.jurisdiction}</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-middle text-sm text-slate-300">{caseNumber}</td>
                      <td className="px-4 py-3 align-middle text-xs">
                        <span className="inline-flex min-w-[4.5rem] items-center justify-center rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] uppercase tracking-wide text-slate-200">
                          {status}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-middle text-sm text-slate-300">{createdLabel}</td>
                      <td className="px-4 py-3 align-middle">
                        <div className="flex flex-col">
                          <span className="text-sm text-slate-300">{lastActivityLabel}</span>
                          {estate.lastActivitySummary ? (
                            <span className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">
                              {estate.lastActivitySummary}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-middle text-right text-xs">
                        <div className="inline-flex items-center gap-2">
                          <Link
                            href={`/app/estates/${id}`}
                            className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950/40 px-3 py-1 text-[11px] font-medium text-slate-100 hover:bg-slate-900"
                          >
                            Open
                          </Link>
                          <Link
                            href={`/app/estates/${id}/tasks`}
                            className="inline-flex items-center rounded-full border border-slate-800 bg-slate-950/40 px-3 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-900"
                          >
                            Tasks
                          </Link>
                          <Link
                            href={`/app/estates/${id}/documents`}
                            className="inline-flex items-center rounded-full border border-slate-800 bg-slate-950/40 px-3 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-900"
                          >
                            Documents
                          </Link>
                          <Link
                            href={`/app/estates/${id}/activity`}
                            className="inline-flex items-center rounded-full border border-slate-800 bg-slate-950/40 px-3 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-900"
                          >
                            Activity
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}