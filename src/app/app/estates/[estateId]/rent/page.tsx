import { connectToDatabase } from "@/lib/db";
import { EstateProperty } from "@/models/EstateProperty";
import { RentPayment } from "@/models/RentPayment";
import { redirect } from "next/navigation";

interface EstateRentPageProps {
  params: {
    estateId: string;
  };
}

export const dynamic = "force-dynamic";

async function recordRentPayment(formData: FormData) {
  "use server";

  const estateId = formData.get("estateId")?.toString();
  const propertyId = formData.get("propertyId")?.toString() || undefined;
  const tenantName = formData.get("tenantName")?.toString().trim();
  const periodMonthRaw = formData.get("periodMonth")?.toString();
  const periodYearRaw = formData.get("periodYear")?.toString();
  const amountRaw = formData.get("amount")?.toString();
  const paymentDateStr = formData.get("paymentDate")?.toString();
  const method = formData.get("method")?.toString().trim() || "";
  const reference = formData.get("reference")?.toString().trim() || "";
  const notes = formData.get("notes")?.toString().trim() || "";

  if (
    !estateId ||
    !tenantName ||
    !periodMonthRaw ||
    !periodYearRaw ||
    !amountRaw ||
    !paymentDateStr
  ) {
    return;
  }

  const periodMonth = Number(periodMonthRaw);
  const periodYear = Number(periodYearRaw);
  const amount = Number(amountRaw);

  if (!periodMonth || !periodYear || Number.isNaN(amount)) return;

  const paymentDate = new Date(paymentDateStr);

  await connectToDatabase();

  await RentPayment.create({
    estateId,
    propertyId: propertyId || undefined,
    tenantName,
    periodMonth,
    periodYear,
    amount,
    paymentDate,
    method,
    reference,
    notes,
  });

  redirect(`/app/estates/${estateId}/rent`);
}

export default async function EstateRentPage({ params }: EstateRentPageProps) {
  const { estateId } = params;

  await connectToDatabase();

  const [properties, rentPayments] = await Promise.all([
    EstateProperty.find({ estateId }).sort({ label: 1 }).lean(),
    RentPayment.find({ estateId })
      .sort({ periodYear: -1, periodMonth: -1, paymentDate: -1 })
      .lean(),
  ]);

  const totals = rentPayments.reduce(
    (acc: { total: number }, payment: any) => {
      acc.total += Number(payment.amount) || 0;
      return acc;
    },
    { total: 0 }
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Rent ledger</h2>
          <p className="text-sm text-slate-400">
            Record rent received for any rental properties in this estate so you
            can report income cleanly at the end.
          </p>
        </div>

        <div className="text-sm text-slate-300">
          <span className="text-xs uppercase tracking-wide text-slate-400">
            Total collected:{" "}
          </span>
          <span className="font-semibold text-emerald-300">
            ${totals.total.toFixed(2)}
          </span>
        </div>
      </div>

      {/* New rent payment form */}
      <form
        action={recordRentPayment}
        className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4"
      >
        <input type="hidden" name="estateId" value={estateId} />

        <div className="grid gap-3 md:grid-cols-[1.2fr,1fr]">
          <div className="space-y-1">
            <label
              htmlFor="tenantName"
              className="text-xs font-medium text-slate-200"
            >
              Tenant / payer name
            </label>
            <input
              id="tenantName"
              name="tenantName"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 outline-none focus:border-emerald-400"
              placeholder="e.g. John Doe (upper), Jane Smith (lower)"
              required
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="propertyId"
              className="text-xs font-medium text-slate-200"
            >
              Property (optional)
            </label>
            <select
              id="propertyId"
              name="propertyId"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-emerald-400"
              defaultValue=""
            >
              <option value="">Not linked</option>
              {properties.map((property: any) => (
                <option
                  key={property._id.toString()}
                  value={property._id.toString()}
                >
                  {property.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[0.8fr,0.8fr,1fr,1fr]">
          <div className="space-y-1">
            <label
              htmlFor="periodMonth"
              className="text-xs font-medium text-slate-200"
            >
              Month
            </label>
            <select
              id="periodMonth"
              name="periodMonth"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-emerald-400"
              defaultValue={new Date().getMonth() + 1}
              required
            >
              <option value="1">January</option>
              <option value="2">February</option>
              <option value="3">March</option>
              <option value="4">April</option>
              <option value="5">May</option>
              <option value="6">June</option>
              <option value="7">July</option>
              <option value="8">August</option>
              <option value="9">September</option>
              <option value="10">October</option>
              <option value="11">November</option>
              <option value="12">December</option>
            </select>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="periodYear"
              className="text-xs font-medium text-slate-200"
            >
              Year
            </label>
            <input
              id="periodYear"
              name="periodYear"
              type="number"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 outline-none focus:border-emerald-400"
              defaultValue={new Date().getFullYear()}
              required
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="paymentDate"
              className="text-xs font-medium text-slate-200"
            >
              Payment date
            </label>
            <input
              id="paymentDate"
              name="paymentDate"
              type="date"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 outline-none focus:border-emerald-400"
              required
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="amount"
              className="text-xs font-medium text-slate-200"
            >
              Amount
            </label>
            <input
              id="amount"
              name="amount"
              type="number"
              step="0.01"
              min="0"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 outline-none focus:border-emerald-400"
              placeholder="0.00"
              required
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr,1fr]">
          <div className="space-y-1">
            <label
              htmlFor="method"
              className="text-xs font-medium text-slate-200"
            >
              Payment method (optional)
            </label>
            <input
              id="method"
              name="method"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 outline-none focus:border-emerald-400"
              placeholder="e.g. Cash, Zelle, money order"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="reference"
              className="text-xs font-medium text-slate-200"
            >
              Reference / confirmation # (optional)
            </label>
            <input
              id="reference"
              name="reference"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 outline-none focus:border-emerald-400"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="notes" className="text-xs font-medium text-slate-200">
            Notes (optional)
          </label>
          <input
            id="notes"
            name="notes"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 outline-none focus:border-emerald-400"
            placeholder="e.g. covers July + August, partial payment, paid in cash"
          />
        </div>

        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-emerald-400"
        >
          Record rent payment
        </button>
      </form>

      {/* Rent payments table */}
      {rentPayments.length === 0 ? (
        <p className="text-sm text-slate-400">
          No rent payments recorded yet. Use this ledger to track all rent
          received while you&apos;re serving as personal representative.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/40">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2">Period</th>
                <th className="px-3 py-2">Tenant</th>
                <th className="px-3 py-2">Property</th>
                <th className="px-3 py-2">Payment date</th>
                <th className="px-3 py-2">Method</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rentPayments.map((payment: any) => {
                const property = properties.find(
                  (p: any) => p._id.toString() === payment.propertyId?.toString()
                );

                const periodLabel = `${payment.periodMonth
                  .toString()
                  .padStart(2, "0")}/${payment.periodYear}`;

                const paymentDate = payment.paymentDate
                  ? new Date(payment.paymentDate).toLocaleDateString()
                  : "—";

                return (
                  <tr
                    key={payment._id.toString()}
                    className="border-t border-slate-800"
                  >
                    <td className="px-3 py-2 align-top text-slate-300">
                      {periodLabel}
                    </td>
                    <td className="px-3 py-2 align-top text-slate-100">
                      {payment.tenantName}
                    </td>
                    <td className="px-3 py-2 align-top text-slate-300">
                      {property ? property.label : "—"}
                    </td>
                    <td className="px-3 py-2 align-top text-slate-300">
                      {paymentDate}
                    </td>
                    <td className="px-3 py-2 align-top text-slate-300">
                      {payment.method || "—"}
                    </td>
                    <td className="px-3 py-2 align-top text-right text-slate-100">
                      ${Number(payment.amount || 0).toFixed(2)}
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