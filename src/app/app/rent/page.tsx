import mongoose from "mongoose";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { RentPayment } from "@/models/RentPayment";
import PageHeader from "@/components/layout/PageHeader";
import PageSection from "@/components/layout/PageSection";

export const metadata = {
  title: "Rent overview | LegatePro",
};

type ObjectIdLike = string | { toString(): string };

type LeanEstateForRent = {
  _id: ObjectIdLike;
  displayName?: string;
  caseName?: string;
};

type LeanRentPaymentWithEstate = {
  _id: ObjectIdLike;
  estateId?: ObjectIdLike | LeanEstateForRent;
  amount: number;
  paymentDate: Date | string;
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

function formatPeriod(month?: number, year?: number): string {
  if (!month || !year) return "—";
  if (month < 1 || month > 12) return "—";

  const d = new Date(year, month - 1, 1);
  if (Number.isNaN(d.getTime())) return "—";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
  }).format(d);
}

function getEstateLabel(estateId: LeanRentPaymentWithEstate["estateId"]): string {
  if (!estateId) return "Unknown estate";

  // Not populated (just an id)
  if (typeof estateId === "string") return estateId;
  if (typeof (estateId as { toString?: () => string }).toString === "function") {
    return (estateId as { toString(): string }).toString();
  }

  // Populated
  const populated = estateId as LeanEstateForRent;
  const rawId =
    typeof populated._id === "string" ? populated._id : populated._id.toString();

  return populated.displayName || populated.caseName || `Estate ${rawId.slice(-6)}`;
}

function toObjectId(id: string) {
  return mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : null;
}

export default async function GlobalRentOverviewPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  await connectToDatabase();

  const ownerId = session.user.id;
  const ownerObjectId = toObjectId(ownerId);

  const ownerMatch: string | { $in: (string | mongoose.Types.ObjectId)[] } =
    ownerObjectId ? { $in: [ownerId, ownerObjectId] } : ownerId;

  // Load payments with estate info
  const payments = await RentPayment.find({ ownerId: ownerMatch })
    .populate<{ estateId: LeanEstateForRent }>("estateId", "displayName caseName")
    .sort({ paymentDate: -1 })
    // For `find()` queries, `lean<T>()` should use the *array* element type.
    .lean<LeanRentPaymentWithEstate[]>()
    .exec();

  const totalCollected = payments.reduce((sum: number, payment: LeanRentPaymentWithEstate) => {
    return sum + (payment.amount || 0);
  }, 0);

  // Group by estate for summary
  const totalsByEstate = payments.reduce<Map<string, { label: string; amount: number }>>(
    (map, payment: LeanRentPaymentWithEstate) => {
      const label = getEstateLabel(payment.estateId);
      const prev = map.get(label) ?? { label, amount: 0 };
      prev.amount += payment.amount || 0;
      map.set(label, prev);
      return map;
    },
    new Map<string, { label: string; amount: number }>(),
  );

  const estateSummaries = Array.from(totalsByEstate.values()).sort(
    (a, b) => b.amount - a.amount,
  );

  const hasPayments = payments.length > 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8">
      <PageHeader
        eyebrow="Rent & income"
        title="Rent overview"
        description={
          "Review rent collected across all estates and quickly see which properties are generating income."
        }
        actions={
          <div className="flex flex-wrap gap-4">
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

            <div className="rounded-2xl border border-border bg-card px-4 py-3 text-right shadow-sm">
              <p className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Rent entries
              </p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {payments.length}
              </p>
              <p className="mt-0.5 text-[0.7rem] text-muted-foreground">
                Individual payments
              </p>
            </div>
          </div>
        }
      />

      {/* By estate summary */}
      <PageSection>
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          By estate
        </h2>

        {estateSummaries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/10 p-6">
            <p className="text-sm font-semibold text-foreground">No rent recorded yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add rent entries inside an estate and we&apos;ll automatically roll up totals here.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/app/estates"
                className="inline-flex h-9 items-center rounded-md bg-emerald-500 px-3 text-xs font-semibold text-background hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Go to an estate
              </Link>
              <Link
                href="/app/dashboard"
                className="inline-flex h-9 items-center rounded-md border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Dashboard
              </Link>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-border bg-muted/20 p-4">
                <p className="text-xs font-semibold text-foreground">Step 1</p>
                <p className="mt-1 text-[11px] text-muted-foreground">Open an estate → Rent tab.</p>
              </div>
              <div className="rounded-xl border border-border bg-muted/20 p-4">
                <p className="text-xs font-semibold text-foreground">Step 2</p>
                <p className="mt-1 text-[11px] text-muted-foreground">Add tenant + payment date + amount.</p>
              </div>
              <div className="rounded-xl border border-border bg-muted/20 p-4">
                <p className="text-xs font-semibold text-foreground">Step 3</p>
                <p className="mt-1 text-[11px] text-muted-foreground">See totals by estate and across all estates here.</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {estateSummaries.map((item) => (
              <div
                key={item.label}
                className="flex flex-col justify-between rounded-2xl border border-border bg-card p-4"
              >
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    {item.label}
                  </p>
                </div>
                <p className="mt-3 text-lg font-semibold text-foreground">
                  {formatCurrency(item.amount)}
                </p>
              </div>
            ))}
          </div>
        )}
      </PageSection>

      {/* All payments table */}
      <PageSection>
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            All rent payments
          </h2>
        </div>

        {!hasPayments ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/10 p-6">
            <p className="text-sm font-semibold text-foreground">No payments yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add rent from the <span className="font-semibold text-foreground">Rent</span> tab inside any estate to start tracking income.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/app/estates"
                className="inline-flex h-9 items-center rounded-md bg-emerald-500 px-3 text-xs font-semibold text-background hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Go to an estate
              </Link>
              <Link
                href="/app/estates?sort=updated"
                className="inline-flex h-9 items-center rounded-md border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Recently updated
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3">Date</th>
                  <th scope="col" className="px-4 py-3">Estate</th>
                  <th scope="col" className="px-4 py-3">Tenant</th>
                  <th scope="col" className="px-4 py-3">Period</th>
                  <th scope="col" className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment: LeanRentPaymentWithEstate) => {
                  const estateLabel = getEstateLabel(payment.estateId);
                  const period = formatPeriod(payment.periodMonth, payment.periodYear);

                  return (
                    <tr
                      key={
                        typeof payment._id === "string" ? payment._id : payment._id.toString()
                      }
                      className="border-t border-border/60 hover:bg-muted/20"
                    >
                      <td className="px-4 py-3 text-foreground">
                        {formatDate(payment.paymentDate)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{estateLabel}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {payment.tenantName || "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{period}</td>
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
      </PageSection>
    </div>
  );
}