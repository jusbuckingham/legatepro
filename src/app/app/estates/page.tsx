// src/app/app/estates/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";
import EstateEvent from "@/models/EstateEvent";
import { User } from "@/models/User";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EstateListItem = {
  _id: string;
  ownerId?: string;
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

type EstateEventLean = {
  estateId: string;
  createdAt: string | Date | null;
  summary: string | null;
  type: string | null;
};

async function getEstates(userId: string): Promise<EstateListItem[]> {
  await connectToDatabase();

  // Show estates the user owns OR collaborates on
  const estates = await Estate.find({
    $or: [{ ownerId: userId }, { "collaborators.userId": userId }],
  })
    .sort({ createdAt: -1 })
    .lean()
    .exec();

  type EstateLeanDoc = Record<string, unknown> & {
    _id?: unknown;
    ownerId?: unknown;
  };

  const estateItems: EstateListItem[] = (estates as unknown as EstateLeanDoc[]).map((doc) => {
    const rawId = doc._id;
    const id =
      typeof rawId === "string"
        ? rawId
        : String((rawId as { toString?: () => string })?.toString?.() ?? "");

    const rawOwnerId = doc.ownerId;
    const ownerId =
      typeof rawOwnerId === "string"
        ? rawOwnerId
        : rawOwnerId
          ? String((rawOwnerId as { toString?: () => string })?.toString?.() ?? "")
          : undefined;

    return {
      ...(doc as unknown as Omit<EstateListItem, "_id" | "ownerId">),
      _id: id,
      ownerId,
    };
  });

  const estateIds = estateItems.map((e) => e._id).filter(Boolean);

  if (estateIds.length === 0) return estateItems;

  // EstateEvent.estateId is stored as a string in this project
  const events = (await EstateEvent.find(
    { estateId: { $in: estateIds } },
    { estateId: 1, createdAt: 1, summary: 1, type: 1 }
  )
    .sort({ createdAt: -1 })
    .lean()
    .exec()) as unknown as EstateEventLean[];

  const latestByEstateId = new Map<
    string,
    { createdAt: string | Date | null; summary: string | null; type: string | null }
  >();

  for (const ev of events) {
    const evEstateId = typeof ev.estateId === "string" ? ev.estateId : "";
    if (!evEstateId) continue;
    if (latestByEstateId.has(evEstateId)) continue;

    latestByEstateId.set(evEstateId, {
      createdAt: ev.createdAt ?? null,
      summary: ev.summary ?? null,
      type: ev.type ?? null,
    });
  }

  return estateItems.map((e) => {
    const id = e._id;
    const latest = latestByEstateId.get(id);
    return {
      ...e,
      lastActivityAt: latest?.createdAt ?? null,
      lastActivitySummary: latest?.summary ?? null,
      lastActivityType: latest?.type ?? null,
    };
  });
}

export default async function EstatesPage({
  searchParams,
}: {
  // Next.js (App Router) may provide `searchParams` as a Promise in newer versions.
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  const session = await auth();
  if (!session?.user?.id) redirect(`/login?callbackUrl=${encodeURIComponent("/app/estates")}`);

  // Load estates defensively so a transient DB error doesn't white-screen the app.
  let estates: EstateListItem[] = [];
  let estatesLoadError: string | null = null;
  try {
    estates = await getEstates(session.user.id);
  } catch (err) {
    console.error("[EstatesPage] getEstates failed:", err);
    estatesLoadError = "We couldn’t load your estates right now. Please refresh and try again.";
    estates = [];
  }

  const ownedEstates = Array.isArray(estates)
    ? estates.filter((e) => e.ownerId === session.user.id)
    : [];

  // --- Billing enforcement (UI) ---
  // Free plan: 1 owned estate max. Pro: unlimited. Collaborator estates do NOT count toward the limit.
  // Note: `getEstates()` already connects to the DB.
  type UserBillingLean = { subscriptionPlanId?: unknown; subscriptionStatus?: unknown };
  let user: UserBillingLean | null = null;
  try {
    user = (await User.findById(session.user.id).lean().exec()) as UserBillingLean | null;
  } catch (err) {
    console.error("[EstatesPage] User lookup failed:", err);
    user = null;
  }

  // Default to free if we can't load the user for any reason.
  const rawPlanId = (user as unknown as { subscriptionPlanId?: unknown } | null)?.subscriptionPlanId;
  const rawStatus = (user as unknown as { subscriptionStatus?: unknown } | null)?.subscriptionStatus;

  const planId = typeof rawPlanId === "string" ? rawPlanId.toLowerCase() : "free";
  const status = typeof rawStatus === "string" ? rawStatus.toLowerCase() : null;

  // Stripe-like statuses that should be treated as Pro access.
  const PRO_STATUSES = new Set(["active", "trialing", "past_due"]);
  const isPro = planId === "pro" || status === "pro" || (status ? PRO_STATUSES.has(status) : false);

  // Free plan: 1 *owned* estate max. Collaborator estates do NOT count toward the limit.
  // We already fetched all estates above, so we can compute the owned count without another DB round-trip.
  const ownedEstatesCount = ownedEstates.length;

  const hasEstates = Array.isArray(estates) && estates.length > 0;
  const hasReachedFreeLimit = !isPro && ownedEstatesCount >= 1;

  const planLabel = isPro ? "Pro" : "Starter";
  const planHint = isPro
    ? "Unlimited estates"
    : hasReachedFreeLimit
      ? `Free plan: 1/1 estates used`
      : "Free plan: 1 estate included";

  const showUserLoadWarning = !user;
  // --- End billing enforcement (UI) ---

  const createdFlag = resolvedSearchParams?.created;
  const isCreated = Array.isArray(createdFlag) ? createdFlag.includes("1") : createdFlag === "1";

  const hasAnyActivity = Array.isArray(estates)
    ? estates.some((e) => Boolean(e.lastActivityAt || e.lastActivitySummary))
    : false;

  const newestEstateId = ownedEstates[0]?._id ?? estates[0]?._id;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      {estatesLoadError ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-100 shadow-sm">
          <p className="text-sm font-semibold text-rose-100">Estates temporarily unavailable</p>
          <p className="mt-0.5 text-[11px] text-rose-100/80">{estatesLoadError}</p>
        </div>
      ) : null}

      {showUserLoadWarning ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-100 shadow-sm">
          <p className="text-sm font-semibold text-amber-100">Account lookup warning</p>
          <p className="mt-0.5 text-[11px] text-amber-100/80">
            We couldn’t load your user record. Billing enforcement will default to Starter until this is resolved.
          </p>
        </div>
      ) : null}

      {isCreated ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-100 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-emerald-100">Estate created</p>
              <p className="mt-0.5 text-[11px] text-emerald-100/80">
                Next: open the estate to add tasks, documents, invoices, rent, and contacts.
              </p>
            </div>
            {hasEstates ? (
              <Link
                href={newestEstateId ? `/app/estates/${newestEstateId}` : "/app/estates"}
                className="inline-flex h-9 items-center justify-center rounded-xl bg-emerald-500 px-3 text-xs font-semibold text-slate-950 shadow-sm hover:bg-emerald-400"
              >
                Open newest estate
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      {hasEstates && !hasAnyActivity ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-xs text-slate-200 shadow-sm">
          <p className="text-sm font-semibold text-slate-100">Quick start</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Add your first task or invoice and this page will start showing recent activity.
          </p>
        </div>
      ) : null}

      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold tracking-tight">Estates</h2>
            <span
              className={[
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                isPro
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                  : "border-slate-700 bg-slate-950/40 text-slate-300",
              ].join(" ")}
              title={planHint}
            >
              {planLabel}
            </span>
          </div>
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

          {!hasReachedFreeLimit ? (
            <Link
              href="/app/estates/new"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-500 bg-emerald-500/10 px-4 text-sm font-medium text-emerald-200 shadow-sm hover:bg-emerald-500/20"
            >
              + Create estate
            </Link>
          ) : (
            <Link
              href="/app/billing?reason=estate_limit"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-[#F15A43] bg-[#F15A43]/10 px-4 text-sm font-medium text-[#F15A43] shadow-sm hover:bg-[#F15A43]/20"
            >
              Upgrade to add more estates
            </Link>
          )}
        </div>
      </header>

      {hasReachedFreeLimit ? (
        <div className="rounded-2xl border border-[#F15A43]/40 bg-[#F15A43]/10 p-4 text-xs text-slate-100 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-100">You’ve reached the free plan limit</p>
              <p className="mt-0.5 text-[11px] text-slate-200/80">
                Starter includes <span className="font-semibold">1 owned estate</span>. Upgrade to Pro to create more estates.
              </p>
            </div>
            <Link
              href="/app/billing?reason=estate_limit"
              className="inline-flex h-9 items-center justify-center rounded-xl border border-[#F15A43] bg-[#F15A43] px-3 text-xs font-semibold text-slate-950 shadow-sm hover:bg-[#f26b56]"
            >
              Upgrade to Pro
            </Link>
          </div>
        </div>
      ) : null}

      {!hasEstates ? (
        <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/60 p-6 shadow-sm sm:p-8">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/40">
              <span className="text-lg">📁</span>
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-100">No estates yet</p>
            <p className="mt-1 text-xs text-slate-400">
              Start by creating an estate. Then track tasks, notes, documents, invoices, rent, and contacts in one place.
              {hasReachedFreeLimit ? (
                <span className="block pt-1 text-[#F15A43]">You’ve reached the Starter limit (1 owned estate). Upgrade to add more.</span>
              ) : null}
            </p>

            <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
              {!hasReachedFreeLimit ? (
                <Link
                  href="/app/estates/new"
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-500 bg-emerald-500/10 px-4 text-sm font-medium text-emerald-200 shadow-sm hover:bg-emerald-500/20"
                >
                  + Create your first estate
                </Link>
              ) : (
                <Link
                  href="/app/billing?reason=estate_limit"
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-[#F15A43] bg-[#F15A43]/10 px-4 text-sm font-medium text-[#F15A43] shadow-sm hover:bg-[#F15A43]/20"
                >
                  Upgrade to add more estates
                </Link>
              )}
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
              <span className="mx-2 text-slate-600">•</span>
              <span className="text-xs text-slate-400">{planHint}</span>
            </p>
            {!hasReachedFreeLimit ? (
              <Link
                href="/app/estates/new"
                className="inline-flex h-9 items-center justify-center rounded-xl border border-emerald-500 bg-emerald-500/10 px-3 text-xs font-medium text-emerald-200 shadow-sm hover:bg-emerald-500/20"
              >
                + New estate
              </Link>
            ) : (
              <Link
                href="/app/billing?reason=estate_limit"
                className="inline-flex h-9 items-center justify-center rounded-xl border border-[#F15A43] bg-[#F15A43]/10 px-3 text-xs font-medium text-[#F15A43] shadow-sm hover:bg-[#F15A43]/20"
              >
                Upgrade to add more estates
              </Link>
            )}
          </div>

          {/* Mobile cards */}
          <div className="grid gap-3 sm:hidden">
            {estates.map((estate: EstateListItem) => {
              const id = estate._id;
              const name = estate.name || estate.estateName || "Untitled estate";
              const caseNumber = estate.caseNumber || estate.courtCaseNumber || "—";
              const status = estate.status || "Draft";

              const createdLabel = formatShortDate(estate.createdAt);
              const lastActivityLabel = formatShortDate(estate.lastActivityAt);

              return (
                <div
                  key={id}
                  className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 shadow-sm transition hover:bg-slate-900/30"
                >
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
                        <p className="mt-1 line-clamp-1 text-xs text-slate-500">{estate.lastActivitySummary}</p>
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
                  const id = estate._id;
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