// src/app/app/estates/[estateId]/page.tsx

import Link from "next/link";
import { connectToDatabase } from "../../../../lib/db";
import { Estate } from "../../../../models/Estate";

export const dynamic = "force-dynamic";

interface LeanEstate {
  _id: string;
  name?: string;
  decedentName?: string;
  court?: string;
  courtCounty?: string;
  courtState?: string;
  caseNumber?: string;
  status?: string;
  city?: string;
  state?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

interface PageProps {
  params: {
    estateId: string;
  };
}

function formatDateLabel(input?: string | Date): string | null {
  if (!input) return null;
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return null;

  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatLocation(city?: string, state?: string): string {
  return [city, state].filter(Boolean).join(", ");
}

function getStatusConfig(status?: string) {
  const normalized = (status ?? "open").toLowerCase();

  if (normalized === "closed" || normalized === "completed") {
    return {
      label: "Closed",
      dotClass: "bg-emerald-400",
      pillClass:
        "border-emerald-500/40 bg-emerald-500/10 text-emerald-100",
    };
  }

  if (normalized === "suspended" || normalized === "paused") {
    return {
      label: "Paused",
      dotClass: "bg-amber-400",
      pillClass: "border-amber-500/40 bg-amber-500/10 text-amber-100",
    };
  }

  return {
    label: "Open",
    dotClass: "bg-rose-400",
    pillClass: "border-rose-500/40 bg-rose-500/10 text-rose-100",
  };
}

const NAV_SECTIONS = [
  {
    key: "tasks",
    label: "Tasks & checklist",
    href: (estateId: string) => `/app/estates/${estateId}/tasks`,
    description:
      "Capture every court, financial, and personal rep task in one place.",
  },
  {
    key: "expenses",
    label: "Expenses",
    href: (estateId: string) => `/app/estates/${estateId}/expenses`,
    description:
      "Track probate costs, reimbursements, and attorney fees for final accounting.",
  },
  {
    key: "rent",
    label: "Rent ledger",
    href: (estateId: string) => `/app/estates/${estateId}/rent`,
    description:
      "Record rent collected from estate properties for tax and court reporting.",
  },
  {
    key: "time",
    label: "Timecard",
    href: (estateId: string) => `/app/estates/${estateId}/time`,
    description:
      "Log your hours as personal representative for potential compensation.",
  },
  {
    key: "documents",
    label: "Document index",
    href: (estateId: string) => `/app/estates/${estateId}/documents`,
    description:
      "Keep a running index of PDFs, receipts, court filings, and letters.",
  },
  {
    key: "properties",
    label: "Properties",
    href: (estateId: string) => `/app/estates/${estateId}/properties`,
    description:
      "See a property-by-property view of rent, utilities, and occupancy.",
  },
  {
    key: "contacts",
    label: "Contacts & directory",
    href: (estateId: string) => `/app/estates/${estateId}/contacts`,
    description:
      "Centralize attorneys, heirs, tenants, vendors, and court contacts.",
  },
  {
    key: "settings",
    label: "Estate settings",
    href: (estateId: string) => `/app/estates/${estateId}/settings`,
    description:
      "Review high-level details like case number, court, and status.",
  },
];

export default async function EstateOverviewPage({ params }: PageProps) {
  const { estateId } = params;

  await connectToDatabase();

  let estate: LeanEstate | null = null;
  try {
    estate =
      ((await Estate.findById(estateId).lean()) as LeanEstate | null) ?? null;
  } catch {
    estate = null;
  }

  const displayName =
    estate?.decedentName ?? estate?.name ?? "Untitled estate";

  const location = formatLocation(estate?.city, estate?.state);
  const createdLabel = formatDateLabel(estate?.createdAt);
  const updatedLabel = formatDateLabel(estate?.updatedAt ?? estate?.createdAt);

  const statusConfig = getStatusConfig(estate?.status);

  return (
    <div className="space-y-6 p-6">
      {/* Header with brand accent */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <nav className="text-xs text-slate-500">
            <span className="text-slate-500">Estates</span>
            <span className="mx-1 text-slate-600">/</span>
            <span className="text-slate-300">{displayName}</span>
            <span className="mx-1 text-slate-600">/</span>
            <span className="text-rose-300">Overview</span>
          </nav>

          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
              Estate workspace
            </h1>
            <p className="mt-1 max-w-xl text-sm text-slate-400">
              A single place to track tasks, expenses, rent, time, and documents
              for this probate file. Think of it as a TurboTax-style control
              center for your role as personal representative.
            </p>
          </div>

          {createdLabel && (
            <p className="text-xs text-slate-500">
              Created {createdLabel}
              {updatedLabel && updatedLabel !== createdLabel
                ? ` · Last activity ${updatedLabel}`
                : ""}
          </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${statusConfig.pillClass}`}
          >
            <span
              className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${statusConfig.dotClass}`}
            />
            {statusConfig.label}
          </span>

          {location ? (
            <span className="text-xs text-slate-400">{location}</span>
          ) : (
            <span className="text-xs text-slate-500">
              Location not set yet
            </span>
          )}
        </div>
      </div>

      {/* Key snapshot / metrics */}
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-rose-900/40 bg-slate-950/70 px-4 py-3 shadow-sm shadow-rose-950/40">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-rose-200">
            Estate status
          </h2>
          <p className="mt-2 text-sm text-slate-300">
            Track where you are in the probate journey at a glance.
          </p>
          <div className="mt-3 text-xs text-slate-400">
            <p>
              Use Tasks, Expenses, and Time to build a clear record that supports
              final court approval and compensation.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-amber-900/40 bg-slate-950/70 px-4 py-3 shadow-sm shadow-amber-900/40">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-amber-200">
            Court details
          </h2>
          {estate?.caseNumber || estate?.court || estate?.courtCounty ? (
            <ul className="mt-2 space-y-1 text-sm text-slate-200">
              {estate?.caseNumber && (
                <li>
                  <span className="text-slate-400">Case #: </span>
                  {estate.caseNumber}
                </li>
              )}
              {(estate?.court || estate?.courtCounty || estate?.courtState) && (
                <li className="text-sm text-slate-200">
                  <span className="text-slate-400">Court: </span>
                  {[estate?.courtCounty, estate?.courtState, estate?.court]
                    .filter(Boolean)
                    .join(", ")}
                </li>
              )}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-400">
              Court metadata hasn&apos;t been added yet. You can still use
              LegatePro to organize everything while your attorney prepares the
              filing.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-3 shadow-sm shadow-slate-900/60">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-200">
            Quick orientation
          </h2>
          <ul className="mt-2 space-y-1 text-xs text-slate-400">
            <li>• Tasks: your running checklist.</li>
            <li>• Expenses: everything you pay out of pocket or from the estate.</li>
            <li>• Rent: income from any properties the estate is holding.</li>
            <li>• Time: a clean log of your hours as personal rep.</li>
          </ul>
        </div>
      </section>

      {/* Navigation grid */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
          Estate sections
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {NAV_SECTIONS.map((section) => (
            <Link
              key={section.key}
              href={section.href(estateId)}
              className="group block rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-200 shadow-sm shadow-slate-950/40 transition hover:border-rose-700 hover:bg-slate-950"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-50">
                  {section.label}
                </span>
                <span className="text-xs text-rose-300 opacity-0 transition group-hover:opacity-100">
                  Open
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {section.description}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}