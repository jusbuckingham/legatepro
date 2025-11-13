// src/app/app/estates/[estateId]/page.tsx
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";

interface Params {
  params: { estateId: string };
}

export default async function EstateOverviewPage({ params }: Params) {
  await connectToDatabase();
  const estate = await Estate.findById(params.estateId).lean();

  if (!estate) {
    return <p className="text-sm text-red-400">Estate not found.</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{estate.label}</h1>
        <p className="text-sm text-slate-400">
          Decedent: {estate.decedent?.fullName || "Unknown"} • Status: {estate.status}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Court</p>
          <p className="mt-1 text-sm text-slate-100">
            {estate.courtCounty ? `${estate.courtCounty}, ${estate.courtState}` : "Add court info in Settings"}
          </p>
          <p className="text-xs text-slate-400">
            Case #: {estate.courtCaseNumber || "—"}
          </p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Compensation</p>
          <p className="mt-1 text-sm text-slate-100">
            {estate.compensation?.feeType === "HOURLY"
              ? `Hourly: $${estate.compensation.hourlyRate?.toFixed(2) || "0.00"}`
              : "Configure in Settings"}
          </p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Next steps</p>
          <p className="mt-1 text-sm text-slate-100">
            Tasks, expenses, time tracking, and document index will appear here as we wire them up.
          </p>
        </div>
      </div>
    </div>
  );
}