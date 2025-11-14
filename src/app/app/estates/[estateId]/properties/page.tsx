import { connectToDatabase } from "../../../../../lib/db";
import { EstateProperty } from "../../../../../models/EstateProperty";
import { redirect } from "next/navigation";

interface EstatePropertiesPageProps {
  params: {
    estateId: string;
  };
}

interface EstatePropertyItem {
  _id: { toString(): string };
  estateId: string;
  label: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  propertyType: string;
  bedrooms?: number;
  bathrooms?: number;
  monthlyRentTarget?: number;
  notes?: string;
}

export const dynamic = "force-dynamic";

async function createProperty(formData: FormData) {
  "use server";

  const estateId = formData.get("estateId")?.toString();
  const label = formData.get("label")?.toString().trim();
  const addressLine1 = formData.get("addressLine1")?.toString().trim() || "";
  const city = formData.get("city")?.toString().trim() || "";
  const state = formData.get("state")?.toString().trim() || "";
  const postalCode = formData.get("postalCode")?.toString().trim() || "";
  const propertyType = formData.get("propertyType")?.toString() || "SFR";
  const bedroomsRaw = formData.get("bedrooms")?.toString() || "";
  const bathroomsRaw = formData.get("bathrooms")?.toString() || "";
  const monthlyRentTargetRaw =
    formData.get("monthlyRentTarget")?.toString() || "";
  const notes = formData.get("notes")?.toString().trim() || "";

  if (!estateId || !label) return;

  const bedrooms = bedroomsRaw ? Number(bedroomsRaw) : undefined;
  const bathrooms = bathroomsRaw ? Number(bathroomsRaw) : undefined;
  const monthlyRentTarget = monthlyRentTargetRaw
    ? Number(monthlyRentTargetRaw)
    : undefined;

  await connectToDatabase();

  await EstateProperty.create({
    estateId,
    label,
    addressLine1,
    city,
    state,
    postalCode,
    propertyType,
    bedrooms,
    bathrooms,
    monthlyRentTarget,
    notes,
  });

  redirect(`/app/estates/${estateId}/properties`);
}

export default async function EstatePropertiesPage({
  params,
}: EstatePropertiesPageProps) {
  const { estateId } = params;

  await connectToDatabase();

  const rawProperties = await EstateProperty.find({ estateId })
    .sort({ label: 1 })
    .lean()
    .exec();

  const properties = rawProperties as unknown as EstatePropertyItem[];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Properties</h2>
          <p className="text-sm text-slate-400">
            Track all real estate associated with this estate, including rental
            units, vacant lots, and the primary residence.
          </p>
        </div>
      </div>

      {/* New property form */}
      <form
        action={createProperty}
        className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4"
      >
        <input type="hidden" name="estateId" value={estateId} />

        <div className="grid gap-3 md:grid-cols-[1.4fr,1fr]">
          <div className="space-y-1">
            <label htmlFor="label" className="text-xs font-medium text-slate-200">
              Property label
            </label>
            <input
              id="label"
              name="label"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 outline-none focus:border-emerald-400"
              placeholder="e.g. Dickerson house, Tuller upper/lower"
              required
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="propertyType"
              className="text-xs font-medium text-slate-200"
            >
              Type
            </label>
            <select
              id="propertyType"
              name="propertyType"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs uppercase tracking-wide text-slate-100 outline-none focus:border-emerald-400"
              defaultValue="SFR"
            >
              <option value="SFR">Single-family</option>
              <option value="MULTI">Multi-family</option>
              <option value="CONDO">Condo</option>
              <option value="LAND">Land</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[1.6fr,1fr,0.8fr]">
          <div className="space-y-1">
            <label
              htmlFor="addressLine1"
              className="text-xs font-medium text-slate-200"
            >
              Address
            </label>
            <input
              id="addressLine1"
              name="addressLine1"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 outline-none focus:border-emerald-400"
              placeholder="Street address"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="city" className="text-xs font-medium text-slate-200">
              City
            </label>
            <input
              id="city"
              name="city"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 outline-none focus:border-emerald-400"
              placeholder="City"
            />
          </div>

          <div className="grid grid-cols-[1.1fr,1.2fr] gap-2">
            <div className="space-y-1">
              <label
                htmlFor="state"
                className="text-xs font-medium text-slate-200"
              >
                State
              </label>
              <input
                id="state"
                name="state"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 outline-none focus:border-emerald-400"
                placeholder="MI"
              />
            </div>
            <div className="space-y-1">
              <label
                htmlFor="postalCode"
                className="text-xs font-medium text-slate-200"
              >
                ZIP
              </label>
              <input
                id="postalCode"
                name="postalCode"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 outline-none focus:border-emerald-400"
                placeholder="ZIP"
              />
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr,1fr]">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label
                htmlFor="bedrooms"
                className="text-xs font-medium text-slate-200"
              >
                Bedrooms
              </label>
              <input
                id="bedrooms"
                name="bedrooms"
                type="number"
                min="0"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 outline-none focus:border-emerald-400"
              />
            </div>
            <div className="space-y-1">
              <label
                htmlFor="bathrooms"
                className="text-xs font-medium text-slate-200"
              >
                Bathrooms
              </label>
              <input
                id="bathrooms"
                name="bathrooms"
                type="number"
                min="0"
                step="0.5"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 outline-none focus:border-emerald-400"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="monthlyRentTarget"
              className="text-xs font-medium text-slate-200"
            >
              Target monthly rent (optional)
            </label>
            <input
              id="monthlyRentTarget"
              name="monthlyRentTarget"
              type="number"
              min="0"
              step="0.01"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 outline-none focus:border-emerald-400"
              placeholder="0.00"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="notes" className="text-xs font-medium text-slate-200">
            Notes (optional)
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={2}
            className="w-full resize-none rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 outline-none focus:border-emerald-400"
            placeholder="e.g. current tenant details, repairs needed, realtor contact"
          />
        </div>

        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-emerald-400"
        >
          Add property
        </button>
      </form>

      {/* Properties table */}
      {properties.length === 0 ? (
        <p className="text-sm text-slate-400">
          No properties recorded yet. Add each house, multi-family, condo, or
          land parcel associated with this estate.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/40">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2">Label</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Address</th>
                <th className="px-3 py-2">Beds/Baths</th>
                <th className="px-3 py-2 text-right">Target rent</th>
              </tr>
            </thead>
            <tbody>
              {properties.map((property: EstatePropertyItem) => {
                const addressParts = [
                  property.addressLine1,
                  property.city,
                  property.state,
                  property.postalCode,
                ].filter(Boolean);

                const typeLabel =
                  property.propertyType === "SFR"
                    ? "Single-family"
                    : property.propertyType === "MULTI"
                    ? "Multi-family"
                    : property.propertyType === "CONDO"
                    ? "Condo"
                    : property.propertyType === "LAND"
                    ? "Land"
                    : "Other";

                return (
                  <tr
                    key={property._id.toString()}
                    className="border-t border-slate-800"
                  >
                    <td className="px-3 py-2 align-top text-slate-100">
                      {property.label}
                    </td>
                    <td className="px-3 py-2 align-top text-slate-300">
                      {typeLabel}
                    </td>
                    <td className="px-3 py-2 align-top text-slate-300">
                      {addressParts.length > 0
                        ? addressParts.join(", ")
                        : "—"}
                    </td>
                    <td className="px-3 py-2 align-top text-slate-300">
                      {property.bedrooms ?? "-"}
                      /
                      {property.bathrooms ?? "-"}
                    </td>
                    <td className="px-3 py-2 align-top text-right text-slate-100">
                      {property.monthlyRentTarget
                        ? `$${Number(
                            property.monthlyRentTarget
                          ).toFixed(2)}`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}