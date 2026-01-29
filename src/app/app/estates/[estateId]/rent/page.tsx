import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { connectToDatabase, serializeMongoDoc } from "@/lib/db";
import { requireEstateAccess } from "@/lib/estateAccess";
import {
  getEntitlements,
  getUpgradeReason,
  type EntitlementsUser,
  type PlanId,
  type SubscriptionStatus,
} from "@/lib/entitlements";
import { User } from "@/models/User";
import { RentPayment } from "@/models/RentPayment";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = {
  title: "Rent | LegatePro",
};

interface PageProps {
  params: Promise<{ estateId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

type LeanRentPayment = {
  _id: string;
  ownerId: string;
  estateId: string;
  propertyId?: string;
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

type EstateRole = "OWNER" | "EDITOR" | "VIEWER";

function firstParam(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? "" : "";
}

function roleLabel(role: EstateRole): string {
  if (role === "OWNER") return "Owner";
  if (role === "EDITOR") return "Editor";
  return "Viewer";
}

function canEdit(role: EstateRole): boolean {
  return role === "OWNER" || role === "EDITOR";
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}

function coerceDate(value: string | Date): Date | null {
  const d = typeof value === "string" ? new Date(value) : value;
  if (!d || Number.isNaN(d.getTime())) return null;
  return d;
}

function formatDate(value: string | Date): string {
  const d = coerceDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatPeriod(month: number, year: number): string {
  if (!month || !year) return "—";
  const safeMonth = Math.min(Math.max(month, 1), 12);
  const date = new Date(year, safeMonth - 1, 1);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
  });
}

function coercePlanId(value: unknown): PlanId | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  return value as PlanId;
}

function coerceSubscriptionStatus(value: unknown): SubscriptionStatus | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  return value as SubscriptionStatus;
}

export default async function EstateRentLedgerPage({ params, searchParams }: PageProps) {
  const { estateId } = await params;
  if (!estateId) notFound();

  const sp = searchParams ? await searchParams : undefined;
  const isSuccess = firstParam(sp?.success) === "1";
  const isCanceled = firstParam(sp?.canceled) === "1";
  const forbidden = firstParam(sp?.forbidden) === "1";
  const deleted = firstParam(sp?.deleted) === "1";
  const error = firstParam(sp?.error);

  const session = await auth();
  if (!session?.user?.id) {
    const callbackUrl = encodeURIComponent(`/app/estates/${estateId}/rent`);
    redirect(`/login?callbackUrl=${callbackUrl}`);
  }

  const access = await requireEstateAccess({ estateId, userId: session.user.id });
  if (!access?.role) notFound();

  const role: EstateRole = (access.role as EstateRole) ?? "VIEWER";
  const editEnabled = canEdit(role);

  await connectToDatabase();

  const userDoc = await User.findById(session.user.id).lean().exec();
  const rawUser = userDoc as unknown as {
    subscriptionPlanId?: unknown;
    subscriptionStatus?: unknown;
  };

  const entUser: EntitlementsUser = {
    subscriptionPlanId: coercePlanId(rawUser.subscriptionPlanId),
    subscriptionStatus: coerceSubscriptionStatus(rawUser.subscriptionStatus),
  };

  const ent = getEntitlements(entUser);
  const upgradeReason = getUpgradeReason(entUser);
  const exportHref = `/api/rent/export?estateId=${encodeURIComponent(estateId)}`;

  const toStringId = (v: unknown): string => {
    if (typeof v === "string") return v;
    if (
      v &&
      typeof v === "object" &&
      "toString" in v &&
      typeof (v as { toString: () => string }).toString === "function"
    ) {
      return (v as { toString: () => string }).toString();
    }
    return "";
  };

  const docs = (await RentPayment.find({ estateId })
    .sort({ paymentDate: -1, periodYear: -1, periodMonth: -1 })
    .lean()
    .exec()) as unknown[];

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
        propertyId: toStringId(obj.propertyId),
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

  const hasPayments = payments.length > 0;

  const totalCollected = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const currentMonthCollected = payments.reduce((sum, p) => {
    const d = coerceDate(p.paymentDate);
    if (!d) return sum;
    if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) return sum + (p.amount || 0);
    return sum;
  }, 0);

  const uniqueTenants = new Set(
    payments
      .map((p) => (p.tenantName || "").trim())
      .filter((name) => name.length > 0),
  );

  const distinctPeriods = new Set(
    payments
      .filter((p) => p.periodYear && p.periodMonth)
      .map((p) => `${p.periodYear}-${p.periodMonth}`),
  ).size;

  const lastPaymentDate = payments[0]?.paymentDate;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="space-y-4">
        <nav className="text-xs text-slate-500">
          <Link
            href="/app/estates"
            className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
          >
            Estates
          </Link>
          <span className="mx-1 text-slate-600">/</span>
          <Link
            href={`/app/estates/${estateId}`}
            className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
          >
            Estate
          </Link>
          <span className="mx-1 text-slate-600">/</span>
          <span className="text-rose-300">Rent</span>
        </nav>

        {forbidden ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium">Action blocked</p>
                <p className="text-xs text-rose-200">
                  You don’t have edit permissions for this estate. Request access from the owner to add or remove rent payments.
                </p>
              </div>
              <Link
                href={`/app/estates/${estateId}?requestAccess=1`}
                className="mt-2 inline-flex items-center justify-center rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-100 hover:bg-rose-500/25 md:mt-0"
              >
                Request edit access
              </Link>
            </div>
          </div>
        ) : null}

        {deleted ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium">Payment removed</p>
                <p className="text-xs text-emerald-200">The rent payment entry was removed and the ledger has been refreshed.</p>
              </div>
              {editEnabled ? (
                <Link
                  href={`/app/estates/${estateId}/rent/new`}
                  className="mt-2 inline-flex items-center justify-center rounded-md border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-500/25 md:mt-0"
                >
                  Add payment
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium">Something went wrong</p>
                <p className="text-xs text-rose-200">We couldn’t complete that action. Please try again.</p>
              </div>
              <Link
                href={`/app/estates/${estateId}/rent`}
                className="mt-2 inline-flex items-center justify-center rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-100 hover:bg-rose-500/25 md:mt-0"
              >
                Refresh
              </Link>
            </div>
          </div>
        ) : null}

        {!editEnabled ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium">Viewer access</p>
                <p className="text-xs text-amber-200">You can view this rent ledger, but you can’t record or remove payments.</p>
              </div>
              <Link
                href={`/app/estates/${estateId}?requestAccess=1`}
                className="mt-2 inline-flex items-center justify-center rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-500/25 md:mt-0"
              >
                Request edit access
              </Link>
            </div>
          </div>
        ) : null}

        {isSuccess ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium">Billing updated</p>
                <p className="text-xs text-emerald-200">If you upgraded to Pro, you can now export your rent ledger as CSV.</p>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 md:mt-0">
                {ent.canUsePro ? (
                  <a
                    href={exportHref}
                    className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
                  >
                    Export CSV
                  </a>
                ) : (
                  <Link
                    href="/app/billing"
                    className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
                  >
                    Upgrade to Pro
                  </Link>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {isCanceled ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            <p className="font-medium">Checkout canceled</p>
            <p className="text-xs text-amber-200">No worries — you can try again anytime from Billing.</p>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Rent ledger</span>
              <span className="rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.2em] text-slate-300">
                Role: {roleLabel(role)}
              </span>
              {!editEnabled ? (
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-200">
                  Read-only
                </span>
              ) : null}
            </div>

            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-50">Estate rent</h1>
            <p className="mt-1 text-sm text-slate-400">Track rent payments collected for this estate.</p>
            {!ent.canUsePro ? (
              <p className="mt-1 text-xs text-slate-500">{upgradeReason ?? "Upgrade to Pro to export rent ledger CSV."}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Link
              href={`/app/estates/${estateId}`}
              className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 font-medium text-slate-200 hover:border-rose-500/70 hover:text-rose-100"
            >
              ← Back to estate
            </Link>

            <Link
              href={`/app/rent`}
              className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 font-medium text-slate-200 hover:border-rose-500/70 hover:text-rose-100"
            >
              View all rent
            </Link>

            {ent.canUsePro ? (
              <a
                href={exportHref}
                className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 font-medium text-slate-200 hover:border-rose-500/70 hover:text-rose-100"
              >
                Export CSV
              </a>
            ) : (
              <Link
                href="/app/billing"
                className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 font-medium text-slate-300 hover:border-rose-500/70 hover:text-rose-100"
                title={upgradeReason ?? "Upgrade to export"}
              >
                Export CSV (Pro)
              </Link>
            )}

            {editEnabled ? (
              <Link
                href={`/app/estates/${estateId}/rent/new`}
                className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-3 py-1 font-semibold text-white hover:bg-rose-500"
              >
                + Record payment
              </Link>
            ) : (
              <Link
                href={`/app/estates/${estateId}?requestAccess=1`}
                className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 font-semibold text-amber-100 hover:bg-amber-500/15"
              >
                Request edit access
              </Link>
            )}
          </div>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Total collected</p>
          <p className="mt-1 text-lg font-semibold text-slate-50">{formatCurrency(totalCollected)}</p>
          {hasPayments ? (
            <p className="mt-1 text-xs text-slate-500">
              Across {payments.length} recorded payment{payments.length === 1 ? "" : "s"}.
            </p>
          ) : null}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">This month</p>
          <p className="mt-1 text-lg font-semibold text-slate-50">{formatCurrency(currentMonthCollected)}</p>
          <p className="mt-1 text-xs text-slate-500">Collected in {formatPeriod(currentMonth + 1, currentYear)}.</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Months with activity</p>
          <p className="mt-1 text-lg font-semibold text-slate-50">{hasPayments ? distinctPeriods : "0"}</p>
          <p className="mt-1 text-xs text-slate-500">Based on the period tagged for each payment.</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Active tenants</p>
          <p className="mt-1 text-lg font-semibold text-slate-50">{uniqueTenants.size}</p>
          <p className="mt-1 text-xs text-slate-500">Based on names in recorded payments.</p>
        </div>
      </section>

      {!hasPayments ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 px-6 py-8 text-sm text-slate-300">
          <p className="font-medium text-slate-100">No rent payments recorded yet for this estate.</p>
          <p className="mt-1 text-slate-400">Record each payment as it comes in so your ledger and final accounting are always ready.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {editEnabled ? (
              <Link
                href={`/app/estates/${estateId}/rent/new`}
                className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-500"
              >
                + Record first payment
              </Link>
            ) : (
              <Link
                href={`/app/estates/${estateId}?requestAccess=1`}
                className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-100 hover:bg-amber-500/15"
              >
                Request edit access
              </Link>
            )}

            <Link
              href={`/app/estates/${estateId}`}
              className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 text-xs font-medium text-slate-200 hover:border-rose-500/70 hover:text-rose-100"
            >
              Back to estate
            </Link>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/60 text-sm">
          <table className="min-w-full divide-y divide-slate-800">
            <thead className="bg-slate-950/80">
              <tr className="text-xs uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2 text-left">Payment date</th>
                <th className="px-3 py-2 text-left">Tenant</th>
                <th className="px-3 py-2 text-left">Period</th>
                <th className="px-3 py-2 text-left">Method</th>
                <th className="px-3 py-2 text-left">Reference</th>
                <th className="px-3 py-2 text-left">Notes</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {payments.map((payment) => (
                <tr key={payment._id} className="text-xs text-slate-200">
                  <td className="whitespace-nowrap px-3 py-2">{formatDate(payment.paymentDate)}</td>
                  <td className="whitespace-nowrap px-3 py-2">{payment.tenantName || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2">{formatPeriod(payment.periodMonth, payment.periodYear)}</td>
                  <td className="whitespace-nowrap px-3 py-2">{payment.method || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2">{payment.reference || "—"}</td>
                  <td className="max-w-[260px] px-3 py-2 text-slate-300">
                    {payment.notes && payment.notes.trim().length > 0 ? (
                      <span className="line-clamp-2">{payment.notes}</span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-emerald-300">
                    {formatCurrency(payment.amount)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <Link
                      href={`/app/estates/${estateId}/rent/${payment._id}`}
                      className="inline-flex items-center rounded-full border border-slate-700 px-3 py-1 text-[11px] font-medium text-slate-100 hover:border-rose-500/70 hover:text-rose-100"
                    >
                      View details
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasPayments ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-xs text-slate-400">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-slate-300">
                Last payment: <span className="font-semibold text-slate-100">{lastPaymentDate ? formatDate(lastPaymentDate) : "—"}</span>
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">Keep this page current so final accounting stays fast and defensible.</p>
            </div>
            {editEnabled ? (
              <Link
                href={`/app/estates/${estateId}/rent/new`}
                className="inline-flex items-center justify-center rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-100 hover:bg-rose-500/25"
              >
                Add another payment
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}