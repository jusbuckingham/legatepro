import Link from "next/link";
import { notFound } from "next/navigation";

import { connectToDatabase, serializeMongoDoc } from "../../../../../lib/db";
import { UtilityAccount } from "../../../../../models/UtilityAccount";
import { EstateProperty } from "../../../../../models/EstateProperty";

interface EstateUtilitiesPageProps {
  params: Promise<{ estateId: string }>;
}

// Shape of the raw Mongoose documents after `.lean()`
type RawUtilityAccount = {
  _id: unknown;
  estateId?: unknown;
  propertyId?: unknown;
  provider?: string;
  type?: string;
  accountNumber?: string;
  status?: "active" | "pending" | "closed";
  isAutoPay?: boolean;
  lastBillAmount?: number;
  lastBillDate?: Date | string;
};

type RawEstateProperty = {
  _id: unknown;
  label?: string;
  addressLine1?: string;
};

type UtilityRow = {
  id: string;
  propertyLabel: string;
  provider: string;
  type: string;
  accountNumber?: string;
  status: "active" | "pending" | "closed";
  isAutoPay?: boolean;
  lastBillAmount?: number;
  lastBillDate?: string;
};

async function getUtilityRows(estateId: string): Promise<UtilityRow[]> {
  await connectToDatabase();

  const accountsRaw = (await UtilityAccount.find({ estateId })
    .sort({ provider: 1, type: 1 })
    .lean()) as RawUtilityAccount[];

  const accounts = accountsRaw
    .map((a) => serializeMongoDoc(a) as Record<string, unknown>)
    .map((a) => {
      const propertyId = a.propertyId != null ? String(a.propertyId) : undefined;
      const lastBillDate = a.lastBillDate as unknown;
      return {
        id: String(a.id ?? ""),
        propertyId,
        provider: typeof a.provider === "string" ? a.provider : "",
        type: typeof a.type === "string" ? a.type : "",
        accountNumber: typeof a.accountNumber === "string" ? a.accountNumber : undefined,
        status:
          a.status === "pending" || a.status === "closed" || a.status === "active"
            ? (a.status as "active" | "pending" | "closed")
            : "active",
        isAutoPay: typeof a.isAutoPay === "boolean" ? a.isAutoPay : undefined,
        lastBillAmount: typeof a.lastBillAmount === "number" ? a.lastBillAmount : undefined,
        lastBillDate,
      };
    });

  if (accounts.length === 0) {
    return [];
  }

  const propertyIds = Array.from(
    new Set(accounts.map((a) => a.propertyId).filter((id): id is string => Boolean(id)))
  );

  const propertiesRaw = (await EstateProperty.find({ _id: { $in: propertyIds } }).lean()) as RawEstateProperty[];

  const properties = propertiesRaw
    .map((p) => serializeMongoDoc(p) as Record<string, unknown>)
    .map((p) => ({
      id: String(p.id ?? ""),
      label: typeof p.label === "string" ? p.label : undefined,
      addressLine1: typeof p.addressLine1 === "string" ? p.addressLine1 : undefined,
    }));

  const propertyLabelById = new Map<string, string>();
  for (const p of properties) {
    if (!p.id) continue;
    const label = p.label || p.addressLine1 || "Property";
    propertyLabelById.set(p.id, label);
  }

  return accounts.map<UtilityRow>((account) => {
    const createdForPropertyId = account.propertyId;
    const propertyLabel = createdForPropertyId
      ? propertyLabelById.get(createdForPropertyId) || "Estate-level"
      : "Estate-level";

    const rawDate = account.lastBillDate;
    const lastBillDateISO = rawDate
      ? rawDate instanceof Date
        ? rawDate.toISOString().slice(0, 10)
        : new Date(String(rawDate)).toISOString().slice(0, 10)
      : undefined;

    return {
      id: account.id,
      propertyLabel,
      provider: account.provider,
      type: account.type,
      accountNumber: account.accountNumber,
      status: account.status,
      isAutoPay: account.isAutoPay,
      lastBillAmount: account.lastBillAmount,
      lastBillDate: lastBillDateISO,
    };
  });
}

export default async function EstateUtilitiesPage({ params }: EstateUtilitiesPageProps) {
  const { estateId } = await params;

  if (!estateId) {
    notFound();
  }

  const utilities = await getUtilityRows(estateId);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <Link
              href={`/app/estates/${estateId}`}
              className="text-sm text-muted-foreground hover:text-foreground hover:underline"
            >
              ← Back to estate
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight">Utilities</h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Track utility accounts tied to each property in this estate — providers, account numbers,
              status, and autopay — so you have everything ready for court accountings and a smooth
              handoff to heirs.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/app/estates/${estateId}/utilities/new`}
              className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              + Add utility account
            </Link>
          </div>
        </div>
      </div>

      {utilities.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/40 p-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold text-foreground">No utilities added yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add provider + account details so you can prevent shutoffs, track autopay, and prep clean court accountings.
            </p>

            <div className="mx-auto mt-5 grid max-w-2xl gap-3 text-left md:grid-cols-3">
              <div className="rounded-xl border bg-background p-4">
                <p className="text-xs font-semibold text-foreground">Step 1</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Add a utility provider (gas, electric, water, internet).
                </p>
              </div>
              <div className="rounded-xl border bg-background p-4">
                <p className="text-xs font-semibold text-foreground">Step 2</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Record account number + status (active/pending/closed).
                </p>
              </div>
              <div className="rounded-xl border bg-background p-4">
                <p className="text-xs font-semibold text-foreground">Step 3</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Track autopay + last bill to avoid surprises.
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <Link
                href={`/app/estates/${estateId}/utilities/new`}
                className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
              >
                + Add utility account
              </Link>
              <Link
                href={`/app/estates/${estateId}/properties`}
                className="inline-flex items-center rounded-md border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-muted/40"
              >
                View properties
              </Link>
              <Link
                href={`/app/estates/${estateId}`}
                className="inline-flex items-center rounded-md border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-muted/40"
              >
                Back to estate
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Provider</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Property</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Account #
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Autopay</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Last bill</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card/50">
              {utilities.map((u) => (
                <tr key={u.id} className="hover:bg-muted/40">
                  <td className="px-4 py-3 font-medium text-foreground">{u.provider}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.type}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.propertyLabel}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {u.accountNumber || (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium
                        ${
                          u.status === "active"
                            ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-600"
                            : u.status === "pending"
                            ? "border-amber-500/40 bg-amber-500/5 text-amber-600"
                            : "border-slate-400/40 bg-slate-400/5 text-slate-600"
                        }`}
                    >
                      <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-current" />
                      {u.status.charAt(0).toUpperCase() + u.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {u.isAutoPay ? (
                      <span className="rounded-full bg-emerald-500/5 px-2 py-0.5 text-xs font-medium text-emerald-600">
                        On
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-400/5 px-2 py-0.5 text-xs font-medium text-slate-600">
                        Off
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {typeof u.lastBillAmount === "number" ? (
                      <span>
                        ${u.lastBillAmount.toFixed(2)}
                        {u.lastBillDate ? ` • ${u.lastBillDate}` : ""}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    <Link
                      href={`/app/estates/${estateId}/utilities/${u.id}`}
                      className="text-primary hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}