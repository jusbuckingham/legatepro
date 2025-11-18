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
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="mb-1 text-xs uppercase tracking-[0.18em] text-slate-500">
            Add property
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
            New property for this estate
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Track houses, land, vehicles, accounts, and other assets tied to
            this estate.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Link
            href={`/app/estates/${estateId}/properties`}
            className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-medium text-slate-100 hover:bg-slate-800"
          >
            Back to properties
          </Link>
        </div>
      </div>

      <PropertyForm estateId={estateId} />
    </div>
  );
}