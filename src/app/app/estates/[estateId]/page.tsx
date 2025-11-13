import Link from "next/link";
import { notFound } from "next/navigation";
import { connectToDatabase } from "../../../../lib/db";
import { Estate } from "../../../../models/Estate";
import { LabelBadge } from "../../../../components/ui/LabelBadge";
import { StatusDot } from "../../../../components/ui/StatusDot";

export const dynamic = "force-dynamic";

interface EstatePageProps {
  params: {
    estateId: string;
  };
}

interface LeanEstate {
  _id: string;
  name?: string;
  decedentName?: string;
  court?: string;
  caseNumber?: string;
  city?: string;
  state?: string;
  status?: string;
  createdAt?: Date | string;
}

// Map raw status text to a LabelBadge status token
function mapStatusToBadge(
  status?: string
): "open" | "pending" | "closed" | "needs-info" | "warning" | "active" | "inactive" {
  if (!status) return "open";
  const value = status.toLowerCase();

  if (value.includes("closed")) return "closed";
  if (value.includes("pend")) return "pending";
  if (value.includes("info")) return "needs-info";
  if (value.includes("active")) return "active";
  if (value.includes("inactive")) return "inactive";
  if (value.includes("warn") || value.includes("issue")) return "warning";

  return "open";
}

export default async function EstatePage({ params }: EstatePageProps) {
  const { estateId } = params;

  await connectToDatabase();

  const estate = (await Estate.findById(estateId).lean<LeanEstate>()) || null;

  if (!estate) {
    notFound();
  }

  const displayName =
    estate.decedentName ?? estate.name ?? "Untitled estate";

  const location = [estate.city, estate.state].filter(Boolean).join(", ");

  const statusLabel = estate.status || "Open";
  const statusBadge = mapStatusToBadge(estate.status);

  const createdDate = estate.createdAt
    ? new Date(estate.createdAt).toLocaleDateString()
    : null;

  return (
    <div className="space-y-6">
      {/* Top breadcrumb / back link */}
      <div className="flex items-center justify-between gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <Link
            href="/app/estates"
            className="inline-flex items-center gap-1 rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-[11px] font-medium text-slate-300 hover:border-slate-600 hover:text-slate-100"
          >
            <span className="text-slate-500">←</span>
            Estates
          </Link>
          <span className="text-slate-600">/</span>
          <span
            className="max-w-xs truncate text-slate-300"
            title={displayName}
          >
            {displayName}
          </span>
        </div>

        <StatusDot
          color={
            statusBadge === "closed"
              ? "gray"
              : statusBadge === "pending"
              ? "yellow"
              : "green"
          }
          label={statusLabel}
        />
      </div>

      {/* Header: estate summary */}
      <header className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
              {displayName}
            </h1>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
              {estate.court && <span>{estate.court}</span>}
              {estate.caseNumber && <span>Case #{estate.caseNumber}</span>}
              {location && <span>{location}</span>}
              {createdDate && <span>Created {createdDate}</span>}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 text-right">
            <LabelBadge status={statusBadge} />
            <Link
              href={`/app/estates/${estateId}/settings`}
              className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-[11px] font-medium text-slate-200 hover:border-slate-500 hover:text-white"
            >
              <span>Estate settings</span>
            </Link>
          </div>
        </div>

        <p className="mt-1 max-w-2xl text-xs text-slate-400">
          This overview links out to every working area for the estate—tasks,
          expenses, documents, properties, rent and income, utilities, and your
          personal rep timecard.
        </p>
      </header>

      {/* Estate workspace tiles */}
      <section className="grid gap-4 md:grid-cols-2">
        <Link
          href={`/app/estates/${estateId}/tasks`}
          className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 transition-colors hover:border-emerald-500/60 hover:bg-slate-900"
        >
          <h2 className="text-sm font-semibold text-slate-50">Tasks</h2>
          <p className="mt-1 text-xs text-slate-400">
            Checklist of everything that needs to happen for this estate, from
            opening probate to closing the file.
          </p>
        </Link>

        <Link
          href={`/app/estates/${estateId}/expenses`}
          className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 transition-colors hover:border-emerald-500/60 hover:bg-slate-900"
        >
          <h2 className="text-sm font-semibold text-slate-50">Expenses</h2>
          <p className="mt-1 text-xs text-slate-400">
            Track court costs, repairs, travel, and every other estate expense
            in one ledger.
          </p>
        </Link>

        <Link
          href={`/app/estates/${estateId}/documents`}
          className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 transition-colors hover:border-emerald-500/60 hover:bg-slate-900"
        >
          <h2 className="text-sm font-semibold text-slate-50">Documents</h2>
          <p className="mt-1 text-xs text-slate-400">
            Keep an index of every important document—petitions, letters,
            deeds, receipts, and more.
          </p>
        </Link>

        <Link
          href={`/app/estates/${estateId}/properties`}
          className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 transition-colors hover:border-emerald-500/60 hover:bg-slate-900"
        >
          <h2 className="text-sm font-semibold text-slate-50">Properties</h2>
          <p className="mt-1 text-xs text-slate-400">
            Manage estate real estate, tenants, rent, and related utilities
            from one view.
          </p>
        </Link>

        <Link
          href={`/app/estates/${estateId}/rent`}
          className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 transition-colors hover:border-emerald-500/60 hover:bg-slate-900"
        >
          <h2 className="text-sm font-semibold text-slate-50">
            Rent &amp; income
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Track rental payments, generate receipts, and keep a clear record
            for the court.
          </p>
        </Link>

        <Link
          href={`/app/estates/${estateId}/time`}
          className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 transition-colors hover:border-emerald-500/60 hover:bg-slate-900"
        >
          <h2 className="text-sm font-semibold text-slate-50">Timecard</h2>
          <p className="mt-1 text-xs text-slate-400">
            Log your hours as personal representative so you can request
            compensation with a clean record.
          </p>
        </Link>
      </section>
    </div>
  );
}