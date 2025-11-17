// src/app/app/estates/page.tsx
import Link from "next/link";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";

type EstateListItem = {
  _id: string | { toString(): string };
  name?: string;
  estateName?: string;
  caseNumber?: string;
  courtCaseNumber?: string;
  status?: string;
  createdAt?: string | Date;
  county?: string;
  jurisdiction?: string;
};

async function getEstates(): Promise<EstateListItem[]> {
  await connectToDatabase();

  // For now, return all estates sorted by newest first.
  // Later we can scope this to the signed-in user or workspace.
  const estates = await Estate.find().sort({ createdAt: -1 }).lean();

  return estates as EstateListItem[];
}

export default async function EstatesPage() {
  const estates = await getEstates();

  const hasEstates = Array.isArray(estates) && estates.length > 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Estates</h2>
          <p className="text-sm text-slate-400">
            Matter-centric view of everything tied to each probate estate:
            properties, tasks, expenses, rent, contacts, and documents.
          </p>
        </div>
        <Link
          href="/app/estates/new"
          className="inline-flex items-center justify-center rounded-lg border border-emerald-500 bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-200 hover:bg-emerald-500/20"
        >
          + Create estate
        </Link>
      </header>

      {!hasEstates ? (
        <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/40 p-6 text-center">
          <p className="text-sm font-medium text-slate-100">No estates yet</p>
          <p className="mt-1 text-xs text-slate-400">
            When you add your first estate, it will show up here with its case
            number, status, and quick links into tasks, expenses, and
            documents.
          </p>
          <div className="mt-4 flex justify-center">
            <Link
              href="/app/estates/new"
              className="inline-flex items-center justify-center rounded-lg border border-emerald-500 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20"
            >
              + Create your first estate
            </Link>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Estate</th>
                <th className="px-4 py-3 font-medium">Case #</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {estates.map((estate: EstateListItem) => {
                const id = estate._id?.toString?.() ?? String(estate._id ?? "");
                const name =
                  estate.name || estate.estateName || "Untitled estate";
                const caseNumber =
                  estate.caseNumber || estate.courtCaseNumber || "—";
                const status = estate.status || "Draft";

                let createdLabel = "—";
                if (estate.createdAt) {
                  try {
                    const d = new Date(estate.createdAt);
                    if (!Number.isNaN(d.getTime())) {
                      createdLabel = d.toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric"
                      });
                    }
                  } catch {
                    // keep "—"
                  }
                }

                return (
                  <tr
                    key={id}
                    className="border-t border-slate-900/80 hover:bg-slate-900/40"
                  >
                    <td className="px-4 py-3 align-middle">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-slate-100">
                          {name}
                        </span>
                        {estate.county || estate.jurisdiction ? (
                          <span className="text-xs text-slate-500">
                            {estate.county || estate.jurisdiction}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-middle text-sm text-slate-300">
                      {caseNumber}
                    </td>
                    <td className="px-4 py-3 align-middle text-xs">
                      <span className="inline-flex min-w-[4.5rem] items-center justify-center rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] uppercase tracking-wide text-slate-200">
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-middle text-sm text-slate-300">
                      {createdLabel}
                    </td>
                    <td className="px-4 py-3 align-middle text-right text-xs">
                      <Link
                        href={`/app/estates/${id}`}
                        className="inline-flex items-center rounded-full border border-slate-700 px-3 py-1 text-[11px] font-medium text-slate-100 hover:bg-slate-900"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}