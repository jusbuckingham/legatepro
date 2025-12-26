import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies, headers } from "next/headers";


type PageProps = {
  params: Promise<{
    estateId: string;
    propertyId: string;
    utilityId: string;
  }>;
};

type UtilityApiResponse = {
  utility?: Record<string, unknown>;
  error?: string;
};

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

async function fetchUtility(utilityId: string): Promise<Record<string, unknown> | null> {
  // Prefer a single-source utility endpoint. This keeps the page resilient even if
  // estate/property scoping is handled server-side.
  const hdrs = await headers();
  const cookieStore = await cookies();

  const baseUrl = getRequestBaseUrl(hdrs);
  const url = (baseUrl
    ? `${baseUrl}/api/utilities/${utilityId}`
    : `/api/utilities/${utilityId}`
  ).replace(/\/$/, "");

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

  if (res.status === 404) return null;
  if (!res.ok) {
    // Try to surface a meaningful error payload in dev, but don't hard-crash the UI.
    return null;
  }

  const data = (await res.json().catch(() => null)) as UtilityApiResponse | null;
  return (data?.utility ?? (data as unknown as Record<string, unknown>) ?? null) as Record<string, unknown> | null;
}

export default async function UtilityDetailPage({ params }: PageProps) {
  const { estateId, propertyId, utilityId } = await params;

  const utility = await fetchUtility(utilityId);
  if (!utility) notFound();

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
            <Link
              href={`/app/estates/${estateId}/properties/${propertyId}/utilities`}
              className="hover:text-zinc-700"
            >
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
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-900">Raw record</h2>
          <span className="text-xs text-zinc-500">Utility ID: {utilityId}</span>
        </div>
        <pre className="max-h-[420px] overflow-auto rounded-lg bg-zinc-950 p-4 text-xs text-zinc-100">
{JSON.stringify(utility, null, 2)}
        </pre>
      </section>
    </div>
  );
}