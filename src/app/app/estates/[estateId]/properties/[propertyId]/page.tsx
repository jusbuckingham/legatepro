import Link from "next/link";
import { notFound } from "next/navigation";
import { connectToDatabase } from "../../../../../../lib/db";
import { EstateProperty } from "../../../../../../models/EstateProperty";

export const dynamic = "force-dynamic";

interface PropertyPageProps {
  params: {
    estateId: string;
    propertyId: string;
  };
}

interface PropertyItem {
  _id: unknown;
  estateId: string;
  label: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  monthlyRentTarget?: number;
  notes?: string;
}

function formatAddress(property: PropertyItem) {
  const line1 = property.addressLine1 || "";
  const line2 = property.addressLine2 || "";
  const cityState = [property.city, property.state].filter(Boolean).join(", ");
  const postal = property.postalCode || "";

  return [
    [line1, line2].filter(Boolean).join(" "),
    [cityState, postal].filter(Boolean).join(" "),
  ]
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

function formatRent(value?: number) {
  if (value == null || Number.isNaN(value)) return "–";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export default async function PropertyPage({ params }: PropertyPageProps) {
  const { estateId, propertyId } = params;

  await connectToDatabase();

  const property = (await EstateProperty.findOne({
    _id: propertyId,
    estateId,
  }).lean()) as PropertyItem | null;

  if (!property) {
    notFound();
  }

  const address = formatAddress(property);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <Link
            href={`/app/estates/${estateId}/properties`}
            className="inline-flex items-center gap-1 rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-[11px] font-medium text-slate-300 hover:border-slate-600 hover:text-slate-100"
          >
            <span className="text-slate-500">←</span>
            Properties
          </Link>
          <span className="text-slate-600">/</span>
          <span
            className="max-w-xs truncate text-slate-300"
            title={property.label}
          >
            {property.label}
          </span>
        </div>

        <Link
          href={`/app/estates/${estateId}/properties/${propertyId}/edit`}
          className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-[11px] font-medium text-slate-200 hover:border-slate-500 hover:text-white"
        >
          Edit property
        </Link>
      </div>

      <header className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight text-slate-50 md:text-2xl">
              {property.label}
            </h1>
            {address && (
              <pre className="whitespace-pre-wrap text-[11px] text-slate-300">
                {address}
              </pre>
            )}
          </div>

          <div className="grid gap-2 text-right text-xs text-slate-300">
            {property.propertyType && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">
                  Type
                </p>
                <p className="font-medium text-slate-100">
                  {property.propertyType}
                </p>
              </div>
            )}
            {(property.bedrooms != null || property.bathrooms != null) && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">
                  Beds / baths
                </p>
                <p className="font-medium text-slate-100">
                  {property.bedrooms ?? "–"} bd ·{" "}
                  {property.bathrooms ?? "–"} ba
                </p>
              </div>
            )}
            {property.monthlyRentTarget != null && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">
                  Target rent
                </p>
                <p className="font-medium text-emerald-300">
                  {formatRent(property.monthlyRentTarget)}/mo
                </p>
              </div>
            )}
          </div>
        </div>

        {property.notes && (
          <p className="mt-2 text-xs text-slate-300">{property.notes}</p>
        )}
        <p className="mt-2 text-[11px] text-slate-400">
          This is the profile for this property inside the estate. Use the tiles below
          to jump into rent, utilities, and documents that all tie back to this address.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <Link
          href={`/app/estates/${estateId}/properties/${propertyId}/rent`}
          className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 transition-colors hover:border-emerald-500/60 hover:bg-slate-900"
        >
          <h2 className="text-sm font-semibold text-slate-50">
            Rent &amp; tenant
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Track monthly rent, tenant info, and receipts for this specific
            property.
          </p>
        </Link>

        <Link
          href={`/app/estates/${estateId}/properties/${propertyId}/utilities`}
          className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 transition-colors hover:border-emerald-500/60 hover:bg-slate-900"
        >
          <h2 className="text-sm font-semibold text-slate-50">Utilities</h2>
          <p className="mt-1 text-xs text-slate-400">
            See gas, electric, water, trash, and other utility accounts tied to
            this address.
          </p>
        </Link>

        <Link
          href={`/app/estates/${estateId}/properties/${propertyId}/documents`}
          className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 transition-colors hover:border-emerald-500/60 hover:bg-slate-900"
        >
          <h2 className="text-sm font-semibold text-slate-50">Documents</h2>
          <p className="mt-1 text-xs text-slate-400">
            Deeds, tax bills, insurance policies, violations, and other
            property-specific documents.
          </p>
        </Link>

        <Link
          href={`/app/estates/${estateId}/properties/${propertyId}/edit`}
          className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 transition-colors hover:border-slate-600 hover:bg-slate-900"
        >
          <h2 className="text-sm font-semibold text-slate-50">
            Property settings
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Update details like address, type, rent target, and internal notes
            for this property.
          </p>
        </Link>
      </section>
    </div>
  );
}