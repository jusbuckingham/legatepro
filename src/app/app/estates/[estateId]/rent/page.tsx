import { notFound } from "next/navigation";
import { connectToDatabase } from "../../../../../lib/db";
import { EstateProperty } from "../../../../../models/EstateProperty";
import { RentPayment } from "../../../../../models/RentPayment";

export const dynamic = "force-dynamic";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDate(value?: string | Date): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10); // yyyy-mm-dd
}

type RentPaymentRow = {
  id: string;
  date: string;
  periodLabel: string;
  tenantName: string;
  propertyLabel: string;
  method: string;
  amount: number;
  notes: string;
};

async function loadRentLedger(
  estateId: string
): Promise<{ totalCollected: number; rows: RentPaymentRow[] }> {
  await connectToDatabase();

  const [propertiesRaw, paymentsRaw] = await Promise.all([
    EstateProperty.find({ estateId }).lean(),
    RentPayment.find({ estateId })
      .sort({ receivedDate: -1, createdAt: -1 })
      .lean(),
  ]);

  const propertyNameById: Record<string, string> = {};
  (propertiesRaw as any[]).forEach((p) => {
    const id = String(p._id);
    const label =
      p.nickname ||
      p.addressLine1 ||
      p.address ||
      p.city ||
      "Unlabeled property";
    propertyNameById[id] = label;
  });

  const rows: RentPaymentRow[] = (paymentsRaw as any[]).map((p) => {
    const propertyId = p.propertyId ? String(p.propertyId) : undefined;
    const propertyLabelFromPayment = p.propertyLabel as string | undefined;

    return {
      id: String(p._id),
      date: formatDate(p.receivedDate ?? p.createdAt),
      periodLabel: (p.periodLabel as string | undefined) ?? "",
      tenantName: (p.tenantName as string | undefined) ?? "",
      propertyLabel:
        propertyLabelFromPayment ??
        (propertyId ? propertyNameById[propertyId] : "") ??
        "",
      method: (p.method as string | undefined) ?? "",
      amount: typeof p.amount === "number" ? p.amount : 0,
      notes: (p.notes as string | undefined) ?? "",
    };
  });

  const totalCollected = rows.reduce(
    (sum, row) => sum + (row.amount || 0),
    0
  );

  return { totalCollected, rows };
}

interface PageProps {
  params: {
    estateId: string;
  };
}

export default async function EstateRentPage({ params }: PageProps) {
  const { estateId } = params;

  if (!estateId) {
    notFound();
  }

  const { totalCollected, rows } = await loadRentLedger(estateId);

  return (
    <div className="space-y-6">
      {/* Header + summary */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight text-slate-50">
            Rent ledger
          </h2>
          <p className="text-sm text-slate-400">
            Track rent collected across all estate properties. Use this ledger
            for accounting, tax prep, or your final probate accounting.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-sm">
            <span className="text-xs uppercase tracking-wide text-emerald-300">
              Total collected:{" "}
            </span>
            <span className="font-semibold text-emerald-200">
              {formatCurrency(totalCollected)}
            </span>
          </div>

          <a
            href={`/api/rent/export?estateId=${estateId}`}
            className="inline-flex items-center justify-center rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20"
          >
            Export CSV
          </a>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60">
        {rows.length === 0 ? (
          <div className="p-6 text-sm text-slate-400">
            No rent payments recorded for this estate yet.
          </div>
        ) : (
          <table className="min-w-full border-t border-slate-800 text-xs">
            <thead className="bg-slate-900/80 text-[11px] uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Period</th>
                <th className="px-3 py-2 text-left">Tenant</th>
                <th className="px-3 py-2 text-left">Property</th>
                <th className="px-3 py-2 text-left">Method</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-left">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-900/50">
                  <td className="whitespace-nowrap px-3 py-2 align-top text-slate-200">
                    {row.date || "—"}
                  </td>
                  <td className="px-3 py-2 align-top text-slate-200">
                    {row.periodLabel || "—"}
                  </td>
                  <td className="px-3 py-2 align-top text-slate-200">
                    {row.tenantName || "—"}
                  </td>
                  <td className="px-3 py-2 align-top text-slate-200">
                    {row.propertyLabel || "—"}
                  </td>
                  <td className="px-3 py-2 align-top text-slate-200">
                    {row.method || "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 align-top text-right text-slate-100">
                    {row.amount ? formatCurrency(row.amount) : "—"}
                  </td>
                  <td className="px-3 py-2 align-top text-slate-400">
                    {row.notes || ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}