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
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-slate-500">
          Invoices
        </p>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-100">
              Accounts receivable aging
            </h1>
            <p className="text-sm text-slate-400">
              Detailed breakdown of outstanding invoices by how long they have
              been past due. This uses the due date when available, otherwise
              the issue date or created date.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/app/invoices"
              className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
            >
              All invoices
            </Link>
            <Link
              href="/app/dashboard"
              className="inline-flex items-center rounded-md border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
            >
              Billing dashboard
            </Link>
          </div>
        </div>
        <nav className="mt-4 inline-flex items-center gap-1 rounded-full bg-slate-900/60 p-1 text-xs">
          <Link
            href="/app/invoices"
            className="rounded-full px-3 py-1 text-slate-300 hover:text-slate-100 hover:bg-slate-800"
          >
            All invoices
          </Link>
          <Link
            href="/app/invoices/aging"
            className="rounded-full px-3 py-1 bg-sky-500 text-slate-950 font-medium shadow-sm hover:bg-sky-400"
          >
            AR aging
          </Link>
        </nav>
      </header>

      {/* Summary cards */}
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 space-y-1">
          <p className="text-xs font-medium text-amber-400">
            Total outstanding
          </p>
          <p className="text-xl font-semibold text-amber-300">
            {formatMoney(safeTotalOutstanding, currency)}
          </p>
          <p className="text-[11px] text-slate-500">
            Sum of all invoices in SENT, UNPAID, or PARTIAL status.
          </p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 space-y-1">
          <p className="text-xs font-medium text-slate-400">
            Buckets with balance
          </p>
          <p className="text-xl font-semibold text-slate-100">
            {buckets.filter(
              (b) =>
                (bucketTotals.get(b.key) ?? 0) > 0 &&
                (bucketMap.get(b.key)?.length ?? 0) > 0,
            ).length}
          </p>
          <p className="text-[11px] text-slate-500">
            Count of aging buckets that currently have outstanding balances.
          </p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 space-y-1">
          <p className="text-xs font-medium text-slate-400">
            Oldest invoices
          </p>
          <p className="text-xl font-semibold text-slate-100">
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
          <p className="text-[11px] text-slate-500">
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
              className="rounded-lg border border-slate-800 bg-slate-900/60"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                <div>
                  <p className="text-xs font-medium text-slate-200">
                    {bucket.label}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {bucketTotal > 0
                      ? `${formatMoney(bucketTotal, currency)} · ${percent}% of outstanding · ${rows.length} invoice${rows.length === 1 ? "" : "s"}`
                      : "No invoices currently in this bucket."}
                  </p>
                </div>
              </div>

              {rows.length === 0 ? (
                <div className="px-4 py-3 text-[11px] text-slate-500">
                  Nothing to show here yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-900/80">
                      <tr className="text-left text-slate-400">
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
                    <tbody className="divide-y divide-slate-800">
                      {rows
                        .slice()
                        .sort((a, b) => b.daysPastDue - a.daysPastDue)
                        .map((row) => {
                          const statusColor =
                            row.status === "PAID"
                              ? "text-emerald-400"
                              : row.status === "VOID"
                              ? "text-slate-500"
                              : row.status === "SENT" ||
                                row.status === "UNPAID" ||
                                row.status === "PARTIAL"
                              ? "text-amber-400"
                              : "text-slate-400";

                          return (
                            <tr key={row.id} className="text-slate-200">
                              <td className="px-3 py-2">
                                <div className="flex flex-col">
                                  <span className="font-medium">
                                    {row.invoiceNumber ??
                                      `Invoice ${row.id.slice(
                                        -6,
                                      ).toUpperCase()}`}
                                  </span>
                                  <span className="text-[11px] text-slate-500">
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
                                  <span className="text-slate-500">
                                    Unassigned
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <span className={statusColor}>
                                  {row.status}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                {row.dueDate.toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })}
                              </td>
                              <td className="px-3 py-2">
                                {row.daysPastDue > 0
                                  ? `${row.daysPastDue} days`
                                  : "Not yet due"}
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
                                    className="text-[11px] text-slate-400 hover:text-slate-200"
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