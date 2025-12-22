// src/app/app/estates/[estateId]/properties/new/page.tsx
import Link from "next/link";
import { PropertyForm } from "@/components/estate/PropertyForm";

interface PageProps {
  params: Promise<{ estateId: string }>;
}

export default async function NewPropertyPage({ params }: PageProps) {
  const { estateId } = await params;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="text-xs text-slate-400">
        <Link href="/app/estates" className="hover:text-slate-200">
          Estates
        </Link>{" "}
        /{" "}
        <Link
          href={`/app/estates/${estateId}`}
          className="hover:text-slate-200"
        >
          Estate
        </Link>{" "}
        /{" "}
        <Link
          href={`/app/estates/${estateId}/properties`}
          className="hover:text-slate-200"
        >
          Properties
        </Link>{" "}
        / New
      </nav>

      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="mb-1 text-xs uppercase tracking-[0.18em] text-slate-500">
            Properties
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
            Add new property
          </h1>
          <p className="mt-1 max-w-xl text-sm text-slate-400">
            Add real estate, vehicles, land, financial accounts, or other assets
            associated with this estate.
          </p>
        </div>

        <Link
          href={`/app/estates/${estateId}/properties`}
          className="inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-800"
        >
          Back to properties
        </Link>
      </div>

      {/* Form container */}
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-6">
        <PropertyForm estateId={estateId} />
      </div>
    </div>
  );
}