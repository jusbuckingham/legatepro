import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { connectToDatabase, serializeMongoDoc } from "@/lib/db";
import { getEntitlements, getUpgradeReason } from "@/lib/entitlements";
import { User } from "@/models/User";
import { RentPayment } from "@/models/RentPayment";

interface PageProps {
  params: Promise<{
    estateId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
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

export default async function EstateRentLedgerPage({ params, searchParams }: PageProps) {
  const { estateId } = await params;

  const sp = searchParams ? await searchParams : undefined;
  const successFlag = sp?.success;
  const canceledFlag = sp?.canceled;

  const isSuccess = Array.isArray(successFlag)
    ? successFlag.includes("1")
    : successFlag === "1";

  const isCanceled = Array.isArray(canceledFlag)
    ? canceledFlag.includes("1")
    : canceledFlag === "1";

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  await connectToDatabase();

  const userDoc = await User.findById(session.user.id).lean().exec();
  const ent = getEntitlements(userDoc as unknown as {
    subscriptionPlanId?: string | null;
    subscriptionStatus?: string | null;
  });
  const upgradeReason = getUpgradeReason(userDoc as unknown as {
    subscriptionPlanId?: string | null;
    subscriptionStatus?: string | null;
  });
  const exportHref = `/api/rent/export?estateId=${encodeURIComponent(estateId)}`;

  const docs = (await RentPayment.find({ estateId })
    .sort({ paymentDate: -1 })
    .lean()
    .exec()) as unknown[];

  const toStringId = (v: unknown): string => {
    if (typeof v === "string") return v;
    if (v && typeof v === "object" && "toString" in v && typeof (v as { toString: () => string }).toString === "function") {
      return (v as { toString: () => string }).toString();
    }
    return "";
  };

  const payments: LeanRentPayment[] = docs
    .map((d): LeanRentPayment | null => {
      const obj = serializeMongoDoc(d) as Record<string, unknown>;

      const _id = toStringId(obj._id ?? obj.id);
      const estateIdStr = toStringId(obj.estateId);
      const ownerIdStr = toStringId(obj.ownerId);

      const tenantName = typeof obj.tenantName === "string" ? obj.tenantName : "";
      if (!_id || !estateIdStr || !tenantName) return null;

      const periodMonth = Number(obj.periodMonth);
      const periodYear = Number(obj.periodYear);
      const amount = Number(obj.amount);

      return {
        _id,
        ownerId: ownerIdStr,
        estateId: estateIdStr,
        tenantName,
        periodMonth: Number.isFinite(periodMonth) ? periodMonth : 0,
        periodYear: Number.isFinite(periodYear) ? periodYear : 0,
        amount: Number.isFinite(amount) ? amount : 0,
        paymentDate: (obj.paymentDate as string | Date) ?? "",
        method:
          typeof obj.method === "string" || obj.method === null
            ? (obj.method as string | null)
            : undefined,
        reference:
          typeof obj.reference === "string" || obj.reference === null
            ? (obj.reference as string | null)
            : undefined,
        notes:
          typeof obj.notes === "string" || obj.notes === null
            ? (obj.notes as string | null)
            : undefined,
        createdAt: (obj.createdAt as string | Date) ?? "",
        updatedAt: (obj.updatedAt as string | Date) ?? "",
      };
    })
    .filter((p): p is LeanRentPayment => p !== null);

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
      {isSuccess ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-100">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-emerald-100">Billing updated</p>
              <p className="mt-0.5 text-[11px] text-emerald-100/80">
                If you upgraded to Pro, you can now export your rent ledger as CSV.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {ent.canUsePro ? (
                <a
                  href={exportHref}
                  className="inline-flex items-center rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 shadow-sm hover:bg-emerald-400"
                >
                  Export CSV
                </a>
              ) : (
                <Link
                  href="/app/billing"
                  className="inline-flex items-center rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 shadow-sm hover:bg-emerald-400"
                >
                  Upgrade to Pro
                </Link>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {isCanceled ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-100">
          <p className="text-sm font-semibold text-amber-100">Checkout canceled</p>
          <p className="mt-0.5 text-[11px] text-amber-100/80">
            No worries — you can try again anytime from Billing.
          </p>
        </div>
      ) : null}

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Rent ledger</h1>
          <p className="text-xs text-slate-400">
            Track rent payments collected for this estate.
          </p>
          {!ent.canUsePro ? (
            <p className="mt-1 text-[11px] text-slate-500">
              {upgradeReason ?? "Upgrade to Pro to export rent ledger CSV."}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/app/estates/${estateId}`}
            className="inline-flex items-center rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:border-slate-700 hover:bg-slate-950"
          >
            ← Back
          </Link>

          <Link
            href={`/app/rent`}
            className="inline-flex items-center rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:border-slate-700 hover:bg-slate-950"
          >
            View all rent
          </Link>

          {ent.canUsePro ? (
            <a
              href={exportHref}
              className="inline-flex items-center rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:border-slate-700 hover:bg-slate-950"
            >
              Export CSV
            </a>
          ) : (
            <Link
              href="/app/billing"
              className="inline-flex items-center rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-slate-700 hover:bg-slate-950"
              title={upgradeReason ?? "Upgrade to export"}
            >
              Export CSV (Pro)
            </Link>
          )}

          <Link
            href={`/app/estates/${estateId}/rent/new`}
            className="inline-flex items-center rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 shadow-sm hover:bg-emerald-400"
          >
            + Record payment
          </Link>
        </div>
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
                  className="px-3 py-10 text-center text-xs text-slate-500"
                >
                  <div className="mx-auto max-w-md space-y-2">
                    <p className="text-sm font-semibold text-slate-100">
                      No rent payments yet
                    </p>
                    <p className="text-xs text-slate-500">
                      Record the first payment to start tracking rent totals and tenant activity.
                    </p>
                    <div className="pt-2">
                      <Link
                        href={`/app/estates/${estateId}/rent/new`}
                        className="inline-flex items-center rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 shadow-sm hover:bg-emerald-400"
                      >
                        + Record payment
                      </Link>
                    </div>
                  </div>
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
    </div>
  );
}