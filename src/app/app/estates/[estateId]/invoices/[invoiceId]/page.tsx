import React from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";
import { Invoice } from "@/models/Invoice";
import { WorkspaceSettings } from "@/models/WorkspaceSettings";

type PageProps = {
  params: Promise<{
    estateId: string;
    invoiceId: string;
  }>;
};

type InvoiceLineItemLean = {
  _id?: unknown;
  label?: string;
  description?: string;
  type?: string;
  quantity?: number;
  rateCents?: number;
  amountCents?: number;
};

type InvoiceLean = {
  _id: unknown;
  estateId: unknown;
  status: "DRAFT" | "SENT" | "UNPAID" | "PARTIAL" | "PAID" | "VOID";
  issueDate?: Date;
  dueDate?: Date | null;
  notes?: string;
  currency?: string;
  invoiceNumber?: string;
  subtotal?: number;
  totalAmount?: number;
  lineItems?: InvoiceLineItemLean[];
  createdAt?: Date;
};

type EstateLean = {
  _id: unknown;
  displayName?: string;
  caseName?: string;
};

type WorkspaceSettingsLean = {
  firmName?: string;
  firmTagline?: string;
  firmAddressLine1?: string;
  firmAddressLine2?: string;
  firmCity?: string;
  firmState?: string;
  firmPostalCode?: string;
  firmCountry?: string;
  firmEmail?: string;
  firmPhone?: string;
  firmWebsite?: string;
  defaultCurrency?: string;
};

export const metadata: Metadata = {
  title: "Invoice Detail | LegatePro",
};

function formatCurrencyFromCents(
  amountCents: number | null | undefined,
  currency = "USD",
) {
  const cents =
    typeof amountCents === "number" && Number.isFinite(amountCents)
      ? amountCents
      : 0;
  const dollars = cents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(dollars);
}

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function statusLabelClass(status: InvoiceLean["status"]) {
  switch (status) {
    case "PAID":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/40";
    case "SENT":
      return "bg-sky-500/10 text-sky-300 border-sky-500/40";
    case "UNPAID":
    case "PARTIAL":
      return "bg-amber-500/10 text-amber-300 border-amber-500/40";
    case "VOID":
      return "bg-slate-700/40 text-slate-300 border-slate-600/60";
    case "DRAFT":
    default:
      return "bg-slate-800 text-slate-200 border-slate-600";
  }
}

export default async function InvoiceDetailPage({ params }: PageProps) {
  const { estateId, invoiceId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  await connectToDatabase();

  const [estateDoc, invoiceDoc, settings] = await Promise.all([
    Estate.findOne({
      _id: estateId,
      ownerId: session.user.id,
    })
      .lean<EstateLean>()
      .exec(),
    Invoice.findOne({
      _id: invoiceId,
      ownerId: session.user.id,
      estateId,
    })
      .lean<InvoiceLean>()
      .exec(),
    WorkspaceSettings.findOne({
      ownerId: session.user.id,
    })
      .lean<WorkspaceSettingsLean>()
      .exec(),
  ]);

  if (!invoiceDoc) {
    notFound();
  }

  const estateName =
    estateDoc?.displayName || estateDoc?.caseName || "Estate";

  const currency =
    invoiceDoc.currency ||
    settings?.defaultCurrency ||
    "USD";

  const totalCents =
    invoiceDoc.totalAmount ?? invoiceDoc.subtotal ?? 0;

  const invoiceNumberLabel =
    invoiceDoc.invoiceNumber ||
    `…${String(invoiceDoc._id).slice(-6)}`;

  const firmName = settings?.firmName || "Your firm";
  const firmTagline = settings?.firmTagline || null;

  const addressLines: string[] = [];
  if (settings?.firmAddressLine1) {
    addressLines.push(settings.firmAddressLine1);
  }
  if (settings?.firmAddressLine2) {
    addressLines.push(settings.firmAddressLine2);
  }
  const cityLineParts = [
    settings?.firmCity,
    settings?.firmState,
    settings?.firmPostalCode,
  ].filter(Boolean);
  const cityLine = cityLineParts.join(", ");
  if (cityLine) {
    addressLines.push(cityLine);
  }
  if (settings?.firmCountry) {
    addressLines.push(settings.firmCountry);
  }

  const contactLines: string[] = [];
  if (settings?.firmEmail) {
    contactLines.push(settings.firmEmail);
  }
  if (settings?.firmPhone) {
    contactLines.push(settings.firmPhone);
  }
  if (settings?.firmWebsite) {
    contactLines.push(settings.firmWebsite);
  }

  const lineItems = invoiceDoc.lineItems ?? [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <header className="flex flex-col gap-2 border-b border-slate-800 pb-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Invoice
          </p>
          <h1 className="text-2xl font-semibold text-slate-100">
            Invoice {invoiceNumberLabel}
          </h1>
          <p className="text-sm text-slate-400">
            For{" "}
            <Link
              href={`/app/estates/${estateId}`}
              className="text-sky-400 hover:text-sky-300"
            >
              {estateName}
            </Link>
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${statusLabelClass(
              invoiceDoc.status,
            )}`}
          >
            {invoiceDoc.status}
          </span>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Total
            </p>
            <p className="text-xl font-semibold text-slate-50">
              {formatCurrencyFromCents(totalCents, currency)}
            </p>
          </div>
        </div>
      </header>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            From
          </p>
          <div className="space-y-0.5 text-sm text-slate-200">
            <p className="font-medium">{firmName}</p>
            {firmTagline && (
              <p className="text-slate-400 text-xs">{firmTagline}</p>
            )}
            {addressLines.length > 0 && (
              <div className="text-slate-300">
                {addressLines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            )}
            {contactLines.length > 0 && (
              <div className="mt-1 text-slate-400 text-xs">
                {contactLines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Invoice details
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-slate-200">
            <dt className="text-slate-400">Invoice #</dt>
            <dd>{invoiceNumberLabel}</dd>
            <dt className="text-slate-400">Issue date</dt>
            <dd>{formatDate(invoiceDoc.issueDate ?? null)}</dd>
            <dt className="text-slate-400">Due date</dt>
            <dd>{formatDate(invoiceDoc.dueDate ?? null)}</dd>
            <dt className="text-slate-400">Currency</dt>
            <dd>{currency}</dd>
          </dl>
        </div>
      </section>

      <section className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Line items
        </p>
        <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950/40">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-slate-900/70 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Description</th>
                <th className="px-4 py-2 text-right font-medium">Qty</th>
                <th className="px-4 py-2 text-right font-medium">Rate</th>
                <th className="px-4 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {lineItems.length === 0 ? (
                <tr>
                  <td
                    className="px-4 py-4 text-center text-slate-500"
                    colSpan={4}
                  >
                    No line items recorded for this invoice yet.
                  </td>
                </tr>
              ) : (
                lineItems.map((item, idx) => {
                  const qty =
                    typeof item.quantity === "number" ? item.quantity : 0;
                  const rateCents =
                    typeof item.rateCents === "number"
                      ? item.rateCents
                      : 0;
                  const amountCents =
                    typeof item.amountCents === "number"
                      ? item.amountCents
                      : 0;

                  const description =
                    item.label ||
                    item.description ||
                    (item.type ? `${item.type} line item` : "Line item");

                  return (
                    <tr key={(item._id as string) ?? idx}>
                      <td className="px-4 py-2 align-top text-slate-100">
                        <div className="font-medium">{description}</div>
                        {item.type && (
                          <div className="text-[11px] uppercase tracking-wide text-slate-500">
                            {item.type}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-200">
                        {qty || "—"}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-200">
                        {rateCents
                          ? formatCurrencyFromCents(rateCents, currency)
                          : "—"}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-50">
                        {formatCurrencyFromCents(amountCents, currency)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot className="bg-slate-900/60 text-sm text-slate-100">
              <tr>
                <td className="px-4 py-2" colSpan={3}>
                  <span className="text-slate-400">Total</span>
                </td>
                <td className="px-4 py-2 text-right font-semibold">
                  {formatCurrencyFromCents(totalCents, currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {invoiceDoc.notes && (
        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Memo / notes
          </p>
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 whitespace-pre-wrap">
            {invoiceDoc.notes}
          </div>
        </section>
      )}

      <footer className="flex items-center justify-between pt-4 text-xs text-slate-500">
        <Link
          href={`/app/estates/${estateId}/invoices`}
          className="text-slate-400 hover:text-slate-200"
        >
          ← Back to invoices
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/app/estates/${estateId}/invoices/${invoiceId}/edit`}
            className="rounded-md border border-slate-700 px-3 py-1 text-xs font-medium text-slate-100 hover:border-sky-500 hover:text-sky-200"
          >
            Edit invoice
          </Link>
          <Link
            href={`/app/estates/${estateId}/invoices/${invoiceId}/print`}
            className="rounded-md border border-slate-700 px-3 py-1 text-xs font-medium text-slate-100 hover:border-sky-500 hover:text-sky-200"
          >
            Print / PDF view
          </Link>
        </div>
      </footer>
    </div>
  );
}