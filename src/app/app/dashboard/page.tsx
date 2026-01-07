// src/app/app/dashboard/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import mongoose from "mongoose";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Invoice } from "@/models/Invoice";
import { TimeEntry } from "@/models/TimeEntry";
import { WorkspaceSettings } from "@/models/WorkspaceSettings";
import { Estate } from "@/models/Estate";
import PageHeader from "@/components/layout/PageHeader";

export const metadata: Metadata = {
  title: "Dashboard | LegatePro",
};

type InvoiceStatus =
  | "DRAFT"
  | "SENT"
  | "UNPAID"
  | "PARTIAL"
  | "PAID"
  | "VOID";

type InvoiceLike = {
  _id: unknown;
  estateId?: unknown;
  status?: InvoiceStatus | string;
  totalAmount?: number;
  subtotal?: number;
  currency?: string;
  createdAt?: Date;
  issueDate?: Date;
  dueDate?: Date | null;
};

type TimeEntryLike = {
  _id: unknown;
  // Mongoose lean() can return ObjectId-ish values here, so keep these loose.
  ownerId?: unknown;
  estateId?: unknown;
  description?: string;
  durationMinutes?: number;
  hourlyRateCents?: number;
  startedAt?: Date;
  stoppedAt?: Date | null;
  billedInvoiceId?: unknown | null;
  isArchived?: boolean;
};

type EstateLike = {
  _id: unknown;
  displayName?: string;
  caseName?: string;
};

type EstateBillingMetrics = {
  estateId: string;
  label: string;
  totalInvoicedCents: number;
  collectedCents: number;
  outstandingCents: number;
  voidedCents: number;
  unbilledHours: number;
  unbilledValueCents: number;
};

type MonthlyInvoiceBucket = {
  key: string;
  label: string;
  year: number;
  month: number;
  invoicedCents: number;
  collectedCents: number;
  outstandingCents: number;
};

type ARAgingBucket = {
  key: string;
  label: string;
  minDays: number;
  maxDays?: number;
  totalCents: number;
  invoiceCount: number;
};

type EmptyStateProps = {
  title: string;
  description?: string;
  cta?: {
    label: string;
    href: string;
  };
};

function EmptyState({ title, description, cta }: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-sm">
      <div className="text-sm font-semibold text-slate-100">{title}</div>
      {description ? (
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      ) : null}
      {cta ? (
        <div className="mt-3">
          <Link
            href={cta.href}
            className="inline-flex h-8 items-center rounded-md border border-slate-800 bg-slate-900/60 px-3 text-[11px] font-medium text-sky-400 shadow-sm transition hover:bg-slate-900 hover:text-sky-300"
          >
            {cta.label}
            <span className="ml-1 text-[10px]">↗</span>
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function formatMoney(cents: number, currency: string = "USD"): string {
  const safeCents = Number.isFinite(cents) ? cents : 0;
  const amount = safeCents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatShortDate(value: Date): string {
  return value.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function toObjectId(id: string) {
  return mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : null;
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  await connectToDatabase();

  const userObjectId = toObjectId(session.user.id);
  const ownerIdOr: Array<Record<string, unknown>> = [
    { ownerId: session.user.id },
    ...(userObjectId ? [{ ownerId: userObjectId }] : []),
  ];

  const nowDate = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;
  const sixMonthWindowStart = new Date(nowDate.getFullYear(), nowDate.getMonth() - 5, 1);

  const invoiceTotalsAndByEstateAgg = Invoice.aggregate([
    { $match: { $or: ownerIdOr } },
    {
      $project: {
        estateId: 1,
        status: { $toUpper: { $ifNull: ["$status", "DRAFT"] } },
        amountCents: { $ifNull: ["$totalAmount", { $ifNull: ["$subtotal", 0] }] },
      },
    },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              totalInvoicedCents: { $sum: "$amountCents" },
              collectedCents: {
                $sum: { $cond: [{ $eq: ["$status", "PAID"] }, "$amountCents", 0] },
              },
              voidedCents: {
                $sum: { $cond: [{ $eq: ["$status", "VOID"] }, "$amountCents", 0] },
              },
              outstandingCents: {
                $sum: {
                  $cond: [{ $in: ["$status", ["SENT", "UNPAID", "PARTIAL"]] }, "$amountCents", 0],
                },
              },
            },
          },
        ],
        byEstate: [
          {
            $group: {
              _id: "$estateId",
              totalInvoicedCents: { $sum: "$amountCents" },
              collectedCents: {
                $sum: { $cond: [{ $eq: ["$status", "PAID"] }, "$amountCents", 0] },
              },
              voidedCents: {
                $sum: { $cond: [{ $eq: ["$status", "VOID"] }, "$amountCents", 0] },
              },
              outstandingCents: {
                $sum: {
                  $cond: [{ $in: ["$status", ["SENT", "UNPAID", "PARTIAL"]] }, "$amountCents", 0],
                },
              },
            },
          },
        ],
      },
    },
  ]).exec();

  const recentInvoicesAgg = Invoice.aggregate([
    { $match: { $or: ownerIdOr } },
    {
      $project: {
        estateId: 1,
        status: 1,
        totalAmount: 1,
        subtotal: 1,
        currency: 1,
        createdAt: 1,
        issueDate: 1,
        dueDate: 1,
        sortDate: { $ifNull: ["$issueDate", "$createdAt"] },
      },
    },
    { $sort: { sortDate: -1 } },
    { $limit: 5 },
    { $project: { sortDate: 0 } },
  ]).exec();

  const monthlyTrendAgg = Invoice.aggregate([
    { $match: { $or: ownerIdOr } },
    {
      $project: {
        status: { $toUpper: { $ifNull: ["$status", "DRAFT"] } },
        amountCents: { $ifNull: ["$totalAmount", { $ifNull: ["$subtotal", 0] }] },
        baseDate: { $ifNull: ["$issueDate", "$createdAt"] },
      },
    },
    { $match: { baseDate: { $gte: sixMonthWindowStart } } },
    {
      $group: {
        _id: {
          year: { $year: "$baseDate" },
          month: { $month: "$baseDate" }, // 1-12
        },
        invoicedCents: { $sum: "$amountCents" },
        collectedCents: {
          $sum: { $cond: [{ $eq: ["$status", "PAID"] }, "$amountCents", 0] },
        },
        outstandingCents: {
          $sum: {
            $cond: [{ $in: ["$status", ["SENT", "UNPAID", "PARTIAL"]] }, "$amountCents", 0],
          },
        },
      },
    },
  ]).exec();

  const agingAgg = Invoice.aggregate([
    { $match: { $or: ownerIdOr } },
    {
      $project: {
        status: { $toUpper: { $ifNull: ["$status", "DRAFT"] } },
        amountCents: { $ifNull: ["$totalAmount", { $ifNull: ["$subtotal", 0] }] },
        baseDate: { $ifNull: ["$dueDate", { $ifNull: ["$issueDate", "$createdAt"] }] },
      },
    },
    { $match: { status: { $in: ["SENT", "UNPAID", "PARTIAL"] } } },
    { $match: { amountCents: { $gt: 0 } } },
    {
      $addFields: {
        daysPastDue: {
          $floor: {
            $divide: [{ $subtract: [nowDate, "$baseDate"] }, msPerDay],
          },
        },
      },
    },
    {
      $addFields: {
        bucketKey: {
          $switch: {
            branches: [
              { case: { $lte: ["$daysPastDue", 0] }, then: "CURRENT" },
              { case: { $and: [{ $gte: ["$daysPastDue", 1] }, { $lte: ["$daysPastDue", 30] }] }, then: "AGE_0_30" },
              { case: { $and: [{ $gte: ["$daysPastDue", 31] }, { $lte: ["$daysPastDue", 60] }] }, then: "AGE_31_60" },
              { case: { $and: [{ $gte: ["$daysPastDue", 61] }, { $lte: ["$daysPastDue", 90] }] }, then: "AGE_61_90" },
              { case: { $gte: ["$daysPastDue", 91] }, then: "AGE_90_PLUS" },
            ],
            default: "CURRENT",
          },
        },
      },
    },
    {
      $group: {
        _id: "$bucketKey",
        totalCents: { $sum: "$amountCents" },
        invoiceCount: { $sum: 1 },
      },
    },
  ]).exec();

  const [invoiceTotalsAndByEstate, recentInvoicesRaw, monthAggRaw, agingAggRaw, unbilledTimeRaw, workspaceSettings, estatesRaw] =
    await Promise.all([
      invoiceTotalsAndByEstateAgg,
      recentInvoicesAgg,
      monthlyTrendAgg,
      agingAgg,
      TimeEntry.find(
        {
          $and: [
            { $or: ownerIdOr },
            { isArchived: { $ne: true } },
            {
              $or: [
                { billedInvoiceId: { $exists: false } },
                { billedInvoiceId: null },
              ],
            },
          ],
        },
        {
          ownerId: 1,
          estateId: 1,
          description: 1,
          durationMinutes: 1,
          hourlyRateCents: 1,
          startedAt: 1,
          stoppedAt: 1,
          billedInvoiceId: 1,
          isArchived: 1,
        },
      )
        .lean()
        .exec(),
      WorkspaceSettings.findOne({ $or: ownerIdOr }).lean().exec(),
      Estate.find(
        {
          $or: [...ownerIdOr, { "collaborators.userId": session.user.id }],
        },
        {
          displayName: 1,
          caseName: 1,
        },
      )
        .lean()
        .exec(),
    ]);

  const unbilledTimeEntries = unbilledTimeRaw as unknown as TimeEntryLike[];
  const estates = estatesRaw as unknown as EstateLike[];

  const totalsRow = Array.isArray(invoiceTotalsAndByEstate?.[0]?.totals)
    ? (invoiceTotalsAndByEstate[0].totals[0] as
        | {
            totalInvoicedCents?: number;
            collectedCents?: number;
            outstandingCents?: number;
            voidedCents?: number;
          }
        | undefined)
    : undefined;

  const byEstateRows = Array.isArray(invoiceTotalsAndByEstate?.[0]?.byEstate)
    ? (invoiceTotalsAndByEstate[0].byEstate as
        Array<{
          _id?: unknown;
          totalInvoicedCents?: number;
          collectedCents?: number;
          outstandingCents?: number;
          voidedCents?: number;
        }>)
    : [];

  const recentInvoices = (recentInvoicesRaw ?? []) as unknown as InvoiceLike[];

  const currency =
    (workspaceSettings &&
      typeof workspaceSettings.defaultCurrency === "string" &&
      workspaceSettings.defaultCurrency.trim().length > 0 &&
      workspaceSettings.defaultCurrency.trim().toUpperCase()) ||
    "USD";

  const defaultHourlyRateCents =
    workspaceSettings &&
    typeof workspaceSettings.defaultHourlyRateCents === "number"
      ? workspaceSettings.defaultHourlyRateCents
      : 0;

  // Build a lookup for estate labels
  const estateLabelMap = new Map<string, string>();
  for (const estate of estates) {
    const id = String(estate._id);
    const displayName =
      typeof estate.displayName === "string"
        ? estate.displayName.trim()
        : "";
    const caseName =
      typeof estate.caseName === "string" ? estate.caseName.trim() : "";

    const label =
      displayName ||
      caseName ||
      `Estate ${id.slice(-6).toUpperCase()}`;

    estateLabelMap.set(id, label);
  }

  const estateMetricsMap = new Map<string, EstateBillingMetrics>();

  function ensureEstateMetrics(estateId: string): EstateBillingMetrics {
    const existing = estateMetricsMap.get(estateId);
    if (existing) return existing;

    const label =
      estateLabelMap.get(estateId) ||
      `Estate ${estateId.slice(-6).toUpperCase()}`;

    const created: EstateBillingMetrics = {
      estateId,
      label,
      totalInvoicedCents: 0,
      collectedCents: 0,
      outstandingCents: 0,
      voidedCents: 0,
      unbilledHours: 0,
      unbilledValueCents: 0,
    };

    estateMetricsMap.set(estateId, created);
    return created;
  }

  // --- Aggregate invoice metrics (global + per estate) --------------------
  const totalInvoicedCents = typeof totalsRow?.totalInvoicedCents === "number" ? totalsRow.totalInvoicedCents : 0;
  const totalCollectedCents = typeof totalsRow?.collectedCents === "number" ? totalsRow.collectedCents : 0;
  const totalOutstandingCents = typeof totalsRow?.outstandingCents === "number" ? totalsRow.outstandingCents : 0;
  const totalVoidedCents = typeof totalsRow?.voidedCents === "number" ? totalsRow.voidedCents : 0;

  for (const row of byEstateRows) {
    if (!row._id) continue;
    const estateId = String(row._id);
    const metrics = ensureEstateMetrics(estateId);

    metrics.totalInvoicedCents += typeof row.totalInvoicedCents === "number" ? row.totalInvoicedCents : 0;
    metrics.collectedCents += typeof row.collectedCents === "number" ? row.collectedCents : 0;
    metrics.outstandingCents += typeof row.outstandingCents === "number" ? row.outstandingCents : 0;
    metrics.voidedCents += typeof row.voidedCents === "number" ? row.voidedCents : 0;
  }

  const effectiveOutstanding =
    totalOutstandingCents < 0 ? 0 : totalOutstandingCents;
  const effectiveCollected =
    totalCollectedCents < 0 ? 0 : totalCollectedCents;
  const effectiveInvoiced = totalInvoicedCents < 0 ? 0 : totalInvoicedCents;

  const collectionRate =
    effectiveInvoiced > 0
      ? Math.round((effectiveCollected / effectiveInvoiced) * 100)
      : 0;

  // --- Unbilled time value (global + per estate) -------------------------

  let unbilledMinutesTotal = 0;
  let unbilledTimeValueCents = 0;

  for (const entry of unbilledTimeEntries) {
    let minutes = 0;

    if (
      typeof entry.durationMinutes === "number" &&
      entry.durationMinutes > 0
    ) {
      minutes = entry.durationMinutes;
    } else if (entry.startedAt && entry.stoppedAt) {
      const start = new Date(entry.startedAt).getTime();
      const stop = new Date(entry.stoppedAt).getTime();
      const diffMs = stop - start;
      if (Number.isFinite(diffMs) && diffMs > 0) {
        minutes = diffMs / (1000 * 60);
      }
    }

    if (minutes <= 0) continue;

    const rateCents =
      typeof entry.hourlyRateCents === "number" &&
      entry.hourlyRateCents > 0
        ? entry.hourlyRateCents
        : defaultHourlyRateCents;

    if (rateCents <= 0) continue;

    const valueCents = Math.round((minutes / 60) * rateCents);

    unbilledMinutesTotal += minutes;
    unbilledTimeValueCents += valueCents;

    const estateIdValue = entry.estateId;
    if (estateIdValue) {
      const estateId = String(estateIdValue);
      const metrics = ensureEstateMetrics(estateId);

      metrics.unbilledHours += minutes / 60;
      metrics.unbilledValueCents += valueCents;
    }
  }

  const unbilledHoursTotal = unbilledMinutesTotal / 60;


  // --- Monthly invoicing / collection trend (last 6 months) --------------

  const monthBuckets: MonthlyInvoiceBucket[] = [];

  // Pre-create 6 buckets for the current month and previous 5
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(nowDate.getFullYear(), nowDate.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth(); // 0-11
    const key = `${year}-${month}`;
    const label = d.toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
    });

    monthBuckets.push({
      key,
      label,
      year,
      month,
      invoicedCents: 0,
      collectedCents: 0,
      outstandingCents: 0,
    });
  }

  const monthBucketMap = new Map<string, MonthlyInvoiceBucket>();
  for (const bucket of monthBuckets) {
    monthBucketMap.set(bucket.key, bucket);
  }

  for (const row of monthAggRaw ?? []) {
    const r = row as {
      _id?: { year?: number; month?: number };
      invoicedCents?: number;
      collectedCents?: number;
      outstandingCents?: number;
    };

    const year = typeof r._id?.year === "number" ? r._id.year : null;
    const month1 = typeof r._id?.month === "number" ? r._id.month : null; // 1-12
    if (!year || !month1) continue;

    const key = `${year}-${month1 - 1}`;
    const bucket = monthBucketMap.get(key);
    if (!bucket) continue;

    bucket.invoicedCents += typeof r.invoicedCents === "number" ? r.invoicedCents : 0;
    bucket.collectedCents += typeof r.collectedCents === "number" ? r.collectedCents : 0;
    bucket.outstandingCents += typeof r.outstandingCents === "number" ? r.outstandingCents : 0;
  }

  const maxInvoicedForTrend = monthBuckets.reduce(
    (max, b) => (b.invoicedCents > max ? b.invoicedCents : max),
    0,
  );

  const safeMaxInvoicedForTrend =
    maxInvoicedForTrend > 0 ? maxInvoicedForTrend : 1;

  // --- AR aging buckets (based on due date, fallback to issue/created) ----

  const agingBuckets: ARAgingBucket[] = [
    {
      key: "CURRENT",
      label: "Current (not yet due)",
      minDays: Number.NEGATIVE_INFINITY,
      maxDays: 0,
      totalCents: 0,
      invoiceCount: 0,
    },
    {
      key: "AGE_0_30",
      label: "0–30 days past due",
      minDays: 1,
      maxDays: 30,
      totalCents: 0,
      invoiceCount: 0,
    },
    {
      key: "AGE_31_60",
      label: "31–60 days past due",
      minDays: 31,
      maxDays: 60,
      totalCents: 0,
      invoiceCount: 0,
    },
    {
      key: "AGE_61_90",
      label: "61–90 days past due",
      minDays: 61,
      maxDays: 90,
      totalCents: 0,
      invoiceCount: 0,
    },
    {
      key: "AGE_90_PLUS",
      label: "90+ days past due",
      minDays: 91,
      maxDays: undefined,
      totalCents: 0,
      invoiceCount: 0,
    },
  ];

  const agingBucketList = agingBuckets;
  const agingMap = new Map<string, { totalCents: number; invoiceCount: number }>();
  for (const row of agingAggRaw ?? []) {
    const r = row as { _id?: string; totalCents?: number; invoiceCount?: number };
    const key = typeof r._id === "string" ? r._id : null;
    if (!key) continue;
    agingMap.set(key, {
      totalCents: typeof r.totalCents === "number" ? r.totalCents : 0,
      invoiceCount: typeof r.invoiceCount === "number" ? r.invoiceCount : 0,
    });
  }

  for (const bucket of agingBucketList) {
    const hit = agingMap.get(bucket.key);
    if (!hit) continue;
    bucket.totalCents = hit.totalCents;
    bucket.invoiceCount = hit.invoiceCount;
  }

  const estateMetrics = Array.from(estateMetricsMap.values()).sort(
    (a, b) => b.totalInvoicedCents - a.totalInvoicedCents,
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8">
      <PageHeader
        eyebrow="Workspace"
        title="Billing overview"
        description="High-level view of everything you have invoiced, collected, and still have outstanding across all estates."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/app/invoices/new"
              className="inline-flex h-9 items-center rounded-md border border-slate-800 bg-slate-900/60 px-3 text-xs font-medium text-slate-200 shadow-sm transition hover:bg-slate-900"
            >
              New invoice
            </Link>
            <Link
              href="/app/estates/new"
              className="inline-flex h-9 items-center rounded-md border border-slate-800 bg-slate-900/60 px-3 text-xs font-medium text-slate-200 shadow-sm transition hover:bg-slate-900"
            >
              New estate
            </Link>
            <Link
              href="/app/time"
              className="inline-flex h-9 items-center rounded-md border border-slate-800 bg-slate-900/60 px-3 text-xs font-medium text-slate-200 shadow-sm transition hover:bg-slate-900"
            >
              Track time
            </Link>
            <Link
              href="/app/tasks"
              className="inline-flex h-9 items-center rounded-md border border-slate-800 bg-slate-900/60 px-3 text-xs font-medium text-slate-200 shadow-sm transition hover:bg-slate-900"
            >
              View tasks
            </Link>
          </div>
        }
      />
      <p className="text-[11px] text-slate-500">
        Last updated {nowDate.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
      </p>
      {/* Top-level metrics */}
      <section className="grid gap-6 md:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-sm space-y-2">
          <p className="text-xs font-medium text-slate-400">
            Total invoiced
          </p>
          <p className="text-xl font-semibold text-slate-50">
            {formatMoney(effectiveInvoiced, currency)}
          </p>
          <p className="text-[11px] text-slate-500">
            Sum of all invoices regardless of status.
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-sm space-y-2">
          <p className="text-xs font-medium text-emerald-400">
            Collected
          </p>
          <p className="text-xl font-semibold text-emerald-300">
            {formatMoney(effectiveCollected, currency)}
          </p>
          <p className="text-[11px] text-slate-500">
            Fully paid invoices. Collection rate: {collectionRate}%.
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-sm space-y-2">
          <p className="text-xs font-medium text-amber-400">
            Outstanding
          </p>
          <p className="text-xl font-semibold text-amber-300">
            {formatMoney(effectiveOutstanding, currency)}
          </p>
          <p className="text-[11px] text-slate-500">
            Sent, unpaid, or partial invoices still waiting to be collected.
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-sm space-y-2">
          <p className="text-xs font-medium text-slate-400">
            Voided / written off
          </p>
          <p className="text-xl font-semibold text-slate-300">
            {formatMoney(totalVoidedCents, currency)}
          </p>
          <p className="text-[11px] text-slate-500">
            Invoices marked as VOID are excluded from outstanding and
            collection rate.
          </p>
        </div>
      </section>

      {/* AR aging buckets */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">
              Accounts receivable aging
            </p>
            <p className="text-[11px] text-slate-500">
              Breakdown of outstanding invoices by how long they have been past
              due, based on due date when available.
            </p>
          </div>
          <Link
            href="/app/invoices?status=OUTSTANDING"
            className="text-[11px] text-sky-400 hover:text-sky-300"
          >
            Review outstanding invoices
          </Link>
        </div>

        {effectiveOutstanding <= 0 ? (
          <EmptyState
            title="No outstanding invoices"
            description="Everything collectible is already marked as paid or void."
            cta={{ label: "View invoices", href: "/app/invoices" }}
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60 shadow-sm">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-900/80">
                <tr className="text-left text-slate-400">
                  <th scope="col" className="px-3 py-2 font-medium">Bucket</th>
                  <th scope="col" className="px-3 py-2 font-medium">Amount</th>
                  <th scope="col" className="px-3 py-2 font-medium">Percent of outstanding</th>
                  <th scope="col" className="px-3 py-2 font-medium">Invoice count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {agingBucketList.map((bucket) => {
                  if (bucket.totalCents <= 0 && bucket.invoiceCount === 0) {
                    return (
                      <tr
                        key={bucket.key}
                        className="text-slate-500/70"
                      >
                        <td className="px-3 py-2">{bucket.label}</td>
                        <td className="px-3 py-2">–</td>
                        <td className="px-3 py-2">0%</td>
                        <td className="px-3 py-2">0</td>
                      </tr>
                    );
                  }

                  const percent =
                    effectiveOutstanding > 0
                      ? Math.round(
                          (bucket.totalCents / effectiveOutstanding) * 100,
                        )
                      : 0;

                  return (
                    <tr key={bucket.key} className="text-slate-200">
                      <td className="px-3 py-2">{bucket.label}</td>
                      <td className="px-3 py-2 text-amber-300">
                        {formatMoney(bucket.totalCents, currency)}
                      </td>
                      <td className="px-3 py-2">
                        {percent}
                        %
                      </td>
                      <td className="px-3 py-2">
                        {bucket.invoiceCount}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Monthly trend: invoiced vs collected */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">
              Revenue trend (last 6 months)
            </p>
            <p className="text-[11px] text-slate-500">
              Monthly totals for invoiced and collected amounts, with per-month
              collection rate.
            </p>
          </div>
        </div>

        {monthBuckets.every(
          (b) =>
            b.invoicedCents === 0 &&
            b.collectedCents === 0 &&
            b.outstandingCents === 0,
        ) ? (
          <EmptyState
            title="No invoice activity"
            description="Create an invoice to start tracking revenue and collections."
            cta={{ label: "New invoice", href: "/app/invoices/new" }}
          />
        ) : (
          <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-sm">
            {monthBuckets.map((bucket) => {
              const widthPercent =
                (bucket.invoicedCents / safeMaxInvoicedForTrend) * 100;
              const safeWidth = Number.isFinite(widthPercent)
                ? Math.max(4, widthPercent)
                : 4;

              const monthCollectionRate =
                bucket.invoicedCents > 0
                  ? Math.round(
                      (bucket.collectedCents / bucket.invoicedCents) * 100,
                    )
                  : 0;

              return (
                <div
                  key={bucket.key}
                  className="flex items-center gap-3 text-xs"
                >
                  <div className="w-20 shrink-0 text-[11px] text-slate-400">
                    {bucket.label}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div
                      className="h-2 overflow-hidden rounded-full bg-slate-800/80"
                      aria-label={`Invoiced bar for ${bucket.label}`}
                    >
                      <div
                        className="h-full rounded-full bg-sky-500"
                        style={{ width: `${safeWidth}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-500">
                      <span>
                        Invoiced {formatMoney(bucket.invoicedCents, currency)}
                      </span>
                      <span>
                        Collected{" "}
                        {formatMoney(bucket.collectedCents, currency)} ·{" "}
                        {monthCollectionRate}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Unbilled time card + recent invoices */}
      <section className="grid gap-4 md:grid-cols-[minmax(0,2fr),minmax(0,3fr)] items-start">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-sm space-y-2">
          <p className="text-xs font-medium text-sky-400">
            Unbilled time value
          </p>
          <p className="text-xl font-semibold text-sky-300">
            {formatMoney(unbilledTimeValueCents, currency)}
          </p>
          <p className="text-xs text-slate-400">
            {unbilledHoursTotal > 0
              ? `${unbilledHoursTotal.toFixed(1)} hours of tracked time that has not been attached to invoices yet.`
              : "No unbilled time entries yet. Track time and it will appear here until it is invoiced."}
          </p>
          <div className="pt-2">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <Link
                href="/app/estates"
                className="inline-flex items-center text-xs font-medium text-sky-400 hover:text-sky-300"
              >
                Review time by estate
                <span className="ml-1 text-[10px]">↗</span>
              </Link>
              <Link
                href="/app/time?filter=unbilled"
                className="inline-flex items-center text-xs font-medium text-sky-400 hover:text-sky-300"
              >
                View unbilled entries
                <span className="ml-1 text-[10px]">↗</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Recent invoices */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-400">
              Recent invoices
            </p>
            <Link
              href="/app/invoices"
              className="text-[11px] text-sky-400 hover:text-sky-300"
            >
              View all
            </Link>
          </div>

          {recentInvoices.length === 0 ? (
            <EmptyState
              title="No invoices yet"
              description="Create your first invoice to start tracking billing and payments."
              cta={{ label: "New invoice", href: "/app/invoices/new" }}
            />
          ) : (
            <div className="divide-y divide-slate-800/80">
              {recentInvoices.map((inv) => {
                const id = String(inv._id);
                const status =
                  (inv.status as InvoiceStatus | undefined) ?? "DRAFT";
                const amountCents =
                  typeof inv.totalAmount === "number"
                    ? inv.totalAmount
                    : typeof inv.subtotal === "number"
                    ? inv.subtotal
                    : 0;

                const date = inv.issueDate ?? inv.createdAt ?? nowDate;
                const dueDate = inv.dueDate ?? null;

                const baseStatus = typeof status === "string" ? status.toUpperCase() : "DRAFT";
                const isOutstanding = ["SENT", "UNPAID", "PARTIAL"].includes(baseStatus);
                const dueMs = dueDate ? new Date(dueDate).getTime() : null;
                const daysPastDue =
                  isOutstanding && dueMs !== null
                    ? Math.floor((nowDate.getTime() - dueMs) / msPerDay)
                    : null;

                const estateId = inv.estateId ? String(inv.estateId) : null;
                const estateLabel = estateId ? estateLabelMap.get(estateId) : null;

                const statusLabel = baseStatus;
                const statusColor =
                  baseStatus === "PAID"
                    ? "text-emerald-400"
                    : baseStatus === "VOID"
                    ? "text-slate-500"
                    : baseStatus === "SENT" ||
                      baseStatus === "UNPAID" ||
                      baseStatus === "PARTIAL"
                    ? "text-amber-400"
                    : "text-slate-400";

                return (
                  <div
                    key={id}
                    className="flex items-center justify-between py-2 text-xs"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium text-slate-100">
                        {formatMoney(amountCents, currency)}
                      </span>
                      {estateLabel ? (
                        <span className="text-[11px] text-slate-400">
                          {estateLabel}
                        </span>
                      ) : null}
                      <span className="text-slate-500">{formatShortDate(date)}</span>
                      {isOutstanding && dueDate ? (
                        <span className="text-[11px] text-slate-500">
                          Due {formatShortDate(new Date(dueDate))}
                          {typeof daysPastDue === "number" && daysPastDue > 0 ? (
                            <span className="text-amber-400"> · {daysPastDue}d late</span>
                          ) : null}
                        </span>
                      ) : null}
                    </div>
                    <div className="space-y-1 text-right">
                      <span className={`inline-flex items-center rounded-full border border-slate-800 px-2 py-0.5 text-[11px] ${statusColor}`}>
                        {statusLabel}
                      </span>
                      <div>
                        <Link
                          href={`/app/invoices?invoiceId=${encodeURIComponent(id)}`}
                          className="text-[11px] text-sky-400 hover:text-sky-300"
                        >
                          View
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Estate-level billing drilldown */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">
              Estate billing breakdown
            </p>
            <p className="text-[11px] text-slate-500">
              Per-estate totals for invoiced, collected, outstanding, and
              unbilled time value.
            </p>
          </div>
          <Link
            href="/app/estates"
            className="text-[11px] text-sky-400 hover:text-sky-300"
          >
            Manage estates
          </Link>
        </div>

        {estateMetrics.length === 0 ? (
          <EmptyState
            title="No estate billing data yet"
            description="Create an estate, then add invoices or time entries to see a breakdown here."
            cta={{ label: "New estate", href: "/app/estates/new" }}
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60 shadow-sm">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-900/80">
                <tr className="text-left text-slate-400">
                  <th scope="col" className="px-3 py-2 font-medium">Estate</th>
                  <th scope="col" className="px-3 py-2 font-medium">Invoiced</th>
                  <th scope="col" className="px-3 py-2 font-medium">Collected</th>
                  <th scope="col" className="px-3 py-2 font-medium">Outstanding</th>
                  <th scope="col" className="px-3 py-2 font-medium">Unbilled hours</th>
                  <th scope="col" className="px-3 py-2 font-medium">Unbilled value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {estateMetrics.map((row) => (
                  <tr key={row.estateId} className="text-slate-200">
                    <td className="px-3 py-2">
                      <Link
                        href={`/app/estates/${row.estateId}`}
                        className="text-xs font-medium text-sky-400 hover:text-sky-300"
                      >
                        {row.label}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      {formatMoney(row.totalInvoicedCents, currency)}
                    </td>
                    <td className="px-3 py-2 text-emerald-300">
                      {formatMoney(row.collectedCents, currency)}
                    </td>
                    <td className="px-3 py-2 text-amber-300">
                      {formatMoney(
                        row.outstandingCents < 0 ? 0 : row.outstandingCents,
                        currency,
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {row.unbilledHours > 0
                        ? row.unbilledHours.toFixed(1)
                        : "0.0"}
                    </td>
                    <td className="px-3 py-2 text-sky-300">
                      {formatMoney(row.unbilledValueCents, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}