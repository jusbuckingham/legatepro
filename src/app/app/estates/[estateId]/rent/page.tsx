import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { RentPayment } from "@/models/RentPayment";

interface PageProps {
  params: Promise<{
    estateId: string;
  }>;
}

type LeanRentPayment = {
  _id: string;
  ownerId: string;
  estateId: string;
  tenantName: string;
  periodMonth: number;
  periodYear: number;
  amount: number;
  paymentDate: string | Date;
  method?: string | null;
  reference?: string | null;
  notes?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(value: string | Date): string {
  if (!value) return "–";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "–";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatPeriod(month: number, year: number): string {
  if (!month || !year) return "–";
  const safeMonth = Math.min(Math.max(month, 1), 12);
  const date = new Date(year, safeMonth - 1, 1);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
  });
}

export default async function EstateRentLedgerPage({ params }: PageProps) {
  const { estateId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  await connectToDatabase();

  const docs = await RentPayment.find({
    estateId,
  })
    .sort({ paymentDate: -1 })
    .lean();

  const payments: LeanRentPayment[] = (docs as unknown as LeanRentPayment[]).map(
    (doc) => ({
      ...doc,
      _id: String(doc._id),
      estateId: String(doc.estateId),
    })
  );

  const totalCollected = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const currentMonthCollected = payments.reduce((sum, p) => {
    const date =
      typeof p.paymentDate === "string" ? new Date(p.paymentDate) : p.paymentDate;
    if (!date || Number.isNaN(date.getTime())) return sum;
    if (date.getMonth() === currentMonth && date.getFullYear() === currentYear) {
      return sum + (p.amount || 0);
    }
    return sum;
  }, 0);

  const uniqueTenants = new Set(
    payments
      .map((p) => (p.tenantName || "").trim())
      .filter((name) => name.length > 0)
  );

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Rent ledger</h1>
          <p className="text-xs text-slate-400">
            Track rent payments collected for this estate.
          </p>
        </div>

        <Link
          href={`/app/estates/${estateId}/rent/new`}
          className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 shadow-sm hover:bg-emerald-400"
        >
          Record rent payment
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-xs">
          <p className="text-slate-400">Total collected</p>
          <p className="mt-1 text-lg font-semibold text-emerald-300">
            {formatCurrency(totalCollected)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            Sum of all recorded payments.
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-xs">
          <p className="text-slate-400">This month</p>
          <p className="mt-1 text-lg font-semibold text-emerald-200">
            {formatCurrency(currentMonthCollected)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            Collected in {formatPeriod(currentMonth + 1, currentYear)}.
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-xs">
          <p className="text-slate-400">Active tenants</p>
          <p className="mt-1 text-lg font-semibold text-slate-100">
            {uniqueTenants.size}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            Based on names in recorded payments.
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/70">
        <table className="min-w-full border-collapse text-xs">
          <thead className="bg-slate-950/80">
            <tr className="border-b border-slate-800/80 text-[11px] uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 text-left font-medium">Date</th>
              <th className="px-3 py-2 text-left font-medium">Tenant</th>
              <th className="px-3 py-2 text-left font-medium">Period</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
              <th className="px-3 py-2 text-left font-medium">Method</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-6 text-center text-xs text-slate-500"
                >
                  No rent payments recorded yet. Use{" "}
                  <span className="font-medium text-emerald-300">
                    
                    Record rent payment
                  </span>{" "}
                  to add the first one.
                </td>
              </tr>
            ) : (
              payments.map((payment) => (
                <tr
                  key={payment._id}
                  className="border-t border-slate-800/70 hover:bg-slate-900/50"
                >
                  <td className="px-3 py-2 align-top text-slate-100">
                    {formatDate(payment.paymentDate)}
                  </td>
                  <td className="px-3 py-2 align-top text-slate-100">
                    {payment.tenantName}
                  </td>
                  <td className="px-3 py-2 align-top text-slate-100">
                    {formatPeriod(payment.periodMonth, payment.periodYear)}
                  </td>
                  <td className="px-3 py-2 align-top text-right font-semibold text-emerald-300">
                    {formatCurrency(payment.amount)}
                  </td>
                  <td className="px-3 py-2 align-top text-slate-200">
                    {payment.method || "—"}
                  </td>
                  <td className="px-3 py-2 align-top text-right">
                    <Link
                      href={`/app/estates/${estateId}/rent/${payment._id}`}
                      className="inline-flex items-center rounded-full border border-slate-700 px-3 py-1 text-[11px] font-medium text-slate-100 hover:border-rose-500/70 hover:text-rose-100"
                    >
                      View details
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between border-t border-slate-900 pt-4">
        <Link
          href={`/app/estates/${estateId}`}
          className="text-xs font-medium text-slate-400 hover:text-slate-100"
        >
          
          ← Back to estate overview
        </Link>
      </div>
    </div>
  );
}