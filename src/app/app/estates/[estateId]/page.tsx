import Link from "next/link";
import { notFound } from "next/navigation";
import { connectToDatabase } from "../../../../lib/db";
import { Estate } from "../../../../models/Estate";

export const dynamic = "force-dynamic";

interface EstatePageProps {
  params: {
    estateId: string;
  };
}

interface LeanEstate {
  _id: string;
  decedentName?: string;
  name?: string;
  courtCounty?: string;
  courtState?: string;
  caseNumber?: string;
  status?: string;
  createdAt?: Date | string;
}

export default async function EstatePage({ params }: EstatePageProps) {
  const { estateId } = params;

  await connectToDatabase();

  const estate = (await Estate.findById(estateId).lean<LeanEstate>()) || null;

  if (!estate) {
    notFound();
  }

  const displayName = estate.decedentName ?? estate.name ?? "Untitled estate";
  const courtLocation = [estate.courtCounty, estate.courtState]
    .filter(Boolean)
    .join(", ");
  const statusLabel = estate.status || "Open";
  const createdDate = estate.createdAt
    ? new Date(estate.createdAt).toLocaleDateString()
    : null;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{displayName}</h1>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
          {courtLocation && <span>{courtLocation}</span>}
          {estate.caseNumber && <span>Case #{estate.caseNumber}</span>}
          {createdDate && <span>Created {createdDate}</span>}
          <span className="inline-flex items-center rounded-full border border-slate-700 px-2 py-0.5 text-[11px] uppercase tracking-wide text-slate-300">
            {statusLabel}
          </span>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <Link
          href={`/app/estates/${estateId}/tasks`}
          className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 transition-colors hover:border-emerald-500/60 hover:bg-slate-900"
        >
          <h2 className="text-sm font-semibold text-slate-50">Tasks</h2>
          <p className="mt-1 text-xs text-slate-400">
            Checklist of everything that needs to happen for this estate, from opening probate to
            closing the file.
          </p>
        </Link>

        <Link
          href={`/app/estates/${estateId}/expenses`}
          className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 transition-colors hover:border-emerald-500/60 hover:bg-slate-900"
        >
          <h2 className="text-sm font-semibold text-slate-50">Expenses</h2>
          <p className="mt-1 text-xs text-slate-400">
            Track court costs, repairs, travel, and every other estate expense in one ledger.
          </p>
        </Link>

        <Link
          href={`/app/estates/${estateId}/documents`}
          className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 transition-colors hover:border-emerald-500/60 hover:bg-slate-900"
        >
          <h2 className="text-sm font-semibold text-slate-50">Documents</h2>
          <p className="mt-1 text-xs text-slate-400">
            Keep an index of every important document—petitions, letters, deeds, receipts, and
            more.
          </p>
        </Link>

        <Link
          href={`/app/estates/${estateId}/properties`}
          className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 transition-colors hover:border-emerald-500/60 hover:bg-slate-900"
        >
          <h2 className="text-sm font-semibold text-slate-50">Properties</h2>
          <p className="mt-1 text-xs text-slate-400">
            Manage estate real estate, tenants, rent, and related utilities from one view.
          </p>
        </Link>

        <Link
          href={`/app/estates/${estateId}/rent`}
          className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 transition-colors hover:border-emerald-500/60 hover:bg-slate-900"
        >
          <h2 className="text-sm font-semibold text-slate-50">Rent &amp; Income</h2>
          <p className="mt-1 text-xs text-slate-400">
            Track rental payments, generate receipts, and keep a clear record for the court.
          </p>
        </Link>

        <Link
          href={`/app/estates/${estateId}/time`}
          className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 transition-colors hover:border-emerald-500/60 hover:bg-slate-900"
        >
          <h2 className="text-sm font-semibold text-slate-50">Timecard</h2>
          <p className="mt-1 text-xs text-slate-400">
            Log your hours as personal representative so you can request compensation with a clean
            record.
          </p>
        </Link>
      </section>
    </div>
  );
}