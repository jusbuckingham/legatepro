// src/app/app/invoices/aging/page.tsx
import React from "react";
import mongoose from "mongoose";
import Link from "next/link";
import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Invoice } from "@/models/Invoice";
import { Estate } from "@/models/Estate";
import { WorkspaceSettings } from "@/models/WorkspaceSettings";

export const metadata: Metadata = {
  title: "AR Aging | LegatePro",
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
  invoiceNumber?: string | null;
};

type EstateLike = {
  _id: unknown;
  displayName?: string;
  caseName?: string;
};

type ARAgingBucket = {
  key: string;
  label: string;
  minDays: number;
  maxDays?: number;
};

type ARAgingInvoiceRow = {
  id: string;
  estateId: string | null;
  estateLabel: string;
  status: InvoiceStatus;
  invoiceNumber: string | null;
  amountCents: number;
  dueDate: Date;
  daysPastDue: number;
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

function toObjectId(id: string) {
  return mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : null;
}

function formatShortDate(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(d);
}

function getInvoiceStatusClasses(status: InvoiceStatus | string): string {
  switch (status) {
    case "PAID":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600";
    case "PARTIAL":
      return "border-amber-500/30 bg-amber-500/10 text-amber-600";
    case "UNPAID":
    case "SENT":
    case "DRAFT":
      return "border-sky-500/30 bg-sky-500/10 text-sky-600";
    case "VOID":
      return "border-border bg-muted/20 text-muted-foreground";
    default:
      return "border-border bg-muted/20 text-muted-foreground";
  }
}

export default async function ARAgingPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return null;
  }

  await connectToDatabase();

  const userObjectId = toObjectId(session.user.id);
  const ownerIdOr: Array<Record<string, unknown>> = [
    { ownerId: session.user.id },
    ...(userObjectId ? [{ ownerId: userObjectId }] : []),
  ];

  const [invoicesRaw, estatesRaw, workspaceSettings] = await Promise.all([
    Invoice.find({
      $and: [
        { $or: ownerIdOr },
        { status: { $in: ["SENT", "UNPAID", "PARTIAL"] } },
      ],
    })
      .lean()
      .exec(),
    Estate.find({
      $or: [
        ...ownerIdOr,
        { "collaborators.userId": session.user.id },
      ],
    })
      .lean()
      .exec(),
    WorkspaceSettings.findOne({ $or: ownerIdOr }).lean().exec(),
  ]);

  const invoices = invoicesRaw as InvoiceLike[];
  const estates = estatesRaw as EstateLike[];

  const currency =
    (workspaceSettings &&
      typeof workspaceSettings.defaultCurrency === "string" &&
      workspaceSettings.defaultCurrency.trim().length > 0 &&
      workspaceSettings.defaultCurrency.trim().toUpperCase()) ||
    "USD";

  // Build estate label lookup
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

  const now = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;

  const buckets: ARAgingBucket[] = [
    {
      key: "CURRENT",
      label: "Current (not yet due)",
      minDays: Number.NEGATIVE_INFINITY,
      maxDays: 0,
    },
    {
      key: "AGE_0_30",
      label: "0–30 days past due",
      minDays: 1,
      maxDays: 30,
    },
    {
      key: "AGE_31_60",
      label: "31–60 days past due",
      minDays: 31,
      maxDays: 60,
    },
    {
      key: "AGE_61_90",
      label: "61–90 days past due",
      minDays: 61,
      maxDays: 90,
    },
    {
      key: "AGE_90_PLUS",
      label: "90+ days past due",
      minDays: 91,
      maxDays: undefined,
    },
  ];

  const bucketMap = new Map<string, ARAgingInvoiceRow[]>();
  const bucketTotals = new Map<string, number>();

  for (const bucket of buckets) {
    bucketMap.set(bucket.key, []);
    bucketTotals.set(bucket.key, 0);
  }

  let totalOutstandingCents = 0;

  // Assign invoices into aging buckets
  for (const inv of invoices) {
    const status = (inv.status as InvoiceStatus | undefined) ?? "DRAFT";
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

    const due = new Date(baseDate);
    if (Number.isNaN(due.getTime())) continue;

    const diffMs = now.getTime() - due.getTime();
    const daysPastDue = Math.floor(diffMs / msPerDay);

    let matchedBucket: ARAgingBucket | undefined;

    for (const bucket of buckets) {
      if (
        daysPastDue >= bucket.minDays &&
        (bucket.maxDays === undefined || daysPastDue <= bucket.maxDays)
      ) {
        matchedBucket = bucket;
        break;
      }
    }

    if (!matchedBucket) {
      matchedBucket = buckets[0];
    }

    const id = String(inv._id);
    const estateIdValue = inv.estateId;
    const estateId = estateIdValue ? String(estateIdValue) : null;
    const estateLabel =
      (estateId && estateLabelMap.get(estateId)) ||
      (estateId ? `Estate ${estateId.slice(-6).toUpperCase()}` : "Unassigned");

    const row: ARAgingInvoiceRow = {
      id,
      estateId,
      estateLabel,
      status,
      invoiceNumber:
        typeof inv.invoiceNumber === "string"
          ? inv.invoiceNumber
          : null,
      amountCents,
      dueDate: due,
      daysPastDue,
    };

    bucketMap.get(matchedBucket.key)?.push(row);
    bucketTotals.set(
      matchedBucket.key,
      (bucketTotals.get(matchedBucket.key) ?? 0) + amountCents,
    );
    totalOutstandingCents += amountCents;
  }

  const safeTotalOutstanding =
    totalOutstandingCents > 0 ? totalOutstandingCents : 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Invoices
        </p>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Accounts receivable aging
            </h1>
            <p className="text-sm text-muted-foreground">
              Detailed breakdown of outstanding invoices by how long they have
              been past due. This uses the due date when available, otherwise
              the issue date or created date.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/app/invoices"
              className="inline-flex items-center rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              All invoices
            </Link>
            <Link
              href="/app/dashboard"
              className="inline-flex items-center rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Billing dashboard
            </Link>
          </div>
        </div>
        <nav className="mt-4 inline-flex items-center gap-1 rounded-full border border-border bg-card p-1 text-xs">
          <Link
            href="/app/invoices"
            className="rounded-full px-3 py-1 text-muted-foreground hover:bg-muted/30 hover:text-foreground"
          >
            All invoices
          </Link>
          <Link
            href="/app/invoices/aging"
            className="rounded-full bg-sky-500 px-3 py-1 font-medium text-background shadow-sm hover:bg-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            AR aging
          </Link>
        </nav>
      </header>

      {/* Summary cards */}
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4 space-y-1">
          <p className="text-xs font-medium text-amber-400">
            Total outstanding
          </p>
          <p className="text-xl font-semibold text-amber-300">
            {formatMoney(safeTotalOutstanding, currency)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Sum of all invoices in SENT, UNPAID, or PARTIAL status.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            Buckets with balance
          </p>
          <p className="text-xl font-semibold text-foreground">
            {buckets.filter(
              (b) =>
                (bucketTotals.get(b.key) ?? 0) > 0 &&
                (bucketMap.get(b.key)?.length ?? 0) > 0,
            ).length}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Count of aging buckets that currently have outstanding balances.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            Oldest invoices
          </p>
          <p className="text-xl font-semibold text-foreground">
            {(() => {
              const ninetyPlus = bucketMap.get("AGE_90_PLUS") ?? [];
              if (ninetyPlus.length === 0) return "None";
              const maxDays = ninetyPlus.reduce(
                (max, row) =>
                  row.daysPastDue > max ? row.daysPastDue : max,
                0,
              );
              return `${maxDays} days past due`;
            })()}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Based on invoices that are more than 90 days past their due date.
          </p>
        </div>
      </section>

      {/* Buckets with invoice detail */}
      <section className="space-y-4">
        {buckets.map((bucket) => {
          const rows = bucketMap.get(bucket.key) ?? [];
          const bucketTotal = bucketTotals.get(bucket.key) ?? 0;

          const percent =
            safeTotalOutstanding > 0
              ? Math.round((bucketTotal / safeTotalOutstanding) * 100)
              : 0;

          return (
            <div
              key={bucket.key}
              className="rounded-lg border border-border bg-card"
            >
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="w-full">
                  <p className="text-xs font-medium text-foreground">
                    {bucket.label}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {bucketTotal > 0
                      ? `${formatMoney(bucketTotal, currency)} · ${percent}% of outstanding · ${rows.length} invoice${rows.length === 1 ? "" : "s"}`
                      : "No invoices currently in this bucket."}
                  </p>

                  <div
                    className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted/30"
                    aria-hidden={bucketTotal <= 0}
                  >
                    <div
                      className="h-full rounded-full bg-sky-500/20"
                      style={{ width: `${bucketTotal > 0 ? percent : 0}%` }}
                    />
                  </div>
                </div>
              </div>

              {rows.length === 0 ? (
                <div className="px-4 py-3 text-[11px] text-muted-foreground">
                  Nothing to show here yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="bg-muted/30">
                      <tr className="text-left text-muted-foreground">
                        <th className="px-3 py-2 font-medium">
                          Invoice
                        </th>
                        <th className="px-3 py-2 font-medium">
                          Estate
                        </th>
                        <th className="px-3 py-2 font-medium">
                          Status
                        </th>
                        <th className="px-3 py-2 font-medium">
                          Due date
                        </th>
                        <th className="px-3 py-2 font-medium">
                          Days past due
                        </th>
                        <th className="px-3 py-2 font-medium">
                          Amount
                        </th>
                        <th className="px-3 py-2 font-medium">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {rows
                        .slice()
                        .sort((a, b) => b.daysPastDue - a.daysPastDue)
                        .map((row) => {
                          return (
                            <tr key={row.id} className="text-foreground hover:bg-muted/10">
                              <td className="px-3 py-2">
                                <div className="flex flex-col">
                                  <span className="font-medium">
                                    {row.invoiceNumber ??
                                      `Invoice ${row.id.slice(
                                        -6,
                                      ).toUpperCase()}`}
                                  </span>
                                  <span className="text-[11px] text-muted-foreground">
                                    {row.id}
                                  </span>
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                {row.estateId ? (
                                  <Link
                                    href={`/app/estates/${row.estateId}`}
                                    className="text-xs text-sky-400 hover:text-sky-300"
                                  >
                                    {row.estateLabel}
                                  </Link>
                                ) : (
                                  <span className="text-muted-foreground">
                                    Unassigned
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <span
                                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${getInvoiceStatusClasses(
                                    row.status
                                  )}`}
                                >
                                  {row.status}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                {formatShortDate(row.dueDate)}
                              </td>
                              <td className="px-3 py-2">
                                <span
                                  className={
                                    row.daysPastDue > 0
                                      ? "text-foreground"
                                      : "text-muted-foreground"
                                  }
                                >
                                  {row.daysPastDue > 0
                                    ? `${row.daysPastDue} days`
                                    : "Not yet due"}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-amber-300">
                                {formatMoney(row.amountCents, currency)}
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap gap-2">
                                  <Link
                                    href={`/app/estates/${row.estateId ?? ""}/invoices/${row.id}`}
                                    className="text-[11px] text-sky-400 hover:text-sky-300"
                                  >
                                    Open
                                  </Link>
                                  <Link
                                    href={`/app/estates/${row.estateId ?? ""}/invoices/${row.id}/edit`}
                                    className="text-[11px] text-muted-foreground hover:text-foreground"
                                  >
                                    Edit
                                  </Link>
                                </div>
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
        })}
      </section>
    </div>
  );
}