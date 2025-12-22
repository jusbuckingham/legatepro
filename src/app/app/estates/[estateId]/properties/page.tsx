// src/app/app/estates/[estateId]/properties/page.tsx
import { DeletePropertyButton } from "@/components/estate/DeletePropertyButton";
import Link from "next/link";
import { connectToDatabase } from "@/lib/db";
import { EstateProperty } from "@/models/EstateProperty";

type EstatePropertyItem = {
  _id: string | { toString(): string };
  name?: string;
  label?: string;
  type?: string;
  address?: string;
  city?: string;
  state?: string;
  estimatedValue?: number;
  ownershipPercentage?: number;
  createdAt?: string | Date;
};

interface PageProps {
  params: Promise<{ estateId: string }>;
}

async function getProperties(estateId: string): Promise<EstatePropertyItem[]> {
  await connectToDatabase();
  const properties = await EstateProperty.find({ estateId })
    .sort({ createdAt: -1 })
    .lean();
  return properties as EstatePropertyItem[];
}

function formatCurrency(value?: number): string {
  if (value == null || Number.isNaN(value)) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format(value);
  } catch {
    return String(value);
  }
}

function formatDate(value?: string | Date): string {
  if (!value) return "—";
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  } catch {
    return "—";
  }
}

export default async function EstatePropertiesPage({ params }: PageProps) {
  const { estateId } = await params;
  const properties = await getProperties(estateId);

  const hasProperties = properties.length > 0;

  const totalEstimatedValue = properties.reduce((sum, p) => sum + (p.estimatedValue ?? 0), 0);
  const avgOwnership =
    properties.length > 0
      ? properties.reduce((sum, p) => sum + (p.ownershipPercentage ?? 0), 0) / properties.length
      : 0;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Link href="/app/estates" className="hover:text-slate-200">
          Estates
        </Link>
        <span className="text-slate-700">/</span>
        <Link href={`/app/estates/${estateId}`} className="hover:text-slate-200">
          Estate
        </Link>
        <span className="text-slate-700">/</span>
        <span className="text-slate-300">Properties</span>
      </div>

      {/* Header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
            Properties
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
            Estate properties & assets
          </h1>
          <p className="text-sm text-slate-400">
            Track houses, parcels, vehicles, and accounts tied to this estate.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Link
            href={`/app/estates/${estateId}`}
            className="inline-flex items-center rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 font-medium text-slate-100 hover:bg-slate-900"
          >
            Back to estate
          </Link>
          <Link
            href={`/app/estates/${estateId}/properties/new`}
            className="inline-flex items-center rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 font-medium text-emerald-100 hover:bg-emerald-500/20"
          >
            Add property
          </Link>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
            Total properties
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-50">
            {properties.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Items tracked in this estate
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
            Total value (est.)
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-50">
            {formatCurrency(totalEstimatedValue)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Based on estimated values
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
            Avg ownership
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-50">
            {hasProperties ? `${Math.round(avgOwnership)}%` : "—"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Average recorded percentage
          </p>
        </div>
      </div>

      {!hasProperties ? (
        <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/60 p-6 text-center">
          <p className="text-sm font-medium text-slate-200">
            No properties recorded for this estate yet.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Add the primary residence, rentals, land, vehicles, or any significant assets you
            want to track.
          </p>
          <div className="mt-4">
            <Link
              href={`/app/estates/${estateId}/properties/new`}
              className="inline-flex items-center rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs font-medium text-emerald-100 hover:bg-emerald-500/20"
            >
              Add first property
            </Link>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60">
          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/80 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
              Properties
            </p>
            <p className="text-xs text-slate-500">
              {properties.length} total
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-left text-sm">
              <thead className="border-b border-slate-800 bg-slate-950/80 text-xs uppercase tracking-[0.16em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Value</th>
                  <th className="px-4 py-3">Ownership</th>
                  <th className="px-4 py-3">Added</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-xs text-slate-200">
                {properties.map((property) => {
                  const id =
                    typeof property._id === "string"
                      ? property._id
                      : property._id?.toString?.() ?? "";

                  const name = property.name || property.label || "Untitled property";
                  const type = property.type || "—";
                  const location = [property.city, property.state]
                    .filter(Boolean)
                    .join(", ");

                  return (
                    <tr key={id} className="hover:bg-slate-900/60">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-50">
                          <Link
                            href={`/app/estates/${estateId}/properties/${id}`}
                            className="hover:underline"
                          >
                            {name}
                          </Link>
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          {property.address || "No address"}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full border border-slate-800 bg-slate-900/40 px-2 py-1 text-[11px] text-slate-200">
                          {type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {location || "—"}
                      </td>
                      <td className="px-4 py-3">
                        {formatCurrency(property.estimatedValue)}
                      </td>
                      <td className="px-4 py-3">
                        {property.ownershipPercentage != null
                          ? `${property.ownershipPercentage}%`
                          : "—"}
                      </td>
                      <td className="px-4 py-3">{formatDate(property.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Link
                            href={`/app/estates/${estateId}/properties/${id}`}
                            className="rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1 text-[11px] font-medium text-slate-100 hover:bg-slate-900"
                          >
                            View
                          </Link>
                          <Link
                            href={`/app/estates/${estateId}/properties/${id}/edit`}
                            className="rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1 text-[11px] font-medium text-slate-100 hover:bg-slate-900"
                          >
                            Edit
                          </Link>
                          <DeletePropertyButton
                            estateId={estateId}
                            propertyId={id}
                            propertyTitle={name}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}