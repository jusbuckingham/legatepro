import Link from "next/link";
import { notFound } from "next/navigation";

import { connectToDatabase } from "@/lib/db";
import { EstateProperty } from "@/models/EstateProperty";
import { PropertyForm } from "@/components/estate/PropertyForm";

type EstatePropertyItem = {
  _id: string | { toString(): string };
  name?: string;
  label?: string;
  type?: string;
  category?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  estimatedValue?: number;
  ownershipPercentage?: number;
  notes?: string;
};

interface PageProps {
  params: Promise<{
    estateId: string;
    propertyId: string;
  }>;
}

async function getPropertyForEdit(
  estateId: string,
  propertyId: string
): Promise<EstatePropertyItem | null> {
  await connectToDatabase();

  const property = await EstateProperty.findOne({
    _id: propertyId,
    estateId
  })
    .lean()
    .exec();

  return (property as EstatePropertyItem) ?? null;
}

export default async function EditPropertyPage({ params }: PageProps) {
  const { estateId, propertyId } = await params;

  const property = await getPropertyForEdit(estateId, propertyId);

  if (!property) {
    return notFound();
  }

  const title = property.name || property.label || "Untitled property";

  const initialValues = {
    name: property.name ?? property.label ?? "",
    type: property.type ?? "",
    category: property.category ?? "",
    address: property.address ?? "",
    city: property.city ?? "",
    state: property.state ?? "",
    postalCode: property.postalCode ?? "",
    country: property.country ?? "",
    estimatedValue: property.estimatedValue ?? 0,
    ownershipPercentage: property.ownershipPercentage ?? 100,
    notes: property.notes ?? ""
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-slate-800 pb-4 sm:flex-row sm:items-center">
        <div>
          <p className="mb-1 text-[11px] uppercase tracking-[0.18em] text-slate-500">
            Properties
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
            Edit property
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Update details for <span className="font-medium">{title}</span>.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Link
            href={`/app/estates/${estateId}/properties`}
            className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-medium text-slate-100 hover:bg-slate-800"
          >
            Back to properties
          </Link>
          <Link
            href={`/app/estates/${estateId}`}
            className="inline-flex items-center rounded-lg border border-slate-800 px-3 py-1.5 font-medium text-slate-300 hover:border-slate-500/70 hover:text-slate-100"
          >
            View estate overview
          </Link>
        </div>
      </div>

      {/* Form */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 shadow-sm shadow-black/40 sm:p-6">
        <PropertyForm
          estateId={estateId}
          mode="edit"
          propertyId={propertyId}
          initialValues={initialValues}
        />
      </div>
    </div>
  );
}