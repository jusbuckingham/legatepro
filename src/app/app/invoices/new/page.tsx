import Link from "next/link";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{
    estateId?: string;
  }>;
};

type LeanEstate = {
  _id: unknown;
  decedentName?: string;
  caseName?: string;
  courtCaseNumber?: string;
  status?: string;
  createdAt?: Date | string;
};

function getEstateDisplayName(estate: LeanEstate): string {
  if (estate.caseName) return estate.caseName;
  if (estate.decedentName) return estate.decedentName;
  if (estate.courtCaseNumber) return `Case ${estate.courtCaseNumber}`;
  return "Untitled estate";
}

function formatShortDate(value: Date | string | undefined | null): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

export default async function GlobalInvoiceNewPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {};
  const preselectedEstateId =
    typeof sp.estateId === "string" ? sp.estateId : "";

  await connectToDatabase();

  const estateDocs = await Estate.find({})
    .sort({ createdAt: -1 })
    .lean();

  const estates = estateDocs as LeanEstate[];

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <header className="space-y-2 border-b border-slate-800 pb-4">
        <p className="text-xs uppercase tracking-[0.2em] text-rose-400">
          Invoicing
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-50 md:text-3xl">
          New invoice
        </h1>
        <p className="max-w-2xl text-sm text-slate-300">
          Start by choosing which estate this invoice is for. You&apos;ll then
          be taken to the detailed invoice builder for that estate.
        </p>
      </header>

      {estates.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 text-sm text-slate-200">
          <p>No estates found yet.</p>
          <p className="mt-1 text-xs text-slate-400">
            Create an estate first, then you can generate invoices for that
            estate.
          </p>
          <div className="mt-3">
            <Link
              href="/app/estates/new"
              className="inline-flex items-center rounded-full border border-rose-500/70 bg-rose-600/20 px-3 py-1.5 text-xs font-medium text-rose-100 shadow-sm shadow-rose-900/40 hover:bg-rose-600/40"
            >
              + New estate
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-100">
              Choose an estate
            </h2>
            <p className="text-[11px] text-slate-400">
              Showing {estates.length} estate
              {estates.length === 1 ? "" : "s"}.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3">
            <ul className="divide-y divide-slate-800 text-xs">
              {estates.map((estate) => {
                const id = String(estate._id);
                const selected = preselectedEstateId === id;

                return (
                  <li
                    key={id}
                    className="flex flex-col gap-2 py-3 first:pt-1 last:pb-1 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium text-slate-50">
                        {getEstateDisplayName(estate)}
                      </p>
                      {estate.courtCaseNumber && (
                        <p className="text-[11px] text-slate-400">
                          Case: {estate.courtCaseNumber}
                        </p>
                      )}
                      {estate.createdAt && (
                        <p className="text-[11px] text-slate-500">
                          Opened{" "}
                          {formatShortDate(
                            typeof estate.createdAt === "string"
                              ? estate.createdAt
                              : estate.createdAt,
                          )}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 md:justify-end">
                      {selected && (
                        <span className="inline-flex items-center rounded-full border border-emerald-500/60 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-200">
                          Preselected
                        </span>
                      )}
                      <Link
                        href={`/app/estates/${id}/invoices/new`}
                        className="inline-flex items-center rounded-full border border-rose-500/70 bg-rose-600/15 px-3 py-1.5 text-[11px] font-medium text-rose-100 shadow-sm shadow-rose-900/40 hover:bg-rose-600/35"
                      >
                        Create invoice →
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <p className="text-[11px] text-slate-500">
            Tip: You can also go to an estate first (from{" "}
            <code className="rounded bg-slate-900 px-1 py-[1px] text-[10px] text-slate-300">
              /app/estates
            </code>
            ) and use its Invoices tab to create an invoice directly in that
            context.
          </p>
        </div>
      )}
    </div>
  );
}