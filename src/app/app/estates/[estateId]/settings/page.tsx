// src/app/app/estates/[estateId]/settings/page.tsx
import { notFound } from "next/navigation";
import { formatDate } from "../../../../../lib/utils";

type EstateStatus = "draft" | "open" | "closing" | "closed" | string;

interface Estate {
  _id: string;
  name?: string;
  decedentName?: string;
  courtCounty?: string;
  courtState?: string;
  caseNumber?: string;
  status?: EstateStatus;
  createdAt?: string;
  updatedAt?: string;
}

function getBaseUrl() {
  // Prefer explicit public base URL
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL;
  }

  // Fallback for Vercel
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // Local dev / generic fallback – relative API path
  return "";
}

async function fetchEstate(estateId: string): Promise<Estate | null> {
  if (!estateId) return null;

  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/api/estates?estateId=${encodeURIComponent(
    estateId,
  )}`;

  try {
    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) {
      console.error("[EstateSettings] Failed to fetch estate", res.status);
      return null;
    }

    const data = (await res.json()) as { estates?: Estate[] };
    const estates = data.estates ?? [];
    return estates[0] ?? null;
  } catch (err) {
    console.error("[EstateSettings] Error fetching estate", err);
    return null;
  }
}

export default async function EstateSettingsPage({
  params,
}: {
  params: Promise<{ estateId: string }>;
}) {
  const { estateId } = await params;

  if (!estateId) {
    notFound();
  }

  const estate = await fetchEstate(estateId);

  if (!estate) {
    return (
      <div className="p-6">
        <h1 className="mb-2 text-xl font-semibold tracking-tight text-slate-50">
          Estate settings
        </h1>
        <p className="max-w-xl text-sm text-slate-400">
          We couldn&apos;t find that estate. It may have been removed or is not
          accessible.
        </p>
      </div>
    );
  }

  const displayName = estate.name || estate.decedentName || "Estate";
  const createdLabel = estate.createdAt ? formatDate(estate.createdAt) : "";
  const updatedLabel = estate.updatedAt
    ? formatDate(estate.updatedAt)
    : createdLabel;
  const rawStatus = estate.status ?? "open";
  const statusLabel =
    typeof rawStatus === "string"
      ? rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1)
      : "Open";

  return (
    <div className="space-y-6 p-6">
      {/* Header + brand strip */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <nav className="text-xs text-slate-500">
            <span className="text-slate-500">Estates</span>
            <span className="mx-1 text-slate-600">/</span>
            <span className="text-slate-300">{displayName}</span>
            <span className="mx-1 text-slate-600">/</span>
            <span className="text-rose-300">Settings</span>
          </nav>

          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-50">
              Estate settings
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Review the core details tied to this probate file. In the MVP,
              settings are read-only so you keep a clean, court-ready snapshot
              of the estate while you work out of the other tabs.
            </p>
          </div>

          {createdLabel && (
            <p className="text-xs text-slate-500">
              Created {createdLabel}
              {updatedLabel && updatedLabel !== createdLabel
                ? ` · Last updated ${updatedLabel}`
                : ""}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2 text-xs">
          <span className="inline-flex items-center rounded-full border border-rose-500/40 bg-rose-950/70 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-rose-100 shadow-sm">
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-rose-400" />
            Read-only (MVP)
          </span>
          <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-950/60 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-amber-100">
            Future update: editable estate + court details
          </span>
        </div>
      </div>

      {/* Two-column cards */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Basic information */}
        <section className="space-y-3 rounded-xl border border-rose-900/40 bg-slate-950/70 px-4 py-4 shadow-sm shadow-rose-950/40">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-rose-200">
            Basic information
          </h2>

          <dl className="space-y-3 text-sm">
            <div className="flex items-start justify-between gap-4">
              <dt className="text-slate-400">Display name</dt>
              <dd className="max-w-[60%] text-right text-slate-50">
                {displayName}
              </dd>
            </div>

            {estate.decedentName && (
              <div className="flex items-start justify-between gap-4">
                <dt className="text-slate-400">Decedent</dt>
                <dd className="max-w-[60%] text-right text-slate-100">
                  {estate.decedentName}
                </dd>
              </div>
            )}

            <div className="flex items-start justify-between gap-4">
              <dt className="text-slate-400">Status</dt>
              <dd className="max-w-[60%] text-right">
                <span className="inline-flex items-center rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 text-xs font-medium text-rose-100">
                  <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-rose-400" />
                  {statusLabel}
                </span>
              </dd>
            </div>

            {estate._id && (
              <div className="flex items-start justify-between gap-4">
                <dt className="text-slate-400">Internal ID</dt>
                <dd className="max-w-[60%] truncate text-right text-[11px] text-slate-500">
                  {estate._id}
                </dd>
              </div>
            )}
          </dl>
        </section>

        {/* Court details */}
        <section className="space-y-3 rounded-xl border border-amber-900/40 bg-slate-950/70 px-4 py-4 shadow-sm shadow-amber-900/40">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-amber-200">
            Court details
          </h2>

          <dl className="space-y-3 text-sm">
            {estate.caseNumber && (
              <div className="flex items-start justify-between gap-4">
                <dt className="text-slate-400">Case number</dt>
                <dd className="max-w-[60%] text-right text-slate-100">
                  {estate.caseNumber}
                </dd>
              </div>
            )}

            {(estate.courtCounty || estate.courtState) && (
              <div className="flex items-start justify-between gap-4">
                <dt className="text-slate-400">Court</dt>
                <dd className="max-w-[60%] text-right text-slate-100">
                  {[estate.courtCounty, estate.courtState]
                    .filter(Boolean)
                    .join(", ")}
                </dd>
              </div>
            )}

            {!estate.caseNumber && !estate.courtCounty && !estate.courtState && (
              <p className="text-xs italic text-slate-500">
                Court metadata hasn&apos;t been captured for this estate yet.
                You can still track tasks, expenses, time, rent, and documents
                while you prepare the formal filing.
              </p>
            )}
          </dl>
        </section>
      </div>

      {/* Info band */}
      <section className="rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-xs text-slate-400">
        <p>
          Editing estate metadata (name, court details, status) will be available
          in a future version of LegatePro. For now, these values come from your
          original estate setup or your attorney&apos;s intake. Use the other tabs
          (Tasks, Expenses, Rent, Time, Documents) to keep a clean, court-ready
          record of your work as personal representative.
        </p>
      </section>
    </div>
  );
}