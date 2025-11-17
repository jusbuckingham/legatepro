import { notFound } from "next/navigation";
import Link from "next/link";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";
import { DeleteEstateButton } from "@/components/estate/DeleteEstateButton";

type EstateDetail = {
  _id: string | { toString(): string };
  name?: string;
  estateName?: string;
  caseNumber?: string;
  courtCaseNumber?: string;
  status?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  county?: string;
  jurisdiction?: string;
  decedentName?: string;
  decedentDateOfDeath?: string | Date;
  notes?: string;
};

interface PageProps {
  params: Promise<{ estateId: string }>;
}

async function getEstate(id: string): Promise<EstateDetail | null> {
  await connectToDatabase();
  try {
    const estate = await Estate.findById(id).lean();
    if (!estate) return null;
    return estate as EstateDetail;
  } catch {
    return null;
  }
}

export default async function EstatePage({ params }: PageProps) {
  const { estateId } = await params;
  const estate = await getEstate(estateId);

  if (!estate) return notFound();

  const id = estate._id?.toString?.() ?? String(estate._id ?? "");
  const title = estate.name || estate.estateName || "Untitled estate";
  const caseNumber = estate.caseNumber || estate.courtCaseNumber || "—";
  const status = estate.status || "Draft";
  const jurisdiction = estate.county || estate.jurisdiction || "—";
  const decedentName = estate.decedentName || "—";

  const formatDate = (v?: string | Date) => {
    if (!v) return "—";
    try {
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        });
      }
      return "—";
    } catch {
      return "—";
    }
  };

  const createdLabel = formatDate(estate.createdAt);
  const updatedLabel = formatDate(estate.updatedAt);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="mb-1 text-xs uppercase tracking-[0.18em] text-slate-500">Estate</div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-50">{title}</h2>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-400">
            <span>Case #{caseNumber}</span>
            <span className="inline-block h-1 w-1 rounded-full bg-slate-600" />
            <span>{jurisdiction}</span>
            <span className="inline-block h-1 w-1 rounded-full bg-slate-600" />
            <span>Decedent: {decedentName}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] uppercase tracking-wide text-slate-200">
            Status: {status}
          </span>
          <Link
            href={`/app/estates/${id}/edit`}
            className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-800"
          >
            Edit estate
          </Link>
          <DeleteEstateButton estateId={id} estateTitle={title} />
        </div>
      </div>

      <div className="grid gap-3 text-xs text-slate-400 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Created</div>
          <div className="mt-1 text-sm text-slate-100">{createdLabel}</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Last updated</div>
          <div className="mt-1 text-sm text-slate-100">{updatedLabel}</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">ID</div>
          <div className="mt-1 truncate text-[11px] text-slate-400">{id}</div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="space-y-4 lg:col-span-2">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <h3 className="text-sm font-semibold text-slate-100">Overview & notes</h3>
            <p className="mt-2 text-xs text-slate-400">
              This is where you&apos;ll keep a running summary of the estate.
            </p>
            <div className="mt-4 rounded-lg border border-dashed border-slate-800 p-4 text-xs text-slate-500">
              Notes UI not built yet.
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <h3 className="text-sm font-semibold text-slate-100">Activity timeline</h3>
            <p className="mt-2 text-xs text-slate-400">
              Tasks, payments, and document events will appear here.
            </p>
            <div className="mt-4 rounded-lg border border-dashed border-slate-800 p-4 text-center text-xs text-slate-500">
              No activity yet.
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <h3 className="text-sm font-semibold text-slate-100">Quick links</h3>
            <ul className="mt-3 space-y-2 text-sm text-emerald-300">
              <li><Link href={`/app/estates/${id}/tasks`} className="hover:underline">→ View tasks</Link></li>
              <li><Link href={`/app/estates/${id}/documents`} className="hover:underline">→ View documents</Link></li>
              <li><Link href={`/app/estates/${id}/expenses`} className="hover:underline">→ View expenses</Link></li>
              <li><Link href={`/app/estates/${id}/properties`} className="hover:underline">→ View properties</Link></li>
            </ul>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <h3 className="text-sm font-semibold text-slate-100">Next steps</h3>
            <p className="mt-2 text-xs text-slate-400">
              Recommendations will appear here later.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}