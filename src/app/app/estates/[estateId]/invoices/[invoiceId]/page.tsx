import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { connectToDatabase } from "@/lib/db";
import { Invoice } from "@/models/Invoice";
import { Estate } from "@/models/Estate";
import { auth } from "@/lib/auth";

type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "VOID";

type InvoiceDocLean = {
  _id: string;
  estateId: string;
  status?: InvoiceStatus | string;
  issueDate?: Date;
  dueDate?: Date;
  notes?: string;
  subtotal?: number;
  totalAmount?: number;
  createdAt?: Date;
  updatedAt?: Date;
  invoiceNumber?: string;
  paidAt?: Date;
};

type EstateDocLean = {
  _id: string;
  displayName?: string;
  caseName?: string;
  caseNumber?: string;
};

type PageProps = {
  params: Promise<{
    estateId: string;
    invoiceId: string;
  }>;
};

type InvoiceAmountLike = {
  totalAmount?: number;
  subtotal?: number;
};

function getInvoiceAmount(inv: InvoiceAmountLike): number {
  if (typeof inv.totalAmount === "number") return inv.totalAmount;
  if (typeof inv.subtotal === "number") return inv.subtotal;
  return 0;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

function formatDateOptional(date?: Date): string {
  if (!date) return "—";
  try {
    return format(date, "MMM d, yyyy");
  } catch {
    return "—";
  }
}

function normalizeStatus(status?: string | InvoiceStatus): InvoiceStatus {
  const s = String(status || "DRAFT").toUpperCase();
  if (s === "SENT" || s === "PAID" || s === "VOID" || s === "DRAFT") {
    return s;
  }
  return "DRAFT";
}

function statusColorClasses(status: InvoiceStatus): string {
  switch (status) {
    case "PAID":
      return "bg-emerald-600/20 text-emerald-300 border-emerald-700/60";
    case "SENT":
      return "bg-sky-600/20 text-sky-300 border-sky-700/60";
    case "VOID":
      return "bg-slate-700/40 text-slate-300 border-slate-600/60";
    case "DRAFT":
    default:
      return "bg-amber-600/15 text-amber-300 border-amber-700/60";
  }
}

export const metadata = {
  title: "Invoice | LegatePro",
};

export default async function InvoiceDetailPage({ params }: PageProps) {
  const { estateId, invoiceId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  await connectToDatabase();

  const rawInvoice = await Invoice.findOne({
    _id: invoiceId,
    ownerId: session.user.id,
  }).lean();

  if (!rawInvoice) {
    redirect(`/app/estates/${estateId}/invoices`);
  }

  const invoiceDoc: InvoiceDocLean = {
    _id:
      typeof rawInvoice._id === "string"
        ? rawInvoice._id
        : (rawInvoice._id as { toString: () => string }).toString(),
    estateId:
      typeof rawInvoice.estateId === "string"
        ? rawInvoice.estateId
        : (rawInvoice.estateId as { toString: () => string }).toString(),
    status: rawInvoice.status,
    issueDate: rawInvoice.issueDate,
    dueDate: rawInvoice.dueDate,
    notes: (rawInvoice as { notes?: string }).notes,
    subtotal: (rawInvoice as { subtotal?: number }).subtotal,
    totalAmount: (rawInvoice as { totalAmount?: number }).totalAmount,
    createdAt: rawInvoice.createdAt,
    updatedAt: rawInvoice.updatedAt,
    invoiceNumber: (rawInvoice as { invoiceNumber?: string }).invoiceNumber,
    paidAt: (rawInvoice as { paidAt?: Date }).paidAt,
  };

  const estateRaw = await Estate.findOne({
    _id: estateId,
    ownerId: session.user.id,
  })
    .select("displayName caseName caseNumber")
    .lean();

  const estateDoc: EstateDocLean | null = estateRaw
    ? {
        _id:
          typeof estateRaw._id === "string"
            ? estateRaw._id
            : (estateRaw._id as { toString: () => string }).toString(),
        displayName: (estateRaw as { displayName?: string }).displayName,
        caseName: (estateRaw as { caseName?: string }).caseName,
        caseNumber: (estateRaw as { caseNumber?: string }).caseNumber,
      }
    : null;

  const estateLabel =
    estateDoc?.displayName || estateDoc?.caseName || "Unnamed estate";

  const status = normalizeStatus(invoiceDoc.status);
  const amount = getInvoiceAmount(invoiceDoc);
  const isPaid = status === "PAID";

  const issueDateFormatted = formatDateOptional(invoiceDoc.issueDate);
  const dueDateFormatted = formatDateOptional(invoiceDoc.dueDate);
  const createdAtFormatted = formatDateOptional(invoiceDoc.createdAt);
  const updatedAtFormatted = formatDateOptional(invoiceDoc.updatedAt);
  const paidAtFormatted = formatDateOptional(invoiceDoc.paidAt);

  const invoiceNumberLabel =
    invoiceDoc.invoiceNumber || `…${invoiceDoc._id.slice(-6)}`;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Invoice
          </p>
          <h1 className="text-2xl font-semibold text-slate-100">
            Invoice {invoiceNumberLabel}
          </h1>
          <p className="text-sm text-slate-400">
            Estate:{" "}
            <Link
              href={`/app/estates/${estateId}`}
              className="font-medium text-sky-400 hover:text-sky-300"
            >
              {estateLabel}
            </Link>
            {estateDoc?.caseNumber && (
              <span className="text-slate-500">
                {" "}
                · Case #{estateDoc.caseNumber}
              </span>
            )}
          </p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
            <span>Issued: {issueDateFormatted}</span>
            <span className="text-slate-600">•</span>
            <span>Due: {dueDateFormatted}</span>
            {createdAtFormatted !== "—" && (
              <>
                <span className="text-slate-600">•</span>
                <span>Created: {createdAtFormatted}</span>
              </>
            )}
            {updatedAtFormatted !== "—" && (
              <>
                <span className="text-slate-600">•</span>
                <span>Updated: {updatedAtFormatted}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-3">
          <div
            className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-wide ${statusColorClasses(
              status,
            )}`}
          >
            {status}
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-slate-400">Total amount</p>
            <p className="text-2xl font-semibold text-slate-50">
              {formatCurrency(amount)}
            </p>
            <p className="text-[11px] text-slate-500">
              {isPaid
                ? paidAtFormatted === "—"
                  ? "Marked as paid."
                  : `Marked as paid on ${paidAtFormatted}.`
                : "Outstanding until fully paid or voided."}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-slate-800 py-3 text-xs">
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/app/estates/${estateId}/invoices`}
            className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900/40 px-3 py-1.5 text-[11px] font-medium text-slate-100 hover:bg-slate-800/60"
          >
            ← Back to invoices
          </Link>
          <button
            type="button"
            className="inline-flex cursor-not-allowed items-center rounded-md border border-slate-800 bg-slate-900/40 px-3 py-1.5 text-[11px] font-medium text-slate-500"
          >
            Edit (coming soon)
          </button>
          <Link
            href={`/app/estates/${estateId}/invoices/${invoiceId}/print`}
            target="_blank"
            className="inline-flex items-center rounded-md border border-slate-800 bg-slate-900/40 px-3 py-1.5 text-[11px] font-medium text-slate-100 hover:bg-slate-800/60"
          >
            Print
          </Link>
        </div>

        <form
          action={`/api/invoices/${invoiceId}/status`}
          method="POST"
          className="flex items-center gap-2"
        >
          <label
            htmlFor="status"
            className="text-[11px] font-medium text-slate-400"
          >
            Update status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={status}
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option value="DRAFT">Draft</option>
            <option value="SENT">Sent</option>
            <option value="PAID">Paid</option>
            <option value="VOID">Void</option>
          </select>
          <button
            type="submit"
            className="inline-flex items-center rounded-md bg-sky-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-sky-500"
          >
            Save
          </button>
        </form>
      </div>

      <section className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-3 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="text-sm font-semibold text-slate-100">
            Description / memo
          </h2>
          {invoiceDoc.notes ? (
            <p className="text-sm text-slate-200 whitespace-pre-line">
              {invoiceDoc.notes}
            </p>
          ) : (
            <p className="text-sm text-slate-500 italic">
              No description has been added to this invoice yet.
            </p>
          )}
          <p className="mt-2 text-[11px] text-slate-500">
            Use this field to briefly describe the work performed, period of
            service, or key details for this invoice.
          </p>
        </div>

        <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="text-sm font-semibold text-slate-100">Summary</h2>
          <dl className="space-y-1 text-sm">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-400">Subtotal</dt>
              <dd className="text-slate-100">
                {formatCurrency(invoiceDoc.subtotal ?? amount)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-400">Tax</dt>
              <dd className="text-slate-100">{formatCurrency(0)}</dd>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-slate-800 pt-2 mt-1">
              <dt className="text-slate-200 font-medium">Total</dt>
              <dd className="text-slate-50 font-semibold">
                {formatCurrency(amount)}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-[11px] text-slate-500">
            Taxes and detailed line items can be added in a future iteration. For
            now, this reflects the single amount stored on the invoice.
          </p>
        </div>
      </section>
    </div>
  );
}