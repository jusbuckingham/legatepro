// src/app/app/estates/[estateId]/properties/new/page.tsx
import Link from "next/link";
import { PropertyForm } from "@/components/estate/PropertyForm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = {
  title: "New property | LegatePro",
};

interface PageProps {
  params: Promise<{ estateId: string }>;
}

export default async function NewPropertyPage({ params }: PageProps) {
  const { estateId } = await params;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <nav className="text-xs text-slate-500">
        <Link
          href="/app/estates"
          className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
        >
          Estates
        </Link>
        <span className="mx-1 text-slate-600">/</span>
        <Link
          href={`/app/estates/${estateId}`}
          className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
        >
          Estate
        </Link>
        <span className="mx-1 text-slate-600">/</span>
        <Link
          href={`/app/estates/${estateId}/properties`}
          className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
        >
          Properties
        </Link>
        <span className="mx-1 text-slate-600">/</span>
        <span className="text-rose-300">New</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Property</span>
            <span className="rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.2em] text-slate-300">
              New
            </span>
          </div>

          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-50">
            Add new property
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Add real estate, vehicles, land, financial accounts, or other assets associated with this estate.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Tip: include an estimated value and ownership percentage—those fields speed up your inventory and final accounting.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Link
            href={`/app/estates/${estateId}/properties`}
            className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-1.5 font-medium text-slate-200 hover:border-rose-500/70 hover:text-rose-100"
          >
            Back to properties
          </Link>
        </div>
      </div>

      {/* Form container */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-6 shadow-sm shadow-rose-950/40">
        <PropertyForm estateId={estateId} />
      </div>
    </div>
  );
}