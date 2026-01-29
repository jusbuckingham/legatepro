import Link from "next/link";
import { cookies, headers } from "next/headers";

import { safeJson } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = {
  title: "Utility | LegatePro",
};

type CookieLike = { getAll(): Array<{ name: string; value: string }> };
type HeaderLike = { get(name: string): string | null };
function getCookieHeader(cookieStore: CookieLike): string {
  const parts = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`);
  return parts.join("; ");
}

type PageProps = {
  params: Promise<{
    estateId: string;
    propertyId: string;
    utilityId: string;
  }>;
};

type UtilityApiResponse = {
  ok: boolean;
  utility?: Record<string, unknown>;
  error?: string;
};

type UtilityFetchResult =
  | { kind: "ok"; utility: Record<string, unknown> }
  | { kind: "not_found"; message?: string }
  | { kind: "unauthorized"; message?: string }
  | { kind: "forbidden"; message?: string }
  | { kind: "error"; message?: string };

type Breadcrumb = { href: string; label: string };

function buildCrumbs(
  estateId: string,
  propertyId: string,
  utilitiesHref: string,
  detailHref: string,
): Breadcrumb[] {
  return [
    { href: "/app/estates", label: "Estates" },
    { href: `/app/estates/${estateId}`, label: "Overview" },
    { href: `/app/estates/${estateId}/properties/${propertyId}`, label: "Property" },
    { href: utilitiesHref, label: "Utilities" },
    { href: detailHref, label: "Details" },
  ];
}

type StateLayoutProps = {
  title: string;
  description: string;
  crumbs: Breadcrumb[];
  primaryCta?: { href: string; label: string };
  secondaryCta?: { href: string; label: string };
};

function StateLayout({ title, description, crumbs, primaryCta, secondaryCta }: StateLayoutProps) {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <nav className="text-xs text-slate-500">
        {crumbs.map((c, idx) => (
          <span key={`${c.href}-${idx}`}>
            <Link
              href={c.href}
              className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
            >
              {c.label}
            </Link>
            {idx < crumbs.length - 1 ? <span className="mx-1 text-slate-600">/</span> : null}
          </span>
        ))}
      </nav>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-6 shadow-sm shadow-rose-950/30">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-50">{title}</h1>
        <p className="mt-2 text-sm text-slate-400">{description}</p>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {primaryCta ? (
            <Link
              href={primaryCta.href}
              className="inline-flex items-center justify-center rounded-md border border-rose-500/60 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-rose-100 hover:bg-rose-500/20"
            >
              {primaryCta.label}
            </Link>
          ) : null}

          {secondaryCta ? (
            <Link
              href={secondaryCta.href}
              className="inline-flex items-center justify-center rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/40"
            >
              {secondaryCta.label}
            </Link>
          ) : null}

          {!primaryCta && !secondaryCta ? (
            <Link
              href={crumbs[crumbs.length - 2]?.href ?? "/app/estates"}
              className="inline-flex items-center justify-center rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/40"
            >
              Back
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function getRequestBaseUrl(hdrs: HeaderLike): string {
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
  return host ? `${proto}://${host}` : "";
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function formatMoney(value: unknown): string | undefined {
  const n = asNumber(value);
  if (n === undefined) return undefined;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

function formatDate(value: unknown): string | undefined {
  const s = asString(value);
  if (!s) return undefined;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function isTruthyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function statusTone(status: string | undefined): "emerald" | "amber" | "rose" | "slate" {
  const s = (status ?? "").toLowerCase();
  if (!s) return "slate";
  if (s.includes("paid") || s.includes("current") || s.includes("active") || s.includes("ok")) return "emerald";
  if (s.includes("pending") || s.includes("due") || s.includes("warning")) return "amber";
  if (s.includes("past") || s.includes("over") || s.includes("late") || s.includes("delin") || s.includes("shut")) return "rose";
  return "slate";
}

function StatusPill({ value }: { value?: string }) {
  const tone = statusTone(value);
  const base = "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]";
  if (!value) {
    return (
      <span className={`${base} border-slate-800 bg-slate-950 text-slate-300`}>Not set</span>
    );
  }
  if (tone === "emerald") {
    return (
      <span className={`${base} border-emerald-500/40 bg-emerald-500/10 text-emerald-200`}>{value}</span>
    );
  }
  if (tone === "amber") {
    return (
      <span className={`${base} border-amber-500/40 bg-amber-500/10 text-amber-200`}>{value}</span>
    );
  }
  if (tone === "rose") {
    return (
      <span className={`${base} border-rose-500/40 bg-rose-500/10 text-rose-200`}>{value}</span>
    );
  }
  return <span className={`${base} border-slate-800 bg-slate-950 text-slate-300`}>{value}</span>;
}

function safeExternalUrl(raw: unknown): string | null {
  if (!isTruthyString(raw)) return null;
  const v = raw.trim();
  if (!/^https?:\/\//i.test(v)) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

async function fetchUtility(utilityId: string): Promise<UtilityFetchResult> {
  // Prefer a single-source utility endpoint. This keeps the page resilient even if
  // estate/property scoping is handled server-side.
  const hdrs = await headers();
  const cookieStore = await cookies();

  const baseUrl = getRequestBaseUrl(hdrs);
  const endpoint = `/api/utilities/${encodeURIComponent(utilityId)}`;
  const url = baseUrl ? `${baseUrl}${endpoint}` : endpoint;

  const cookieHeader = getCookieHeader(cookieStore);
  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: {
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
      ...(hdrs.get("user-agent") ? { "user-agent": hdrs.get("user-agent") ?? "" } : {}),
      accept: "application/json",
    },
  });

  if (res.status === 404) {
    const data = (await safeJson(res)) as UtilityApiResponse | null;
    const msg = data && typeof data === "object" ? asString((data as UtilityApiResponse).error) : undefined;
    return { kind: "not_found", message: msg };
  }

  // Explicitly handle auth-related responses so the UI can message clearly.
  if (res.status === 401) {
    const data = (await safeJson(res)) as UtilityApiResponse | null;
    const msg = data && typeof data === "object" ? asString((data as UtilityApiResponse).error) : undefined;
    return { kind: "unauthorized", message: msg };
  }

  if (res.status === 403) {
    const data = (await safeJson(res)) as UtilityApiResponse | null;
    const msg = data && typeof data === "object" ? asString((data as UtilityApiResponse).error) : undefined;
    return { kind: "forbidden", message: msg };
  }

  const data = (await safeJson(res)) as UtilityApiResponse | null;

  if (!data || typeof data !== "object") return { kind: "error" };

  if (data.ok === false) {
    const msg = asString(data.error);
    // Some endpoints may return ok:false with 401/403 but without status codes.
    if (msg?.toLowerCase().includes("unauthorized") || msg?.toLowerCase().includes("sign in")) {
      return { kind: "unauthorized", message: msg };
    }
    if (msg?.toLowerCase().includes("forbidden") || msg?.toLowerCase().includes("permission")) {
      return { kind: "forbidden", message: msg };
    }
    return { kind: "error", message: msg };
  }

  const u = data.utility;
  if (!u || typeof u !== "object") return { kind: "not_found", message: "Utility record missing." };

  return { kind: "ok", utility: u };
}

export default async function UtilityDetailPage({ params }: PageProps) {
  const { estateId, propertyId, utilityId } = await params;

  const result = await fetchUtility(utilityId);

  const utilitiesHref = `/app/estates/${estateId}/properties/${propertyId}/utilities`;
  const detailHref = `${utilitiesHref}/${utilityId}`;
  const crumbs = buildCrumbs(estateId, propertyId, utilitiesHref, detailHref);

  if (result.kind === "not_found") {
    return (
      <StateLayout
        title="Utility not found"
        description={result.message ?? "This utility doesn’t exist, or it may have been deleted."}
        crumbs={crumbs}
        primaryCta={{ href: `${utilitiesHref}/new`, label: "Add utility" }}
        secondaryCta={{ href: utilitiesHref, label: "Back to utilities" }}
      />
    );
  }

  if (result.kind === "unauthorized") {
    return (
      <StateLayout
        title="Sign in required"
        description={
          result.message ?? "Your session may have expired. Please sign in again to view this utility."
        }
        crumbs={crumbs}
        primaryCta={{ href: `/api/auth/signin?callbackUrl=${encodeURIComponent(detailHref)}`, label: "Sign in" }}
        secondaryCta={{ href: utilitiesHref, label: "Back to utilities" }}
      />
    );
  }

  if (result.kind === "forbidden") {
    return (
      <StateLayout
        title="Access denied"
        description={result.message ?? "You don’t have permission to view this utility."}
        crumbs={crumbs}
        primaryCta={{
          href: `/app/estates/${estateId}/collaborators?${new URLSearchParams({ request: "EDITOR", from: "utility", utilityId }).toString()}`,
          label: "Request access",
        }}
        secondaryCta={{ href: utilitiesHref, label: "Back to utilities" }}
      />
    );
  }

  if (result.kind === "error") {
    return (
      <StateLayout
        title="Unable to load utility"
        description={result.message ?? "Something went wrong while loading this utility."}
        crumbs={crumbs}
        primaryCta={{ href: detailHref, label: "Retry" }}
        secondaryCta={{ href: utilitiesHref, label: "Back to utilities" }}
      />
    );
  }

  const utility = result.utility;

  const name =
    asString(utility.name) ||
    asString(utility.label) ||
    asString(utility.title) ||
    "Utility";

  const provider = asString(utility.provider) || asString(utility.company) || asString(utility.vendor);
  const accountNumber = asString(utility.accountNumber) || asString(utility.account) || asString(utility.accountId);
  const status = asString(utility.status);
  const amount = formatMoney(utility.amount ?? utility.balance ?? utility.monthlyAmount);
  const dueDate = formatDate(utility.dueDate ?? utility.nextDueDate);
  const createdAt = formatDate(utility.createdAt);
  const updatedAt = formatDate(utility.updatedAt);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="space-y-4">
        <nav className="text-xs text-slate-500">
          <Link
            href="/app/estates"
            className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
          >
            Estates
          </Link>
          <span className="mx-1 text-slate-600">/</span>
          <Link
            href={`/app/estates/${estateId}`}
            className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
          >
            Overview
          </Link>
          <span className="mx-1 text-slate-600">/</span>
          <Link
            href={`/app/estates/${estateId}/properties/${propertyId}`}
            className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
          >
            Property
          </Link>
          <span className="mx-1 text-slate-600">/</span>
          <Link
            href={`/app/estates/${estateId}/properties/${propertyId}/utilities`}
            className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
          >
            Utilities
          </Link>
          <span className="mx-1 text-slate-600">/</span>
          <span className="text-rose-300">{name}</span>
        </nav>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Utility</span>
              <StatusPill value={status} />
              {provider ? (
                <span className="rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.2em] text-slate-300">
                  Provider: {provider}
                </span>
              ) : null}
            </div>

            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-50">{name}</h1>
            <p className="mt-1 text-sm text-slate-400">
              Utility details and notes for this property.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Link
              href={`/app/estates/${estateId}/properties/${propertyId}/utilities`}
              className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-1.5 font-medium text-slate-200 hover:border-rose-500/70 hover:text-rose-100"
            >
              Back to utilities
            </Link>
            <Link
              href={`/app/estates/${estateId}/properties/${propertyId}/utilities/new`}
              className="rounded-lg bg-rose-600 px-3 py-1.5 font-semibold text-white hover:bg-rose-500"
            >
              Add utility
            </Link>
          </div>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Status</p>
          <div className="mt-1">
            <StatusPill value={status} />
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Amount</p>
          <p className="mt-1 text-sm font-medium text-slate-50">{amount ?? "—"}</p>
          {dueDate ? <p className="mt-1 text-xs text-slate-500">Due {dueDate}</p> : null}
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Account</p>
          <p className="mt-1 text-sm font-medium text-slate-50">{accountNumber ?? "—"}</p>
          {provider ? <p className="mt-1 text-xs text-slate-500">Provider: {provider}</p> : null}
          {(() => {
            const portal = safeExternalUrl((utility as Record<string, unknown>).portalUrl ?? (utility as Record<string, unknown>).url);
            if (!portal) return null;
            return (
              <p className="mt-1 text-xs">
                <a
                  href={portal}
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-400 hover:text-emerald-300 underline-offset-2 hover:underline"
                >
                  Open provider portal
                </a>
              </p>
            );
          })()}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
          {!provider && !accountNumber && !status && !amount && !dueDate ? (
            <div className="mb-3 rounded-lg border border-dashed border-slate-800 bg-slate-900/40 p-3 text-sm text-slate-300">
              This utility has very little detail yet. Add provider/account info and a balance or due date when available.
            </div>
          ) : null}
          <h2 className="mb-3 text-sm font-semibold text-slate-100">Details</h2>

          <dl className="space-y-3">
            {status ? (
              <div className="flex items-start justify-between gap-3">
                <dt className="text-sm text-slate-400">Status</dt>
                <dd className="text-sm font-medium text-slate-100">{status}</dd>
              </div>
            ) : null}

            {amount ? (
              <div className="flex items-start justify-between gap-3">
                <dt className="text-sm text-slate-400">Amount</dt>
                <dd className="text-sm font-medium text-slate-100">{amount}</dd>
              </div>
            ) : null}

            {dueDate ? (
              <div className="flex items-start justify-between gap-3">
                <dt className="text-sm text-slate-400">Due date</dt>
                <dd className="text-sm font-medium text-slate-100">{dueDate}</dd>
              </div>
            ) : null}

            {accountNumber ? (
              <div className="flex items-start justify-between gap-3">
                <dt className="text-sm text-slate-400">Account</dt>
                <dd className="text-sm font-medium text-slate-100">{accountNumber}</dd>
              </div>
            ) : null}

            {createdAt ? (
              <div className="flex items-start justify-between gap-3">
                <dt className="text-sm text-slate-400">Created</dt>
                <dd className="text-sm text-slate-100">{createdAt}</dd>
              </div>
            ) : null}

            {updatedAt ? (
              <div className="flex items-start justify-between gap-3">
                <dt className="text-sm text-slate-400">Updated</dt>
                <dd className="text-sm text-slate-100">{updatedAt}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-100">Notes</h2>

          {asString(utility.notes) || asString(utility.description) ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
              {asString(utility.notes) ?? asString(utility.description)}
            </p>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-300">
              No notes yet.
            </div>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
        <details>
          <summary className="cursor-pointer list-none select-none">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">Raw record</h2>
                <p className="mt-0.5 text-xs text-slate-400">Utility ID: {utilityId}</p>
              </div>
              <span className="rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-300">
                Toggle
              </span>
            </div>
          </summary>

          <div className="mt-3">
            <pre className="max-h-[420px] overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
{JSON.stringify(utility, null, 2)}
            </pre>
          </div>
        </details>
      </section>
    </div>
  );
}