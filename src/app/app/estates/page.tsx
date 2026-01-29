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
  readinessScore?: number;
  readinessMissingCount?: number;
  readinessRiskCount?: number;
  readinessUpdatedAt?: string | Date | null;
};

function SearchIcon(props: { className?: string; "aria-hidden"?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden={props["aria-hidden"]}
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

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

type ReadinessSummary = {
  score: number;
  missingCount: number;
  riskCount: number;
  updatedAt?: string | Date | null;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function readinessTone(score: number) {
  if (score >= 85) return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  if (score >= 65) return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  return "border-rose-500/40 bg-rose-500/10 text-rose-200";
}

function ReadinessBadge(props: { summary: ReadinessSummary }) {
  const score = clamp(Math.round(props.summary.score), 0, 100);

  return (
    <span
      className={[
        "inline-flex items-center gap-2 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        readinessTone(score),
      ].join(" ")}
      title={`Readiness: ${score}%. ${props.summary.missingCount} missing, ${props.summary.riskCount} risk${
        props.summary.riskCount === 1 ? "" : "s"
      }.\n\nScore is based on documents, tasks, properties, contacts, and finances.`}
    >
      <span className="tabular-nums">{score}%</span>
      <span className="font-normal normal-case tracking-normal opacity-90">
        {props.summary.missingCount} missing • {props.summary.riskCount} risk{props.summary.riskCount === 1 ? "" : "s"}
      </span>
    </span>
  );
}

function extractReadinessSummary(doc: Record<string, unknown>): ReadinessSummary | null {
  // Supports either `readinessSummary` (preferred) or `readiness` snapshot shapes.
  const summary = doc.readinessSummary as
    | {
        score?: unknown;
        missingCount?: unknown;
        riskCount?: unknown;
        updatedAt?: unknown;
      }
    | undefined;

  const toNum = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

  if (summary) {
    const score = toNum(summary.score);
    const missingCount = toNum(summary.missingCount);
    const riskCount = toNum(summary.riskCount);
    if (score !== null && missingCount !== null && riskCount !== null) {
      const updatedAt =
        typeof summary.updatedAt === "string" || summary.updatedAt instanceof Date
          ? (summary.updatedAt as string | Date)
          : null;

      return {
        score,
        missingCount,
        riskCount,
        updatedAt,
      };
    }
  }

  const readiness = doc.readiness as
    | {
        score?: unknown;
        signals?: {
          missing?: unknown;
          atRisk?: unknown;
        };
        updatedAt?: unknown;
      }
    | undefined;

  if (readiness) {
    const score = toNum(readiness.score);
    const missingArr = Array.isArray(readiness.signals?.missing) ? readiness.signals!.missing! : null;
    const riskArr = Array.isArray(readiness.signals?.atRisk) ? readiness.signals!.atRisk! : null;
    if (score !== null && missingArr && riskArr) {
      const updatedAt =
        typeof readiness.updatedAt === "string" || readiness.updatedAt instanceof Date
          ? (readiness.updatedAt as string | Date)
          : null;

      return {
        score,
        missingCount: missingArr.length,
        riskCount: riskArr.length,
        updatedAt,
      };
    }
  }

  return null;
}

function getParamString(
  params: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string | undefined {
  if (!params) return undefined;
  const v = params[key];
  if (Array.isArray(v)) return v[0];
  return v;
}

function normalizeSearch(s: string | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

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

    const readinessSummary = extractReadinessSummary(doc as unknown as Record<string, unknown>);

    return {
      ...(doc as unknown as Omit<EstateListItem, "_id" | "ownerId">),
      _id: id,
      ownerId,
      readinessScore: readinessSummary?.score,
      readinessMissingCount: readinessSummary?.missingCount,
      readinessRiskCount: readinessSummary?.riskCount,
      readinessUpdatedAt: readinessSummary?.updatedAt ?? null,
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
  const sharedEstates = Array.isArray(estates)
    ? estates.filter((e) => e.ownerId !== session.user.id)
    : [];

  const sharedEstatesCount = sharedEstates.length;

  const createdFlag = getParamString(resolvedSearchParams, "created");
  const isCreated = createdFlag === "1";

  // Server-side search
  const q = normalizeSearch(getParamString(resolvedSearchParams, "q"));

  const visibleEstates = (Array.isArray(estates) ? estates : []).filter((e) => {
    if (!q) return true;

    const haystack = [
      e.name,
      e.estateName,
      e.caseNumber,
      e.courtCaseNumber,
      e.county,
      e.jurisdiction,
      e.lastActivitySummary,
      e.lastActivityType,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(q);
  });

  const hasVisibleEstates = visibleEstates.length > 0;

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
        <div className="rounded-2xl border border-border bg-card p-4 text-xs text-foreground shadow-sm">
          <p className="text-sm font-semibold text-foreground">Quick start</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
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
                  : "border-border bg-muted/20 text-muted-foreground",
              ].join(" ")}
              title={planHint}
            >
              {planLabel}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Matter-centric view of everything tied to each probate estate: properties, tasks, notes,
            invoices, rent, contacts, and documents.
          </p>
        </div>

        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Link
            href="/app"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground shadow-sm hover:bg-muted/40"
          >
            Back to dashboard
          </Link>
          <form
            action="/app/estates"
            method="get"
            className="flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 shadow-sm"
          >
            <SearchIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search estates…"
              className="h-9 w-44 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none sm:w-56"
              aria-label="Search estates"
            />
            <button
              type="submit"
              className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-muted/30 px-2 text-[11px] font-semibold text-foreground hover:bg-muted/50"
            >
              Search
            </button>
          </form>

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
        <div className="rounded-2xl border border-dashed border-border bg-card p-6 shadow-sm sm:p-8">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-muted/30">
              <span className="text-lg">📁</span>
            </div>
            <p className="mt-3 text-sm font-semibold text-foreground">No estates yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
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
                className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground shadow-sm hover:bg-muted/40"
              >
                Go to dashboard
              </Link>
            </div>

            <div className="mt-6 grid gap-3 text-left sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-muted/20 p-4">
                <p className="text-xs font-semibold text-foreground">1) Add details</p>
                <p className="mt-1 text-[11px] text-muted-foreground">Name, case number, county, and status.</p>
              </div>
              <div className="rounded-xl border border-border bg-muted/20 p-4">
                <p className="text-xs font-semibold text-foreground">2) Track work</p>
                <p className="mt-1 text-[11px] text-muted-foreground">Tasks + notes keep everything moving.</p>
              </div>
              <div className="rounded-xl border border-border bg-muted/20 p-4">
                <p className="text-xs font-semibold text-foreground">3) Capture money</p>
                <p className="mt-1 text-[11px] text-muted-foreground">Invoices, rent, and expenses in one place.</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {!hasVisibleEstates ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-6 shadow-sm sm:p-8">
              <div className="mx-auto max-w-2xl text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-muted/30">
                  <span className="text-lg">🔎</span>
                </div>
                <p className="mt-3 text-sm font-semibold text-foreground">No results</p>
                <p className="mt-1 text-xs text-muted-foreground">Try adjusting your search.</p>

                <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
                  <Link
                    href="/app/estates"
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground shadow-sm hover:bg-muted/40"
                  >
                    Clear search
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
              </div>
            </div>
          ) : null}
          <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{visibleEstates.length}</span> estate{visibleEstates.length === 1 ? "" : "s"}
              <span className="mx-2 text-muted-foreground/60">•</span>
              <span className="text-xs text-muted-foreground">
                Owned: <span className="font-semibold text-foreground">{ownedEstatesCount}</span>
                <span className="mx-1 text-muted-foreground/60">·</span>
                Shared: <span className="font-semibold text-foreground">{sharedEstatesCount}</span>
              </span>
              <span className="mx-2 text-muted-foreground/60">•</span>
              <span className="text-xs text-muted-foreground">{planHint}</span>
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
            {visibleEstates.map((estate: EstateListItem) => {
              const id = estate._id;
              const name = estate.name || estate.estateName || "Untitled estate";
              const caseNumber = estate.caseNumber || estate.courtCaseNumber || "—";
              const status = estate.status || "Draft";

              const createdLabel = formatShortDate(estate.createdAt);
              const lastActivityLabel = formatShortDate(estate.lastActivityAt);

              return (
                <div
                  key={id}
                  className="rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:bg-muted/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">{name}</p>
                        {typeof estate.readinessScore === "number" &&
                        typeof estate.readinessMissingCount === "number" &&
                        typeof estate.readinessRiskCount === "number" ? (
                          <ReadinessBadge
                            summary={{
                              score: estate.readinessScore,
                              missingCount: estate.readinessMissingCount,
                              riskCount: estate.readinessRiskCount,
                              updatedAt: estate.readinessUpdatedAt ?? null,
                            }}
                          />
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        <span className="text-muted-foreground">Case:</span> {caseNumber}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        <span className="text-muted-foreground">Created:</span> {createdLabel}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        <span className="text-muted-foreground">Last activity:</span> {lastActivityLabel}
                      </p>
                      {estate.lastActivitySummary ? (
                        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{estate.lastActivitySummary}</p>
                      ) : null}
                      {estate.county || estate.jurisdiction ? (
                        <p className="mt-1 text-xs text-muted-foreground">{estate.county || estate.jurisdiction}</p>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="rounded-full border border-border bg-muted/20 px-2 py-0.5 text-[11px] uppercase tracking-wide text-foreground">
                        {status}
                      </span>
                      <span
                        className={[
                          "rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                          estate.ownerId === session.user.id
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                            : "border-border bg-muted/20 text-muted-foreground",
                        ].join(" ")}
                        title={
                          estate.ownerId === session.user.id
                            ? "You own this estate"
                            : "You’re a collaborator on this estate"
                        }
                      >
                        {estate.ownerId === session.user.id ? "Owner" : "Shared"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      href={`/app/estates/${id}`}
                      className="inline-flex items-center rounded-full border border-border bg-muted/20 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/40"
                    >
                      Open
                    </Link>
                    <Link
                      href={`/app/estates/${id}/tasks`}
                      className="inline-flex items-center rounded-full border border-border bg-muted/20 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    >
                      Tasks
                    </Link>
                    <Link
                      href={`/app/estates/${id}/documents`}
                      className="inline-flex items-center rounded-full border border-border bg-muted/20 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    >
                      Documents
                    </Link>
                    <Link
                      href={`/app/estates/${id}/activity`}
                      className="inline-flex items-center rounded-full border border-border bg-muted/20 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    >
                      Activity
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm sm:block">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Estate</th>
                  <th className="px-4 py-3 font-medium">Case #</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Readiness</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">Last activity</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleEstates.map((estate: EstateListItem) => {
                  const id = estate._id;
                  const name = estate.name || estate.estateName || "Untitled estate";
                  const caseNumber = estate.caseNumber || estate.courtCaseNumber || "—";
                  const status = estate.status || "Draft";

                  const createdLabel = formatShortDate(estate.createdAt);
                  const lastActivityLabel = formatShortDate(estate.lastActivityAt);

                  return (
                    <tr key={id} className="border-t border-border/60 hover:bg-muted/20">
                      <td className="px-4 py-3 align-middle">
                        <div className="flex flex-col">
                          <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                            {name}
                            <span
                              className={[
                                "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                estate.ownerId === session.user.id
                                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                                  : "border-border bg-muted/20 text-muted-foreground",
                              ].join(" ")}
                              title={
                                estate.ownerId === session.user.id
                                  ? "You own this estate"
                                  : "You’re a collaborator on this estate"
                              }
                            >
                              {estate.ownerId === session.user.id ? "Owner" : "Shared"}
                            </span>
                            {typeof estate.readinessScore === "number" &&
                            typeof estate.readinessMissingCount === "number" &&
                            typeof estate.readinessRiskCount === "number" ? (
                              <ReadinessBadge
                                summary={{
                                  score: estate.readinessScore,
                                  missingCount: estate.readinessMissingCount,
                                  riskCount: estate.readinessRiskCount,
                                  updatedAt: estate.readinessUpdatedAt ?? null,
                                }}
                              />
                            ) : null}
                          </span>
                          {estate.county || estate.jurisdiction ? (
                            <span className="text-xs text-muted-foreground">{estate.county || estate.jurisdiction}</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-middle text-sm text-foreground">{caseNumber}</td>
                      <td className="px-4 py-3 align-middle text-xs">
                        <span className="inline-flex min-w-[4.5rem] items-center justify-center rounded-full border border-border bg-muted/20 px-2 py-0.5 text-[11px] uppercase tracking-wide text-foreground">
                          {status}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-middle text-xs">
                        {typeof estate.readinessScore === "number" &&
                        typeof estate.readinessMissingCount === "number" &&
                        typeof estate.readinessRiskCount === "number" ? (
                          <ReadinessBadge
                            summary={{
                              score: estate.readinessScore,
                              missingCount: estate.readinessMissingCount,
                              riskCount: estate.readinessRiskCount,
                              updatedAt: estate.readinessUpdatedAt ?? null,
                            }}
                          />
                        ) : (
                          <span className="inline-flex items-center rounded-full border border-border bg-muted/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-middle text-sm text-foreground">{createdLabel}</td>
                      <td className="px-4 py-3 align-middle">
                        <div className="flex flex-col">
                          <span className="text-sm text-foreground">{lastActivityLabel}</span>
                          {estate.lastActivitySummary ? (
                            <span className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                              {estate.lastActivitySummary}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-middle text-right text-xs">
                        <div className="inline-flex items-center gap-2">
                          <Link
                            href={`/app/estates/${id}`}
                            className="inline-flex items-center rounded-full border border-border bg-muted/20 px-3 py-1 text-[11px] font-medium text-foreground hover:bg-muted/40"
                          >
                            Open
                          </Link>
                          <Link
                            href={`/app/estates/${id}/tasks`}
                            className="inline-flex items-center rounded-full border border-border bg-muted/20 px-3 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                          >
                            Tasks
                          </Link>
                          <Link
                            href={`/app/estates/${id}/documents`}
                            className="inline-flex items-center rounded-full border border-border bg-muted/20 px-3 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                          >
                            Documents
                          </Link>
                          <Link
                            href={`/app/estates/${id}/activity`}
                            className="inline-flex items-center rounded-full border border-border bg-muted/20 px-3 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground"
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