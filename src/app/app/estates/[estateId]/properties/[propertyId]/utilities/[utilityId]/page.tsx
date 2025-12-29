import Link from "next/link";

import { cookies, headers } from "next/headers";

import { safeJson } from "@/lib/utils";


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

function buildCrumbs(estateId: string, propertyId: string, utilitiesHref: string, detailHref: string): Breadcrumb[] {
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
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="mb-6">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-zinc-500">
          {crumbs.map((c, idx) => (
            <span key={`${c.href}-${idx}`} className="flex items-center gap-2">
              <Link href={c.href} className="hover:text-zinc-700">
                {c.label}
              </Link>
              {idx < crumbs.length - 1 ? <span aria-hidden="true">/</span> : null}
            </span>
          ))}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{title}</h1>
        <p className="mt-2 text-sm text-zinc-600">{description}</p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {primaryCta ? (
            <Link
              href={primaryCta.href}
              className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800"
            >
              {primaryCta.label}
            </Link>
          ) : null}

          {secondaryCta ? (
            <Link
              href={secondaryCta.href}
              className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
            >
              {secondaryCta.label}
            </Link>
          ) : null}

          {!primaryCta && !secondaryCta ? (
            <Link
              href={"/app/estates"}
              className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
            >
              Back to estates
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function getRequestBaseUrl(hdrs: Headers): string {
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

async function fetchUtility(utilityId: string): Promise<UtilityFetchResult> {
  // Prefer a single-source utility endpoint. This keeps the page resilient even if
  // estate/property scoping is handled server-side.
  const hdrs = await headers();
  const cookieStore = await cookies();

  const baseUrl = getRequestBaseUrl(hdrs);
  const url = (baseUrl ? `${baseUrl}/api/utilities/${utilityId}` : `/api/utilities/${utilityId}`).replace(/\/$/, "");

  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: {
      // Forward auth cookies for server-side fetch.
      ...(cookieStore.toString() ? { cookie: cookieStore.toString() } : {}),
      // Forward a couple of useful request headers if present.
      "user-agent": hdrs.get("user-agent") ?? "",
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
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-zinc-500">
            <Link href="/app/estates" className="hover:text-zinc-700">
              Estates
            </Link>
            <span aria-hidden="true">/</span>
            <Link href={`/app/estates/${estateId}`} className="hover:text-zinc-700">
              Overview
            </Link>
            <span aria-hidden="true">/</span>
            <Link href={`/app/estates/${estateId}/properties/${propertyId}`} className="hover:text-zinc-700">
              Property
            </Link>
            <span aria-hidden="true">/</span>
            <Link href={`/app/estates/${estateId}/properties/${propertyId}/utilities`} className="hover:text-zinc-700">
              Utilities
            </Link>
            <span aria-hidden="true">/</span>
            <span className="text-zinc-700">{name}</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{name}</h1>
          {provider ? (
            <p className="mt-1 text-sm text-zinc-600">Provider: {provider}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/app/estates/${estateId}/properties/${propertyId}/utilities`}
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
          >
            Back
          </Link>
          <Link
            href={`/app/estates/${estateId}/properties/${propertyId}/utilities/new`}
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800"
          >
            Add utility
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          {!provider && !accountNumber && !status && !amount && !dueDate ? (
            <div className="mb-3 rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600">
              This utility has very little detail yet. Add provider/account info and a balance or due date when available.
            </div>
          ) : null}
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">Details</h2>

          <dl className="space-y-3">
            {status ? (
              <div className="flex items-start justify-between gap-3">
                <dt className="text-sm text-zinc-500">Status</dt>
                <dd className="text-sm font-medium text-zinc-900">{status}</dd>
              </div>
            ) : null}

            {amount ? (
              <div className="flex items-start justify-between gap-3">
                <dt className="text-sm text-zinc-500">Amount</dt>
                <dd className="text-sm font-medium text-zinc-900">{amount}</dd>
              </div>
            ) : null}

            {dueDate ? (
              <div className="flex items-start justify-between gap-3">
                <dt className="text-sm text-zinc-500">Due date</dt>
                <dd className="text-sm font-medium text-zinc-900">{dueDate}</dd>
              </div>
            ) : null}

            {accountNumber ? (
              <div className="flex items-start justify-between gap-3">
                <dt className="text-sm text-zinc-500">Account</dt>
                <dd className="text-sm font-medium text-zinc-900">{accountNumber}</dd>
              </div>
            ) : null}

            {createdAt ? (
              <div className="flex items-start justify-between gap-3">
                <dt className="text-sm text-zinc-500">Created</dt>
                <dd className="text-sm text-zinc-900">{createdAt}</dd>
              </div>
            ) : null}

            {updatedAt ? (
              <div className="flex items-start justify-between gap-3">
                <dt className="text-sm text-zinc-500">Updated</dt>
                <dd className="text-sm text-zinc-900">{updatedAt}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">Notes</h2>

          {asString(utility.notes) || asString(utility.description) ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
              {asString(utility.notes) ?? asString(utility.description)}
            </p>
          ) : (
            <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
              No notes yet.
            </div>
          )}
        </section>
      </div>

      <section className="mt-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <details>
          <summary className="cursor-pointer list-none select-none">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900">Raw record</h2>
                <p className="mt-0.5 text-xs text-zinc-500">Utility ID: {utilityId}</p>
              </div>
              <span className="text-xs font-medium text-zinc-600">Toggle</span>
            </div>
          </summary>

          <div className="mt-3">
            <pre className="max-h-[420px] overflow-auto rounded-lg bg-zinc-950 p-4 text-xs text-zinc-100">
{JSON.stringify(utility, null, 2)}
            </pre>
          </div>
        </details>
      </section>
    </div>
  );
}