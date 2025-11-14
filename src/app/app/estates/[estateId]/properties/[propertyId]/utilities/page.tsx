export const dynamic = "force-dynamic";

import Link from "next/link";
import { connectToDatabase } from "../../../../../../../lib/db";
import { UtilityAccount } from "../../../../../../../models/UtilityAccount";
import { EstateProperty } from "../../../../../../../models/EstateProperty";

interface PropertyUtilitiesPageProps {
  params: {
    estateId: string;
    propertyId: string;
  };
}

interface PropertyItem {
  _id: { toString(): string };
  label: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
}

interface UtilityItem {
  _id: { toString(): string };
  estateId: { toString(): string };
  propertyId?: { toString(): string };
  provider?: string;
  type?: string;
  accountNumber?: string;
  status?: string;
  notes?: string;
}

function formatAddress(property: PropertyItem) {
  const line1 = property.addressLine1 || "";
  const line2 = property.addressLine2 || "";
  const cityState = [property.city, property.state].filter(Boolean).join(", ");
  const postal = property.postalCode || "";

  return [line1, line2, [cityState, postal].filter(Boolean).join(" ")]
    .filter((line) => line.trim().length > 0)
    .join(" · ");
}

export default async function PropertyUtilitiesPage({
  params,
}: PropertyUtilitiesPageProps) {
  const { estateId, propertyId } = params;

  await connectToDatabase();

  // Fetch property metadata
  const property = (await EstateProperty.findOne({
    _id: propertyId,
    estateId,
  }).lean()) as PropertyItem | null;

  // Fetch utility accounts for this property
  const utilities = (await UtilityAccount.find({
    estateId,
    propertyId,
  })
    .sort({ provider: 1 })
    .lean()) as unknown as UtilityItem[];

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
              Utilities
            </h1>
            {property && (
              <>
                <p className="text-sm text-slate-400">
                  Accounts linked to{" "}
                  <span className="font-medium text-slate-200">
                    {property.label}
                  </span>
                  {formatAddress(property) && (
                    <>
                      {" "}
                      —{" "}
                      <span className="font-mono text-xs">
                        {formatAddress(property)}
                      </span>
                    </>
                  )}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Keep power, water, gas, and internet organized so you can show
                  the court that everything stayed current while you served as
                  personal representative.
                </p>
              </>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <Link
              href={`/app/estates/${estateId}/properties/${propertyId}`}
              className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 text-xs font-medium text-slate-200 hover:border-rose-500/70 hover:text-rose-100"
            >
              ← Back to property overview
            </Link>
            <Link
              href={`/app/estates/${estateId}/properties/${propertyId}/utilities/new`}
              className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-rose-500"
            >
              + Add utility account
            </Link>
          </div>
        </div>
      </header>

      {utilities.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/60 px-6 py-8 text-sm text-slate-300">
          <p className="font-medium text-slate-100">No utilities added yet.</p>
          <p className="mt-1 text-slate-400">
            Track electric, gas, water, trash, internet, and other services for
            this property. You&apos;ll be able to show exactly what was paid
            during probate.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900/50">
          <table className="min-w-full divide-y divide-slate-700 text-sm">
            <thead className="bg-slate-800/40">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-slate-300">
                  Provider
                </th>
                <th className="px-4 py-2 text-left font-medium text-slate-300">
                  Type
                </th>
                <th className="px-4 py-2 text-left font-medium text-slate-300">
                  Account #
                </th>
                <th className="px-4 py-2 text-left font-medium text-slate-300">
                  Status
                </th>
                <th className="px-4 py-2 text-left font-medium text-slate-300">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {utilities.map((u: UtilityItem) => (
                <tr key={u._id.toString()} className="hover:bg-slate-800/30">
                  <td className="px-4 py-2 text-slate-200">
                    {u.provider || "—"}
                  </td>
                  <td className="px-4 py-2 text-slate-200 capitalize">
                    {u.type || "—"}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-300">
                    {u.accountNumber || "—"}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.status === "active"
                          ? "bg-green-700/20 text-green-300"
                          : u.status === "closed"
                          ? "bg-slate-700/80 text-slate-200"
                          : "bg-slate-800/80 text-slate-300"
                      }`}
                    >
                      {u.status || "unknown"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-400">
                    {u.notes || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}