import Link from "next/link";
import { notFound } from "next/navigation";
import { connectToDatabase } from "@/lib/db";
import { EstateProperty } from "@/models/EstateProperty";
import { DeletePropertyButton } from "@/components/estate/DeletePropertyButton";

type EstatePropertyItem = {
  _id: string | { toString(): string };
  estate?: string | { toString(): string };
  name?: string;
  type?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  estimatedValue?: number;
  ownershipPercentage?: number;
  notes?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

interface PageProps {
  params: Promise<{ estateId: string; propertyId: string }>;
}

async function getProperty(
  estateId: string,
  propertyId: string
): Promise<EstatePropertyItem | null> {
  await connectToDatabase();
  const property = await EstateProperty.findOne({
    _id: propertyId,
    estate: estateId
  }).lean();
  return (property as EstatePropertyItem) ?? null;
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

export default async function PropertyDetailPage({ params }: PageProps) {
  const { estateId, propertyId } = await params;
  const property = await getProperty(estateId, propertyId);

  if (!property) {
    return notFound();
  }

  const id =
    typeof property._id === "string"
      ? property._id
      : property._id?.toString?.() ?? "";
  const title = property.name || "Untitled property";
  const location = [property.city, property.state].filter(Boolean).join(", ");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="mb-1 text-xs uppercase tracking-[0.18em] text-slate-500">
            Property
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
            {title}
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            {location || "Location not set"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Link
            href={`/app/estates/${estateId}/properties`}
            className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-medium text-slate-100 hover:bg-slate-800"
          >
            Back to properties
          </Link>
          <Link
            href={`/app/estates/${estateId}/properties/${id}/edit`}
            className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-medium text-slate-100 hover:bg-slate-800"
          >
            Edit property
          </Link>
          <Link
            href={`/app/estates/${estateId}/properties/${id}/documents`}
            className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-medium text-slate-100 hover:bg-slate-800"
          >
            Documents
          </Link>
          <Link
            href={`/app/estates/${estateId}/properties/${id}/rent`}
            className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-medium text-slate-100 hover:bg-slate-800"
          >
            Rent
          </Link>
          <Link
            href={`/app/estates/${estateId}/properties/${id}/utilities`}
            className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-medium text-slate-100 hover:bg-slate-800"
          >
            Utilities
          </Link>
          <DeletePropertyButton
            estateId={estateId}
            propertyId={id}
            propertyTitle={title}
          />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
            Type
          </p>
          <p className="mt-1 text-sm font-medium text-slate-50">
            {property.type || "Not specified"}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
            Estimated value
          </p>
          <p className="mt-1 text-sm font-medium text-slate-50">
            {formatCurrency(property.estimatedValue)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
            Ownership
          </p>
          <p className="mt-1 text-sm font-medium text-slate-50">
            {property.ownershipPercentage != null
              ? `${property.ownershipPercentage}%`
              : "Not set"}
          </p>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Link
          href={`/app/estates/${estateId}/properties/${id}/documents`}
          className="group rounded-xl border border-slate-800 bg-slate-950/60 p-4 transition hover:bg-slate-950"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Documents
          </p>
          <p className="mt-1 text-sm font-medium text-slate-50 group-hover:text-white">
            Manage property documents
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Deeds, leases, photos, inspections
          </p>
        </Link>
        <Link
          href={`/app/estates/${estateId}/properties/${id}/rent`}
          className="group rounded-xl border border-slate-800 bg-slate-950/60 p-4 transition hover:bg-slate-950"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Rent
          </p>
          <p className="mt-1 text-sm font-medium text-slate-50 group-hover:text-white">
            Track rent payments
          </p>
          <p className="mt-1 text-xs text-slate-400">Payments and history</p>
        </Link>
        <Link
          href={`/app/estates/${estateId}/properties/${id}/utilities`}
          className="group rounded-xl border border-slate-800 bg-slate-950/60 p-4 transition hover:bg-slate-950"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Utilities
          </p>
          <p className="mt-1 text-sm font-medium text-slate-50 group-hover:text-white">
            Manage utility accounts
          </p>
          <p className="mt-1 text-xs text-slate-400">Bills, providers, notes</p>
        </Link>
      </div>

      {/* Details */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-200">
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Location
          </h2>
          <div className="space-y-1 text-xs">
            <div>
              <p className="text-slate-500">Address</p>
              <p className="text-slate-100">
                {property.address || "No address set"}
              </p>
            </div>
            <div>
              <p className="text-slate-500">City / state</p>
              <p className="text-slate-100">
                {location || "No city/state set"}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Postal code</p>
              <p className="text-slate-100">
                {property.postalCode || "No postal code"}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Country</p>
              <p className="text-slate-100">
                {property.country || "No country set"}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-200">
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Metadata
          </h2>
          <div className="space-y-1 text-xs">
            <div>
              <p className="text-slate-500">Created</p>
              <p className="text-slate-100">
                {formatDate(property.createdAt)}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Last updated</p>
              <p className="text-slate-100">
                {formatDate(property.updatedAt)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          Notes
        </h2>
        <p className="text-xs text-slate-200">
          {property.notes && property.notes.trim().length > 0
            ? property.notes
            : "No notes added for this property yet."}
        </p>
      </div>
    </div>
  );
}