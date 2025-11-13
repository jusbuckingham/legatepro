

import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";
import Link from "next/link";

interface EstatePageProps {
  params: {
    estateId: string;
  };
}

export const dynamic = "force-dynamic";

export default async function EstateOverviewPage({ params }: EstatePageProps) {
  const { estateId } = params;

  await connectToDatabase();

  const estate = await Estate.findById(estateId).lean();

  if (!estate) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Estate not found</h1>
        <p className="text-sm text-slate-400">
          We couldn&apos;t find an estate with that ID. Return to your
          <Link href="/app/estates" className="ml-1 text-emerald-400 hover:text-emerald-300">
            estates list
          </Link>
          .
        </p>
      </div>
    );
  }

  const createdAt = estate.createdAt ? new Date(estate.createdAt).toLocaleDateString() : "—";
  const status = estate.status || "OPEN";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{estate.label}</h1>
        <p className="text-sm text-slate-400">
          Decedent: <span className="text-slate-100">{estate.decedent?.fullName || "Not set"}</span>
          <span className="mx-2">•</span>
          Status: <span className="uppercase tracking-wide text-xs rounded-full bg-slate-800 px-2 py-0.5">
            {status}
          </span>
          <span className="mx-2">•</span>
          Created: {createdAt}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Court info */}
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Court</p>
          <p className="mt-2 text-sm text-slate-100">
            {estate.courtCounty || estate.courtState
              ? `${estate.courtCounty || ""}${estate.courtCounty && estate.courtState ? ", " : ""}${
                  estate.courtState || ""
                }`
              : "Add court info in Settings"}
          </p>
          <p className="text-xs text-slate-400 mt-1">Case #: {estate.courtCaseNumber || "—"}</p>
          <Link
            href={`/app/estates/${estateId}/settings`}
            className="mt-3 inline-flex text-xs text-emerald-400 hover:text-emerald-300"
          >
            Edit court details →
          </Link>
        </div>

        {/* Compensation */}
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Compensation</p>
          <p className="mt-2 text-sm text-slate-100">
            {estate.compensation?.feeType === "HOURLY"
              ? `Hourly: $${(estate.compensation.hourlyRate || 0).toFixed(2)}`
              : "Configure your compensation in Settings"}
          </p>
          {estate.compensation?.feeType && estate.compensation?.feeType !== "HOURLY" && (
            <p className="mt-1 text-xs text-slate-400">Type: {estate.compensation.feeType}</p>
          )}
          <Link
            href={`/app/estates/${estateId}/settings`}
            className="mt-3 inline-flex text-xs text-emerald-400 hover:text-emerald-300"
          >
            Edit compensation →
          </Link>
        </div>

        {/* Quick links */}
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Next steps</p>
          <ul className="mt-2 space-y-1 text-sm">
            <li>
              <Link
                href={`/app/estates/${estateId}/tasks`}
                className="text-emerald-400 hover:text-emerald-300"
              >
                Review and add tasks
              </Link>
            </li>
            <li>
              <Link
                href={`/app/estates/${estateId}/expenses`}
                className="text-emerald-400 hover:text-emerald-300"
              >
                Start logging expenses
              </Link>
            </li>
            <li>
              <Link
                href={`/app/estates/${estateId}/documents`}
                className="text-emerald-400 hover:text-emerald-300"
              >
                Build the document index
              </Link>
            </li>
          </ul>
        </div>
      </div>

      {/* Placeholder for future summaries (tasks, expenses, properties, etc.) */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tasks snapshot</p>
          <p className="mt-2 text-sm text-slate-300">
            Task summary widgets will go here once tasks are wired up (e.g., open vs completed tasks,
            upcoming deadlines).
          </p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Financial snapshot</p>
          <p className="mt-2 text-sm text-slate-300">
            Expense and rent summaries will appear here (e.g., total expenses, funeral costs, rent
            collected, and more).
          </p>
        </div>
      </div>
    </div>
  );
}