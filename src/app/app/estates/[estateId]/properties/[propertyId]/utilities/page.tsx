export const dynamic = "force-dynamic";

import Link from "next/link";
import { connectToDatabase, serializeMongoDoc } from "@/lib/db";
import { UtilityAccount } from "@/models/UtilityAccount";
import { EstateProperty } from "@/models/EstateProperty";

interface PropertyUtilitiesPageProps {
  params: {
    estateId: string;
    propertyId: string;
  };
}

interface PropertyItem {
  id: string;
  label: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
}

interface UtilityItem {
  id: string;
  estateId: string;
  propertyId?: string;
  provider?: string;
  type?: string;
  accountNumber?: string;
  status?: string;
  notes?: string;
}

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object" && "toString" in value) {
    const fn = (value as { toString?: () => string }).toString;
    if (typeof fn === "function") return fn.call(value);
  }
  return "";
}

function toPropertyItem(input: unknown): PropertyItem | null {
  if (!isPlainObject(input)) return null;
  const raw = serializeMongoDoc(input) as PlainObject;

  const id = asString(raw.id);
  const label = asString(raw.label);
  if (!id || !label) return null;

  return {
    id,
    label,
    addressLine1: asString(raw.addressLine1) || undefined,
    addressLine2: asString(raw.addressLine2) || undefined,
    city: asString(raw.city) || undefined,
    state: asString(raw.state) || undefined,
    postalCode: asString(raw.postalCode) || undefined,
  };
}

function toUtilityItem(input: unknown): UtilityItem | null {
  if (!isPlainObject(input)) return null;
  const raw = serializeMongoDoc(input) as PlainObject;

  const id = asString(raw.id);
  const estateId = asString(raw.estateId);
  if (!id || !estateId) return null;

  return {
    id,
    estateId,
    propertyId: asString(raw.propertyId) || undefined,
    provider: asString(raw.provider) || undefined,
    type: asString(raw.type) || undefined,
    accountNumber: asString(raw.accountNumber) || undefined,
    status: asString(raw.status) || undefined,
    notes: asString(raw.notes) || undefined,
  };
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
  const propertyRaw = (await EstateProperty.findOne({
    _id: propertyId,
    estateId,
  })
    .lean()
    .exec()) as unknown;

  const property = toPropertyItem(propertyRaw);

  // Fetch utility accounts for this property
  const utilitiesRaw = (await UtilityAccount.find({
    estateId,
    propertyId,
  })
    .sort({ provider: 1 })
    .lean()
    .exec()) as unknown;

  const utilities = (Array.isArray(utilitiesRaw) ? utilitiesRaw : [])
    .map((u) => toUtilityItem(u))
    .filter((u): u is UtilityItem => Boolean(u));

  const address = property ? formatAddress(property) : "";

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div className="flex flex-col gap-2">
          <nav className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <Link
              href="/app/estates"
              className="hover:text-slate-200"
            >
              Estates
            </Link>
            <span className="text-slate-600">/</span>
            <Link
              href={`/app/estates/${estateId}`}
              className="hover:text-slate-200"
            >
              Estate
            </Link>
            <span className="text-slate-600">/</span>
            <Link
              href={`/app/estates/${estateId}/properties`}
              className="hover:text-slate-200"
            >
              Properties
            </Link>
            <span className="text-slate-600">/</span>
            <Link
              href={`/app/estates/${estateId}/properties/${propertyId}`}
              className="hover:text-slate-200"
            >
              Property
            </Link>
            <span className="text-slate-600">/</span>
            <span className="text-slate-200">Utilities</span>
          </nav>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
                Utilities
              </h1>
              {property ? (
                <>
                  <p className="text-sm text-slate-400">
                    Accounts linked to{" "}
                    <span className="font-medium text-slate-200">
                      {property.label}
                    </span>
                    {address ? (
                      <>
                        {" "}—{" "}
                        <span className="font-mono text-xs">{address}</span>
                      </>
                    ) : null}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Track power, water, gas, internet, and other services so you
                    can show exactly what stayed current during probate.
                  </p>
                </>
              ) : (
                <p className="text-sm text-slate-400">
                  Track power, water, gas, internet, and other services for this
                  property.
                </p>
              )}
            </div>

            <div className="flex flex-col items-start gap-2 sm:items-end">
              <Link
                href={`/app/estates/${estateId}/properties/${propertyId}/utilities/new`}
                className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-rose-500"
              >
                + Add utility account
              </Link>
              <Link
                href={`/app/estates/${estateId}/properties/${propertyId}`}
                className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 text-xs font-medium text-slate-200 hover:border-rose-500/70 hover:text-rose-100"
              >
                ← Back to property
              </Link>
            </div>
          </div>
        </div>
      </header>

      {utilities.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/60 px-6 py-8 text-sm text-slate-300">
          <p className="font-medium text-slate-100">No utility accounts yet.</p>
          <p className="mt-1 text-slate-400">
            Add electric, gas, water, trash, internet, and other services for
            this property so you have a clean record of what was paid.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/app/estates/${estateId}/properties/${propertyId}/utilities/new`}
              className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-rose-500"
            >
              + Add utility account
            </Link>
            <Link
              href={`/app/estates/${estateId}/properties/${propertyId}`}
              className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-rose-500/70 hover:text-rose-100"
            >
              Back to property
            </Link>
          </div>
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
                <tr key={u.id} className="hover:bg-slate-800/30">
                  <td className="px-4 py-2 text-slate-200">
                    <Link
                      href={`/app/estates/${estateId}/properties/${propertyId}/utilities/${u.id}`}
                      className="font-medium hover:text-rose-200"
                    >
                      {u.provider || "Utility account"}
                    </Link>
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
                        (u.status || "").toLowerCase() === "active"
                          ? "bg-green-700/20 text-green-300"
                          : (u.status || "").toLowerCase() === "closed"
                          ? "bg-slate-700/80 text-slate-200"
                          : "bg-slate-800/80 text-slate-300"
                      }`}
                    >
                      {(u.status || "unknown").toLowerCase()}
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