

import Link from "next/link";

type EstateSummary = {
  _id: string;
  name: string;
  court?: string;
  caseNumber?: string;
  status?: string;
  city?: string;
  state?: string;
};

async function fetchEstates(): Promise<EstateSummary[]> {
  try {
    const res = await fetch("/api/estates", {
      cache: "no-store",
    });

    if (!res.ok) {
      console.error("Failed to fetch estates", res.status);
      return [];
    }

    const data = (await res.json()) as { estates?: EstateSummary[] };
    return data.estates ?? [];
  } catch (err) {
    console.error("Error fetching estates", err);
    return [];
  }
}

export const dynamic = "force-dynamic";

export default async function EstatesPage() {
  const estates = await fetchEstates();
  const hasEstates = estates.length > 0;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
            Estates
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Track tasks, expenses, documents, rent, utilities, and time — all
            in one estate workspace.
          </p>
        </div>

        <Link
          href="/app/estates/new"
          className="inline-flex items-center rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-sm shadow-emerald-500/30 hover:bg-emerald-400"
        >
          + New estate
        </Link>
      </header>

      {!hasEstates ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 px-6 py-8 text-sm text-slate-300">
          <p className="font-medium text-slate-100">No estates yet.</p>
          <p className="mt-1 text-slate-400">
            Start by adding your first estate. You’ll be able to track tasks,
            expenses, documents, utilities, rent, and build a clean timecard
            for the court.
          </p>
          <div className="mt-4">
            <Link
              href="/app/estates/new"
              className="inline-flex items-center rounded-full border border-emerald-500/70 px-4 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/10"
            >
              Create estate
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {estates.map((estate) => (
            <Link
              key={estate._id}
              href={`/app/estates/${estate._id}`}
              className="group rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-200 shadow-sm shadow-black/30 transition hover:border-slate-600 hover:bg-slate-900"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-slate-50">
                  {estate.name}
                </h2>
                {estate.status && (
                  <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    {estate.status}
                  </span>
                )}
              </div>

              <div className="mt-1 text-xs text-slate-400">
                {estate.court && (
                  <p>
                    <span className="font-medium text-slate-300">
                      Court:&nbsp;
                    </span>
                    {estate.court}
                  </p>
                )}

                {estate.caseNumber && (
                  <p>
                    <span className="font-medium text-slate-300">
                      Case #:&nbsp;
                    </span>
                    {estate.caseNumber}
                  </p>
                )}

                {(estate.city || estate.state) && (
                  <p className="mt-1">
                    <span className="font-medium text-slate-300">
                      Location:&nbsp;
                    </span>
                    {[estate.city, estate.state].filter(Boolean).join(", ")}
                  </p>
                )}
              </div>

              <p className="mt-3 text-xs text-slate-500 group-hover:text-slate-400">
                Open workspace →
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}