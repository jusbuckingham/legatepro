import { connectToDatabase } from "@/lib/db";
import { RentPayment } from "@/models/RentPayment";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";

interface PageProps {
  params: Promise<{
    estateId: string;
    paymentId: string;
  }>;
}

type LeanRentPayment = {
  _id: string;
  estateId: string;
  propertyId?: string;
  tenantName: string;
  periodMonth: number;
  periodYear: number;
  amount: number;
  paymentDate: string; // ISO date string
  method?: string;
  reference?: string;
  notes?: string;
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function formatDisplayDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function formatDateInputFromISO(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function formatPeriod(month: number, year: number): string {
  if (!month || !year) return "—";
  const idx = month - 1;
  const label = MONTH_NAMES[idx] ?? `Month ${month}`;
  return `${label} ${year}`;
}

async function loadPayment(
  estateId: string,
  paymentId: string
): Promise<LeanRentPayment | null> {
  await connectToDatabase();

  const doc = await RentPayment.findOne({
    _id: paymentId,
    estateId,
  }).lean();

  if (!doc) return null;

  return {
    _id: String(doc._id),
    estateId: String(doc.estateId),
    propertyId: doc.propertyId ? String(doc.propertyId) : undefined,
    tenantName: doc.tenantName ?? "",
    periodMonth: typeof doc.periodMonth === "number" ? doc.periodMonth : 0,
    periodYear: typeof doc.periodYear === "number" ? doc.periodYear : 0,
    amount: typeof doc.amount === "number" ? doc.amount : 0,
    paymentDate: doc.paymentDate
      ? new Date(doc.paymentDate as Date).toISOString()
      : new Date().toISOString(),
    method: doc.method ?? "",
    reference: doc.reference ?? "",
    notes: doc.notes ?? "",
  };
}

export default async function RentPaymentDetailPage({ params }: PageProps) {
  const { estateId, paymentId } = await params;

  const payment = await loadPayment(estateId, paymentId);
  if (!payment) {
    notFound();
  }

  // --- Server actions ---

  async function updatePayment(formData: FormData) {
    "use server";

    const amountRaw = formData.get("amount") as string | null;
    const amount = amountRaw ? Number.parseFloat(amountRaw) : 0;

    const paymentDateRaw = formData.get("paymentDate") as string | null;
    const periodMonthRaw = formData.get("periodMonth") as string | null;
    const periodYearRaw = formData.get("periodYear") as string | null;

    const tenantName = (formData.get("tenantName") as string | null) ?? "";
    const method = (formData.get("method") as string | null) ?? "";
    const reference = (formData.get("reference") as string | null) ?? "";
    const notes = (formData.get("notes") as string | null) ?? "";

    await connectToDatabase();

    await RentPayment.findOneAndUpdate(
      {
        _id: paymentId,
        estateId,
      },
      {
        tenantName,
        amount,
        periodMonth: periodMonthRaw
          ? Number.parseInt(periodMonthRaw, 10)
          : undefined,
        periodYear: periodYearRaw
          ? Number.parseInt(periodYearRaw, 10)
          : undefined,
        paymentDate: paymentDateRaw ? new Date(paymentDateRaw) : undefined,
        method,
        reference,
        notes,
      },
      { new: true }
    );

    revalidatePath(`/app/estates/${estateId}/rent`);
    redirect(`/app/estates/${estateId}/rent`);
  }

  async function deletePayment() {
    "use server";

    await connectToDatabase();

    await RentPayment.findOneAndDelete({
      _id: paymentId,
      estateId,
    });

    revalidatePath(`/app/estates/${estateId}/rent`);
    redirect(`/app/estates/${estateId}/rent`);
  }

  // --- UI ---

  return (
    <div className="space-y-6 p-6">
      {/* Breadcrumbs */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-400">
            Rent ledger
          </div>
          <h1 className="mt-1 text-xl font-semibold text-slate-50">
            Rent payment detail
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            View and update this rent transaction, or delete it if it was
            entered in error.
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href={`/app/estates/${estateId}/rent`}
            className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
          >
            Back to rent ledger
          </Link>

          <form action={deletePayment}>
            <button
              type="submit"
              className="rounded-full border border-rose-900/70 bg-rose-950/40 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-900/70 hover:text-rose-50"
            >
              Delete payment
            </button>
          </form>
        </div>
      </div>

      {/* Summary card */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Tenant
            </div>
            <div className="text-sm font-semibold text-slate-50">
              {payment.tenantName || "Unknown tenant"}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              Period: {formatPeriod(payment.periodMonth, payment.periodYear)}
            </div>
          </div>

          <div className="flex flex-wrap gap-6 text-xs">
            <div>
              <div className="font-medium text-slate-400">Amount</div>
              <div className="text-base font-semibold text-emerald-300">
                ${Number(payment.amount || 0).toLocaleString()}
              </div>
            </div>
            <div>
              <div className="font-medium text-slate-400">Payment date</div>
              <div className="mt-0.5 text-slate-100">
                {formatDisplayDate(payment.paymentDate)}
              </div>
            </div>
            <div>
              <div className="font-medium text-slate-400">Method</div>
              <div className="mt-0.5 text-slate-100">
                {payment.method || "—"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit form */}
      <form
        action={updatePayment}
        className="grid gap-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm md:grid-cols-2"
      >
        <div className="md:col-span-2">
          <h2 className="text-sm font-semibold text-slate-100">
            Edit payment details
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Adjust the amount, dates, tenant info, and bookkeeping metadata.
          </p>
        </div>

        {/* Tenant */}
        <div className="space-y-1.5">
          <label
            htmlFor="tenantName"
            className="block text-xs font-medium text-slate-300"
          >
            Tenant name
          </label>
          <input
            id="tenantName"
            name="tenantName"
            defaultValue={payment.tenantName || ""}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-50 outline-none ring-0 placeholder:text-slate-500 focus:border-rose-500"
          />
        </div>

        {/* Amount */}
        <div className="space-y-1.5">
          <label
            htmlFor="amount"
            className="block text-xs font-medium text-slate-300"
          >
            Amount (USD)
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            step="0.01"
            min="0"
            defaultValue={payment.amount?.toString() ?? ""}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-50 outline-none ring-0 placeholder:text-slate-500 focus:border-rose-500"
          />
        </div>

        {/* Period month/year */}
        <div className="space-y-1.5">
          <label
            htmlFor="periodMonth"
            className="block text-xs font-medium text-slate-300"
          >
            Period month (1–12)
          </label>
          <input
            id="periodMonth"
            name="periodMonth"
            type="number"
            min={1}
            max={12}
            defaultValue={payment.periodMonth || ""}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-50 outline-none ring-0 placeholder:text-slate-500 focus:border-rose-500"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="periodYear"
            className="block text-xs font-medium text-slate-300"
          >
            Period year
          </label>
          <input
            id="periodYear"
            name="periodYear"
            type="number"
            min={1900}
            max={9999}
            defaultValue={payment.periodYear || ""}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-50 outline-none ring-0 placeholder:text-slate-500 focus:border-rose-500"
          />
        </div>

        {/* Payment date */}
        <div className="space-y-1.5">
          <label
            htmlFor="paymentDate"
            className="block text-xs font-medium text-slate-300"
          >
            Payment date
          </label>
          <input
            id="paymentDate"
            name="paymentDate"
            type="date"
            defaultValue={formatDateInputFromISO(payment.paymentDate)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-50 outline-none ring-0 focus:border-rose-500"
          />
        </div>

        {/* Method */}
        <div className="space-y-1.5">
          <label
            htmlFor="method"
            className="block text-xs font-medium text-slate-300"
          >
            Payment method
          </label>
          <input
            id="method"
            name="method"
            defaultValue={payment.method || ""}
            placeholder="e.g. Cash, Check, ACH"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-50 outline-none ring-0 placeholder:text-slate-500 focus:border-rose-500"
          />
        </div>

        {/* Reference */}
        <div className="space-y-1.5">
          <label
            htmlFor="reference"
            className="block text-xs font-medium text-slate-300"
          >
            Reference / check #
          </label>
          <input
            id="reference"
            name="reference"
            defaultValue={payment.reference || ""}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-50 outline-none ring-0 placeholder:text-slate-500 focus:border-rose-500"
          />
        </div>

        {/* Notes (full width) */}
        <div className="md:col-span-2 space-y-1.5">
          <label
            htmlFor="notes"
            className="block text-xs font-medium text-slate-300"
          >
            Internal notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={4}
            defaultValue={payment.notes || ""}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 outline-none ring-0 placeholder:text-slate-500 focus:border-rose-500"
          />
        </div>

        {/* Actions */}
        <div className="md:col-span-2 flex items-center justify-between gap-3 pt-2">
          <p className="text-xs text-slate-500">
            Changes are saved to this single payment only and reflected in the
            estate rent ledger.
          </p>
          <button
            type="submit"
            className="rounded-full bg-rose-600 px-4 py-1.5 text-xs font-semibold text-rose-50 shadow-sm shadow-rose-900/60 hover:bg-rose-500"
          >
            Save changes
          </button>
        </div>
      </form>
    </div>
  );
}