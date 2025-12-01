"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useParams } from "next/navigation";

type InvoiceSummaryItem = {
  _id: string;
  status?: string;
  issueDate?: string;
  dueDate?: string;
  subtotal?: number;
  totalAmount?: number;
  notes?: string;
};

type BillingSummary = {
  unpaidTotal: number;
  overdueCount: number;
  latestInvoices: InvoiceSummaryItem[];
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

function formatDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
}

export default function EstatePage() {
  const pathname = usePathname();
  const params = useParams<{ estateId: string }>();
  const estateId = params.estateId;

  const tabs = [
    { name: "Overview", href: `/app/estates/${estateId}` },
    { name: "Tasks", href: `/app/estates/${estateId}/tasks` },
    { name: "Time", href: `/app/estates/${estateId}/time` },
    { name: "Invoices", href: `/app/estates/${estateId}/invoices` },
  ];

  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!estateId) return;

    let cancelled = false;

    async function loadBilling() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(
          `/api/invoices?estateId=${estateId}&summary=1`,
          { cache: "no-store" },
        );

        if (!res.ok) {
          throw new Error(`Request failed with status ${res.status}`);
        }

        const data = await res.json();

        if (cancelled) return;

        const unpaidTotal = data?.summary?.unpaidTotal ?? 0;
        const overdueCount = data?.summary?.overdueCount ?? 0;
        const latestInvoices: InvoiceSummaryItem[] = Array.isArray(
          data?.invoices,
        )
          ? data.invoices
          : [];

        setBilling({
          unpaidTotal,
          overdueCount,
          latestInvoices,
        });
      } catch (err) {
        if (!cancelled) {
          setError("Could not load billing info");
          console.error(err);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadBilling();

    return () => {
      cancelled = true;
    };
  }, [estateId]);

  const isActive = (href: string) => {
    if (pathname === href) return true;
    if (pathname.startsWith(`${href}/`)) return true;
    return false;
  };

  const effectiveBilling = billing ?? {
    unpaidTotal: 0,
    overdueCount: 0,
    latestInvoices: [],
  };

  return (
    <div>
      <nav className="mb-6 flex gap-6 border-b border-slate-800">
        {tabs.map((t) => {
          const active = isActive(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={
                active
                  ? "border-b-2 border-sky-500 pb-2 text-slate-100"
                  : "pb-2 text-slate-400 hover:text-slate-200"
              }
            >
              {t.name}
            </Link>
          );
        })}
      </nav>

      {/* Overview content */}
      <div className="space-y-6">
        {error && (
          <p className="text-xs text-red-400">
            {error} – billing numbers may be out of date.
          </p>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-xs font-medium text-slate-400">
              Unpaid invoice total
            </p>
            <p className="mt-2 text-xl font-semibold text-slate-50">
              {formatCurrency(effectiveBilling.unpaidTotal)}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              Sum of all non-PAID, non-VOID invoices for this estate.
            </p>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-xs font-medium text-slate-400">Overdue count</p>
            <p className="mt-2 text-xl font-semibold text-slate-50">
              {effectiveBilling.overdueCount}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              Invoices past due date and not marked PAID/VOID.
            </p>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-xs font-medium text-slate-400">
              Recent invoice activity
            </p>
            <p className="mt-2 text-xl font-semibold text-slate-50">
              {effectiveBilling.latestInvoices.length}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              Last few invoices created for this estate.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-100">
              Latest invoices
            </h2>
            <Link
              href={`/app/estates/${estateId}/invoices`}
              className="text-xs text-sky-400 hover:text-sky-300"
            >
              View all
            </Link>
          </div>

          {loading && (
            <p className="text-xs text-slate-500">Loading invoices…</p>
          )}

          {!loading && effectiveBilling.latestInvoices.length === 0 && (
            <p className="text-xs text-slate-500">
              No invoices yet for this estate.
            </p>
          )}

          {!loading && effectiveBilling.latestInvoices.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2 pr-4 font-medium">Invoice</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Issue date</th>
                    <th className="py-2 pr-4 font-medium">Due date</th>
                    <th className="py-2 pr-4 font-medium text-right">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {effectiveBilling.latestInvoices.map((inv) => {
                    const status = (inv.status || "DRAFT").toString();
                    const amountValue =
                      typeof inv.totalAmount === "number"
                        ? inv.totalAmount
                        : typeof inv.subtotal === "number"
                        ? inv.subtotal
                        : 0;

                    return (
                      <tr
                        key={inv._id}
                        className="border-b border-slate-900 last:border-0"
                      >
                        <td className="py-2 pr-4">
                          <Link
                            href={`/app/estates/${estateId}/invoices/${inv._id}`}
                            className="text-xs text-sky-400 hover:text-sky-300"
                          >
                            {inv._id.slice(-6)}
                          </Link>
                          {inv.notes && (
                            <div className="mt-0.5 max-w-xs truncate text-[11px] text-slate-500">
                              {inv.notes}
                            </div>
                          )}
                        </td>
                        <td className="py-2 pr-4">
                          <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[11px] uppercase tracking-wide text-slate-300">
                            {status}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-slate-300">
                          {formatDate(inv.issueDate)}
                        </td>
                        <td className="py-2 pr-4 text-slate-300">
                          {formatDate(inv.dueDate)}
                        </td>
                        <td className="py-2 pl-4 text-right text-slate-100">
                          {formatCurrency(amountValue)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}