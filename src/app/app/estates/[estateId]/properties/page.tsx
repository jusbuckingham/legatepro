// src/app/app/estates/[estateId]/properties/page.tsx
import { DeletePropertyButton } from "@/components/estate/DeletePropertyButton";
import Link from "next/link";
import { redirect } from "next/navigation";
import mongoose from "mongoose";

import { connectToDatabase } from "@/lib/db";
import { auth } from "@/lib/auth";
import { requireEstateAccess } from "@/lib/estateAccess";
import { Estate } from "@/models/Estate";
import { EstateProperty } from "@/models/EstateProperty";

type EstatePropertyItem = {
  _id: string | { toString(): string };
  nickname?: string;
  streetAddress?: string;
  unit?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  propertyType?: string;
  isRented?: boolean;
  isPrimaryResidence?: boolean;
  purchasePrice?: number;
  estimatedValue?: number;
  ownershipPercentage?: number;
  notes?: string;
  createdAt?: string | Date;
};

interface PageProps {
  params: { estateId: string };
}

function isValidObjectId(value: string): boolean {
  return mongoose.Types.ObjectId.isValid(value);
}

function normalizeObjectId(value: string): string | null {
  const v = value.trim();
  if (!v || v.length !== 24) return null;
  return isValidObjectId(v) ? v : null;
}

async function getProperties(
  estateId: string,
): Promise<{ notFound: boolean; estateName: string; properties: EstatePropertyItem[] }> {
  await connectToDatabase();

  const estateObjectId = normalizeObjectId(estateId);
  if (!estateObjectId) {
    return { notFound: true, estateName: "", properties: [] };
  }

  const estate = await Estate.findOne({ _id: estateObjectId })
    .select({ displayName: 1, name: 1, estateName: 1 })
    .lean()
    .exec();

  if (!estate) {
    return { notFound: true, estateName: "", properties: [] };
  }

  const estateName =
    (estate as unknown as { displayName?: string; name?: string; estateName?: string })
      .displayName ||
    (estate as unknown as { displayName?: string; name?: string; estateName?: string }).name ||
    (estate as unknown as { displayName?: string; name?: string; estateName?: string }).estateName ||
    "Estate";

  const properties = await EstateProperty.find({ estateId: estateObjectId })
    .select({
      _id: 1,
      nickname: 1,
      streetAddress: 1,
      unit: 1,
      city: 1,
      state: 1,
      postalCode: 1,
      propertyType: 1,
      isRented: 1,
      isPrimaryResidence: 1,
      purchasePrice: 1,
      estimatedValue: 1,
      ownershipPercentage: 1,
      notes: 1,
      createdAt: 1,
    })
    .sort({ createdAt: -1 })
    .lean()
    .exec();

  return { notFound: false, estateName, properties: properties as unknown as EstatePropertyItem[] };
}

export default async function EstatePropertiesPage({ params }: PageProps) {
  const { estateId } = params;

  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const access = await requireEstateAccess({ estateId, userId: session.user.id });
  const canEdit = access.role !== "VIEWER";

  const result = await getProperties(estateId);
  if (result.notFound) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Link href="/app/estates" className="hover:text-slate-200">
            Estates
          </Link>
          <span className="text-slate-700">/</span>
          <span className="text-slate-300">Properties</span>
        </div>

        <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/60 p-6">
          <p className="text-sm font-medium text-slate-200">Estate not found</p>
          <p className="mt-2 text-xs text-slate-500">
            This estate doesn&apos;t exist or you don&apos;t have access to it.
          </p>
          <div className="mt-4">
            <Link
              href="/app/estates"
              className="inline-flex items-center rounded-lg border border-slate-800 bg-slate-950/60 px-4 py-2 text-xs font-medium text-slate-100 hover:bg-slate-900"
            >
              Back to estates
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { estateName, properties } = result;
  const hasProperties = properties.length > 0;

  const totalEstimatedValue = properties.reduce(
    (sum, p) => sum + (p.estimatedValue ?? 0),
    0,
  );
  const avgOwnership =
    properties.length > 0
      ? properties.reduce((sum, p) => sum + (p.ownershipPercentage ?? 0), 0) /
        properties.length
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
          {estateName}
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
            Track houses, parcels, vehicles, and accounts tied to {estateName}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Link
            href={`/app/estates/${estateId}`}
            className="inline-flex items-center rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 font-medium text-slate-100 hover:bg-slate-900"
          >
            Back to estate
          </Link>
          {canEdit ? (
            <Link
              href={`/app/estates/${estateId}/properties/new`}
              className="inline-flex items-center rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 font-medium text-emerald-100 hover:bg-emerald-500/20"
            >
              Add property
            </Link>
          ) : (
            <Link
              href={`/app/estates/${estateId}?requestAccess=1`}
              className="inline-flex items-center rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 font-medium text-slate-100 hover:bg-slate-900"
            >
              Request edit access
            </Link>
          )}
        </div>
      </div>

      {/* Anchor for readiness deep-links */}
      <section
        id="add-property"
        className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3"
      >
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-100">Add a property</p>
            <p className="text-xs text-slate-400">
              Track houses, parcels, vehicles, and other assets tied to this estate.
            </p>
          </div>

          {canEdit ? (
            <Link
              href={`/app/estates/${estateId}/properties/new`}
              className="mt-2 inline-flex items-center justify-center rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/20 md:mt-0"
            >
              Add property
            </Link>
          ) : (
            <Link
              href={`/app/estates/${estateId}?requestAccess=1`}
              className="mt-2 inline-flex items-center justify-center rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/15 md:mt-0"
            >
              Request edit access
            </Link>
          )}
        </div>
      </section>

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

      {!canEdit ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium">Viewer access</p>
              <p className="text-xs text-amber-200">
                You can view the property inventory, but you can’t add, edit, or remove properties.
              </p>
            </div>
            <Link
              href={`/app/estates/${estateId}?requestAccess=1`}
              className="mt-2 inline-flex items-center justify-center rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-500/25 md:mt-0"
            >
              Request edit access
            </Link>
          </div>
        </div>
      ) : null}

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

                  const name =
                    property.nickname ||
                    property.streetAddress ||
                    "Untitled property";

                  const type = property.propertyType || "—";

                  const location = [property.city, property.state]
                    .filter(Boolean)
                    .join(", ");

                  const addressLine = [
                    property.streetAddress,
                    property.unit ? `#${property.unit}` : undefined,
                  ]
                    .filter(Boolean)
                    .join(" ");

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
                          {addressLine || "No address"}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full border border-slate-800 bg-slate-900/40 px-2 py-1 text-[11px] text-slate-200">
                          {type}
                          {property.isRented ? " • Rented" : ""}
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
                          {canEdit ? (
                            <>
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
                            </>
                          ) : null}
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

function formatCurrency(value?: number): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `$${Math.round(value).toLocaleString("en-US")}`;
  }
}

function formatDate(value?: string | Date): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}