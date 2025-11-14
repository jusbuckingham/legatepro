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
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
          Utilities
        </h1>
        {property && (
          <p className="text-sm text-slate-400">
            Utility accounts linked to{" "}
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
        )}
      </header>

      {utilities.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/60 px-6 py-8 text-sm text-slate-300">
          <p className="font-medium text-slate-100">No utilities added yet.</p>
          <p className="mt-1 text-slate-400">
            When you add utility accounts, they will appear here with provider
            names, account numbers, and status.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-700 bg-slate-900/50 overflow-hidden">
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
                  <td className="px-4 py-2 text-slate-200">{u.provider}</td>
                  <td className="px-4 py-2 text-slate-200 capitalize">
                    {u.type}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-300">
                    {u.accountNumber || "—"}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.status === "active"
                          ? "bg-green-700/20 text-green-300"
                          : "bg-slate-700 text-slate-300"
                      }`}
                    >
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-400 text-xs">
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