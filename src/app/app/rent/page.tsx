import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { RentPayment } from "@/models/RentPayment";

export const metadata = {
  title: "Rent overview | LegatePro",
};

type LeanEstateForRent = {
  _id: string;
  displayName?: string;
  caseName?: string;
};

type LeanRentPaymentWithEstate = {
  _id: string;
  estateId?: string | LeanEstateForRent;
  amount: number;
  paymentDate: Date;
  tenantName?: string;
  periodMonth?: number;
  periodYear?: number;
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function getEstateLabel(estateId: LeanRentPaymentWithEstate["estateId"]): string {
  if (!estateId) return "Unknown estate";

  if (typeof estateId === "string") {
    return estateId;
  }

  return (
    estateId.displayName ||
    estateId.caseName ||
    `Estate ${estateId._id.slice(-6)}`
  );
}

export default async function GlobalRentOverviewPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  await connectToDatabase();

  const ownerId = session.user.id;

  // Load payments with estate info
  const rawPayments = await RentPayment.find({ ownerId })
    .populate<{ estateId: LeanEstateForRent }>("estateId", "displayName caseName")
    .sort({ paymentDate: -1 })
    .lean();

  const payments = rawPayments as unknown as LeanRentPaymentWithEstate[];

  const totalCollected = payments.reduce(
    (sum, payment) => sum + (payment.amount || 0),
    0,
  );

  // Group by estate for summary
  const totalsByEstate = payments.reduce<Map<string, { label: string; amount: number }>>(
    (map, payment) => {
      const label = getEstateLabel(payment.estateId);
      const prev = map.get(label) ?? { label, amount: 0 };
      prev.amount += payment.amount || 0;
      map.set(label, prev);
      return map;
    },
    new Map(),
  );

  const estateSummaries = Array.from(totalsByEstate.values()).sort(
    (a, b) => b.amount - a.amount,
  );

  const hasPayments = payments.length > 0;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Rent &amp; income
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-50">
            Rent overview
          </h1>
          <p className="mt-1 max-w-xl text-sm text-slate-400">
            Review rent collected across all estates and quickly see which
            properties are generating income.
          </p>
        </div>

        <div className="flex gap-4">
          <div className="rounded-2xl border border-emerald-900/60 bg-emerald-950/40 px-4 py-3 text-right shadow-sm shadow-emerald-950/40">
            <p className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-emerald-400">
              Total collected
            </p>
            <p className="mt-1 text-lg font-semibold text-emerald-100">
              {formatCurrency(totalCollected)}
            </p>
            <p className="mt-0.5 text-[0.7rem] text-emerald-300/70">
              Across {estateSummaries.length || 0} estates
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-right shadow-sm shadow-slate-950/50">
            <p className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-slate-400">
              Rent entries
            </p>
            <p className="mt-1 text-lg font-semibold text-slate-100">
              {payments.length}
            </p>
            <p className="mt-0.5 text-[0.7rem] text-slate-500">
              Individual payments
            </p>
          </div>
        </div>
      </div>

      {/* By estate summary */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
          By estate
        </h2>

        {estateSummaries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 p-6 text-sm text-slate-400">
            No rent payments recorded yet. When you add rent under each estate,
            you&apos;ll see a cross-estate summary here.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {estateSummaries.map((item) => (
              <div
                key={item.label}
                className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/40 p-4"
              >
                <div>
                  <p className="text-xs font-medium text-slate-400">
                    {item.label}
                  </p>
                </div>
                <p className="mt-3 text-lg font-semibold text-slate-50">
                  {formatCurrency(item.amount)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* All payments table */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            All rent payments
          </h2>
        </div>

        {!hasPayments ? (
          <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 p-6 text-sm text-slate-400">
            No rent recorded yet. Add rent from the{" "}
            <span className="font-semibold text-slate-200">Rent</span> tab
            inside any estate to start tracking income.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/40">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-800 bg-slate-900/60 text-xs uppercase tracking-[0.18em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Estate</th>
                  <th className="px-4 py-3">Tenant</th>
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => {
                  const estateLabel = getEstateLabel(payment.estateId);
                  const period =
                    payment.periodMonth && payment.periodYear
                      ? `${payment.periodMonth}/${payment.periodYear}`
                      : "—";

                  return (
                    <tr
                      key={payment._id}
                      className="border-t border-slate-800/70 hover:bg-slate-900/60"
                    >
                      <td className="px-4 py-3 text-slate-200">
                        {formatDate(payment.paymentDate)}
                      </td>
                      <td className="px-4 py-3 text-slate-300">{estateLabel}</td>
                      <td className="px-4 py-3 text-slate-300">
                        {payment.tenantName || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-400">{period}</td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-300">
                        {formatCurrency(payment.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}