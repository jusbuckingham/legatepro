// src/app/app/dashboard/page.tsx
import React from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Invoice } from "@/models/Invoice";
import { TimeEntry } from "@/models/TimeEntry";
import { WorkspaceSettings } from "@/models/WorkspaceSettings";
import { Estate } from "@/models/Estate";

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
  ownerId?: string;
  estateId?: string | unknown;
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

function formatMoney(cents: number, currency: string = "USD"): string {
  const safeCents = Number.isFinite(cents) ? cents : 0;
  const amount = safeCents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    // In practice you probably redirect to sign-in,
    // but for safety we just render nothing.
    return null;
  }

  await connectToDatabase();

  const [invoicesRaw, unbilledTimeRaw, workspaceSettings, estatesRaw] =
    await Promise.all([
      Invoice.find({ ownerId: session.user.id }).lean().exec(),
      TimeEntry.find({
        ownerId: session.user.id,
        isArchived: { $ne: true },
        $or: [
          { billedInvoiceId: { $exists: false } },
          { billedInvoiceId: null },
        ],
      })
        .lean()
        .exec(),
      WorkspaceSettings.findOne({ ownerId: session.user.id }).lean().exec(),
      Estate.find({ ownerId: session.user.id }).lean().exec(),
    ]);

  const invoices = invoicesRaw as InvoiceLike[];
  const unbilledTimeEntries = unbilledTimeRaw as TimeEntryLike[];
  const estates = estatesRaw as EstateLike[];

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

  let totalInvoicedCents = 0;
  let totalCollectedCents = 0;
  let totalOutstandingCents = 0;
  let totalVoidedCents = 0;

  for (const inv of invoices) {
    const status = (inv.status as InvoiceStatus | undefined) ?? "DRAFT";

    // All amounts are stored as cents in the schema
    const amountCents =
      typeof inv.totalAmount === "number"
        ? inv.totalAmount
        : typeof inv.subtotal === "number"
        ? inv.subtotal
        : 0;

    totalInvoicedCents += amountCents;

    switch (status) {
      case "PAID":
        totalCollectedCents += amountCents;
        break;
      case "VOID":
        totalVoidedCents += amountCents;
        break;
      case "SENT":
      case "UNPAID":
      case "PARTIAL":
        totalOutstandingCents += amountCents;
        break;
      // DRAFT and others do not count toward outstanding or collected
      default:
        break;
    }

    const estateIdValue = inv.estateId;
    if (estateIdValue) {
      const estateId = String(estateIdValue);
      const metrics = ensureEstateMetrics(estateId);

      metrics.totalInvoicedCents += amountCents;

      switch (status) {
        case "PAID":
          metrics.collectedCents += amountCents;
          break;
        case "VOID":
          metrics.voidedCents += amountCents;
          break;
        case "SENT":
        case "UNPAID":
        case "PARTIAL":
          metrics.outstandingCents += amountCents;
          break;
        default:
          break;
      }
    }
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

  // --- Simple trend: recent invoices (last 5) -----------------------------

  const recentInvoices = [...invoices]
    .sort((a, b) => {
      const aDate = a.issueDate ?? a.createdAt ?? new Date(0);
      const bDate = b.issueDate ?? b.createdAt ?? new Date(0);
      return (bDate as Date).getTime() - (aDate as Date).getTime();
    })
    .slice(0, 5);

  // --- Monthly invoicing / collection trend (last 6 months) --------------

  const now = new Date();
  const monthBuckets: MonthlyInvoiceBucket[] = [];

  // Pre-create 6 buckets for the current month and previous 5
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
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

  for (const inv of invoices) {
    const baseDate = inv.issueDate ?? inv.createdAt;
    if (!baseDate) continue;

    const date = new Date(baseDate);
    if (Number.isNaN(date.getTime())) continue;

    const year = date.getFullYear();
    const month = date.getMonth();
    const key = `${year}-${month}`;
    const bucket = monthBucketMap.get(key);
    if (!bucket) continue; // older than our window

    const status = (inv.status as InvoiceStatus | undefined) ?? "DRAFT";

    const amountCents =
      typeof inv.totalAmount === "number"
        ? inv.totalAmount
        : typeof inv.subtotal === "number"
        ? inv.subtotal
        : 0;

    bucket.invoicedCents += amountCents;

    switch (status) {
      case "PAID":
        bucket.collectedCents += amountCents;
        break;
      case "SENT":
      case "UNPAID":
      case "PARTIAL":
        bucket.outstandingCents += amountCents;
        break;
      default:
        break;
    }
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
  const msPerDay = 1000 * 60 * 60 * 24;

  for (const inv of invoices) {
    const status = (inv.status as InvoiceStatus | undefined) ?? "DRAFT";

    // Only AR relevant statuses
    if (
      status !== "SENT" &&
      status !== "UNPAID" &&
      status !== "PARTIAL"
    ) {
      continue;
    }

    const amountCents =
      typeof inv.totalAmount === "number"
        ? inv.totalAmount
        : typeof inv.subtotal === "number"
        ? inv.subtotal
        : 0;

    if (amountCents <= 0) continue;

    const baseDate =
      inv.dueDate ?? inv.issueDate ?? inv.createdAt ?? null;
    if (!baseDate) continue;

    const base = new Date(baseDate);
    if (Number.isNaN(base.getTime())) continue;

    const diffMs = now.getTime() - base.getTime();
    const daysPastDue = Math.floor(diffMs / msPerDay);

    let matchedBucket: ARAgingBucket | undefined;

    for (const bucket of agingBucketList) {
      if (
        daysPastDue >= bucket.minDays &&
        (bucket.maxDays === undefined || daysPastDue <= bucket.maxDays)
      ) {
        matchedBucket = bucket;
        break;
      }
    }

    if (!matchedBucket) {
      // If for some reason nothing matches, treat as current
      matchedBucket = agingBucketList[0];
    }

    matchedBucket.totalCents += amountCents;
    matchedBucket.invoiceCount += 1;
  }

  const estateMetrics = Array.from(estateMetricsMap.values()).sort(
    (a, b) => b.totalInvoicedCents - a.totalInvoicedCents,
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-slate-500">
          Workspace
        </p>
        <h1 className="text-2xl font-semibold text-slate-100">
          Billing overview
        </h1>
        <p className="text-sm text-slate-400">
          High-level view of everything you have invoiced, collected, and still
          have outstanding across all estates.
        </p>
      </header>

      {/* Top-level metrics */}
      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 space-y-1">
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

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 space-y-1">
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

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 space-y-1">
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

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 space-y-1">
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
          <p className="text-xs text-slate-500">
            No outstanding invoices at the moment. Everything that can be
            collected is already marked as paid or void.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/60">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-900/80">
                <tr className="text-left text-slate-400">
                  <th className="px-3 py-2 font-medium">Bucket</th>
                  <th className="px-3 py-2 font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">
                    Percent of outstanding
                  </th>
                  <th className="px-3 py-2 font-medium">Invoice count</th>
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
          <p className="text-xs text-slate-500">
            No invoice activity yet in the last six months.
          </p>
        ) : (
          <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
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
                    <div className="h-2 rounded-full bg-slate-800/80 overflow-hidden">
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
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 space-y-2">
          <p className="text-xs font-medium text-sky-400">
            Unbilled time value
          </p>
          <p className="text-xl font-semibold text-sky-300">
            {formatMoney(unbilledTimeValueCents, currency)}
          </p>
          <p className="text-xs text-slate-400">
            {unbilledHoursTotal > 0
              ? `${unbilledHoursTotal.toFixed(
                  1,
                )} hours of tracked time that has not been attached to invoices yet.`
              : "No unbilled time entries detected."}
          </p>
          <div className="pt-2">
            <Link
              href="/app/estates"
              className="inline-flex items-center text-xs font-medium text-sky-400 hover:text-sky-300"
            >
              Review time by estate
              <span className="ml-1 text-[10px]">↗</span>
            </Link>
          </div>
        </div>

        {/* Recent invoices */}
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 space-y-3">
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
            <p className="text-xs text-slate-500">
              No invoices yet. Create your first one from any estate or the
              global invoices tab.
            </p>
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

                const date =
                  inv.issueDate ??
                  inv.createdAt ??
                  new Date();

                const statusLabel = status.toUpperCase();
                const statusColor =
                  status === "PAID"
                    ? "text-emerald-400"
                    : status === "VOID"
                    ? "text-slate-500"
                    : status === "SENT" ||
                      status === "UNPAID" ||
                      status === "PARTIAL"
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
                      <span className="text-slate-500">
                        {date.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                    <div className="text-right space-y-1">
                      <span className={statusColor}>{statusLabel}</span>
                      <div>
                        <Link
                          href="/app/invoices"
                          className="text-[11px] text-sky-400 hover:text-sky-300"
                        >
                          Open
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
          <p className="text-xs text-slate-500">
            No estate level billing data yet. Create an estate and attach
            invoices or time entries to see a breakdown here.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/60">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-900/80">
                <tr className="text-left text-slate-400">
                  <th className="px-3 py-2 font-medium">Estate</th>
                  <th className="px-3 py-2 font-medium">Invoiced</th>
                  <th className="px-3 py-2 font-medium">Collected</th>
                  <th className="px-3 py-2 font-medium">Outstanding</th>
                  <th className="px-3 py-2 font-medium">Unbilled hours</th>
                  <th className="px-3 py-2 font-medium">Unbilled value</th>
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