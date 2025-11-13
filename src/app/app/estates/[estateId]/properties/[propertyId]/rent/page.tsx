import { notFound } from "next/navigation";
import { connectToDatabase } from "../../../../../../lib/db";
import { EstateProperty } from "../../../../../../models/EstateProperty";
import { RentPayment } from "../../../../../../models/RentPayment";

export const dynamic = "force-dynamic";

interface PropertyRentPageProps {
  params: {
    estateId: string;
    propertyId: string;
  };
}

interface PropertyItem {
  _id: unknown;
  label: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
}

interface RentPaymentItem {
  _id: unknown;
  estateId: string;
  propertyId?: unknown;
  tenantName?: string;
  periodMonth?: number;
  periodYear?: number;
  amount?: number;
  paymentDate?: string | Date;
  method?: string;
  reference?: string;
  notes?: string;
}

function formatCurrency(value?: number) {
  if (value == null || Number.isNaN(value)) return "–";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function formatDate(value?: string | Date) {
  if (!value) return "–";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "–";
  return d.toLocaleDateString();
}

function formatPeriod(month?: number, year?: number) {
  if (!month || !year) return "–";
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
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

export default async function PropertyRentPage({
  params,
}: PropertyRentPageProps) {
  const { estateId, propertyId } = params;

  await connectToDatabase();

  const property = (await EstateProperty.findOne({
    _id: propertyId,
    estateId,
  }).lean()) as PropertyItem | null;

  if (!property) {
    notFound();
  }

  const rentPayments = (await RentPayment.find({
    estateId,
    propertyId,
  })
    .sort({ periodYear: -1, periodMonth: -1, paymentDate: -1 })
    .lean()) as RentPaymentItem[];

  const hasPayments = rentPayments.length > 0;

  const totalCollected = rentPayments.reduce((sum, payment) => {
    return sum + (payment.amount ?? 0);
  }, 0);

  const lastPaymentDate = rentPayments[0]?.paymentDate;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
          Rent &amp; tenant
        </h1>
        <p className="text-sm text-slate-400">
          Rent history for{" "}
          <span className="font-medium text-slate-100">{property.label}</span>
          {formatAddress(property) && (
            <>
              {" "}
              <span className="text-slate-500">·</span>{" "}
              <span>{formatAddress(property)}</span>
            </>
          )}
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm">
          <p className="text-xs text-slate-400">Total collected</p>
          <p className="mt-1 text-lg font-semibold text-slate-50">
            {formatCurrency(totalCollected)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm">
          <p className="text-xs text-slate-400">Payments</p>
          <p className="mt-1 text-lg font-semibold text-slate-50">
            {rentPayments.length}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm">
          <p className="text-xs text-slate-400">Last payment</p>
          <p className="mt-1 text-lg font-semibold text-slate-50">
            {lastPaymentDate ? formatDate(lastPaymentDate) : "—"}
          </p>
        </div>
      </section>

      {!hasPayments ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 px-6 py-8 text-sm text-slate-300">
          <p className="font-medium text-slate-100">
            No rent payments recorded yet for this property.
          </p>
          <p className="mt-1 text-slate-400">
            As you receive rent, record each payment so you can generate a clean
            ledger and receipts tied specifically to this address.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/60 text-sm">
          <table className="min-w-full divide-y divide-slate-800">
            <thead className="bg-slate-950/80">
              <tr className="text-xs uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2 text-left">Period</th>
                <th className="px-3 py-2 text-left">Tenant</th>
                <th className="px-3 py-2 text-left">Payment date</th>
                <th className="px-3 py-2 text-left">Method</th>
                <th className="px-3 py-2 text-left">Reference</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rentPayments.map((payment) => (
                <tr key={String(payment._id)} className="text-xs text-slate-200">
                  <td className="whitespace-nowrap px-3 py-2">
                    {formatPeriod(payment.periodMonth, payment.periodYear)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {payment.tenantName || "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {formatDate(payment.paymentDate)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {payment.method || "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {payment.reference || "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {formatCurrency(payment.amount)}
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