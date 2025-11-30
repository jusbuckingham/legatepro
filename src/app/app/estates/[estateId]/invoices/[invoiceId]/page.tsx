

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";
import { Invoice } from "@/models/Invoice";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";

type PageParams = {
  estateId: string;
  invoiceId: string;
};

type PageProps = {
  params: Promise<PageParams>;
};

type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "VOID";

type InvoiceLineItem = {
  _id?: string;
  kind?: "TIME" | "EXPENSE" | "ADJUSTMENT" | string;
  description?: string;
  date?: string | Date | null;
  hours?: number | null;
  rate?: number | null;
  amount?: number | null;
};

type InvoiceLean = {
  _id: string;
  estateId: string;
  ownerId: string;
  number?: string;
  status?: InvoiceStatus | string;
  issueDate?: string | Date | null;
  dueDate?: string | Date | null;
  subtotal?: number | null;
  taxRate?: number | null;
  taxAmount?: number | null;
  total?: number | null;
  notes?: string | null;
  lineItems?: InvoiceLineItem[];
};

const formatCurrency = (amount: number | null | undefined) =>
  typeof amount === "number"
    ? amount.toLocaleString("en-US", { style: "currency", currency: "USD" })
    : "—";

const formatDate = (value: string | Date | null | undefined) => {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "MMM d, yyyy");
};

const statusLabelClass = (status: string | undefined) => {
  switch (status) {
    case "PAID":
      return "bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/40";
    case "SENT":
      return "bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/40";
    case "VOID":
      return "bg-rose-500/10 text-rose-300 ring-1 ring-rose-500/40";
    case "DRAFT":
    default:
      return "bg-slate-700/40 text-slate-200 ring-1 ring-slate-600/60";
  }
};

export default async function EstateInvoicePage({ params }: PageProps) {
  const { estateId, invoiceId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  await connectToDatabase();

  const estateDoc = await Estate.findOne({
    _id: estateId,
    ownerId: session.user.id,
  })
    .lean()
    .exec();

  if (!estateDoc) {
    notFound();
  }

  const invoiceDoc = (await Invoice.findOne({
    _id: invoiceId,
    estateId,
    ownerId: session.user.id,
  })
    .lean()
    .exec()) as InvoiceLean | null;

  if (!invoiceDoc) {
    notFound();
  }

  const invoice: InvoiceLean = {
    ...invoiceDoc,
    _id: String(invoiceDoc._id),
    issueDate: invoiceDoc.issueDate ?? null,
    dueDate: invoiceDoc.dueDate ?? null,
    subtotal: invoiceDoc.subtotal ?? null,
    taxRate: invoiceDoc.taxRate ?? null,
    taxAmount: invoiceDoc.taxAmount ?? null,
    total: invoiceDoc.total ?? null,
    notes: invoiceDoc.notes ?? null,
    lineItems: Array.isArray(invoiceDoc.lineItems) ? invoiceDoc.lineItems : [],
  };

  const estateNameSource = estateDoc as unknown as {
    displayName?: string | null;
    caseName?: string | null;
    decedentName?: string | null;
  };

  const estateDisplayName =
    estateNameSource.displayName ||
    estateNameSource.caseName ||
    estateNameSource.decedentName ||
    "Estate";

  const lineItems = invoice.lineItems ?? [];

  const subtotal =
    typeof invoice.subtotal === "number"
      ? invoice.subtotal
      : lineItems.reduce(
          (sum, li) => sum + (typeof li.amount === "number" ? li.amount : 0),
          0,
        );

  const taxRate =
    typeof invoice.taxRate === "number" && !Number.isNaN(invoice.taxRate)
      ? invoice.taxRate
      : 0;

  const taxAmount =
    typeof invoice.taxAmount === "number"
      ? invoice.taxAmount
      : subtotal * (taxRate / 100);

  const total =
    typeof invoice.total === "number" ? invoice.total : subtotal + taxAmount;

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <nav className="text-sm text-slate-400 flex items-center gap-2">
        <Link
          href="/app/estates"
          className="hover:text-slate-100 transition-colors"
        >
          Estates
        </Link>
        <span className="text-slate-600">/</span>
        <Link
          href={`/app/estates/${estateId}`}
          className="hover:text-slate-100 transition-colors"
        >
          {estateDisplayName}
        </Link>
        <span className="text-slate-600">/</span>
        <Link
          href={`/app/estates/${estateId}/invoices`}
          className="hover:text-slate-100 transition-colors"
        >
          Invoices
        </Link>
        <span className="text-slate-600">/</span>
        <span className="text-slate-200">
          Invoice {invoice.number ?? invoice._id.slice(-6).toUpperCase()}
        </span>
      </nav>

      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-50 tracking-tight">
            Invoice {invoice.number ?? invoice._id.slice(-6).toUpperCase()}
          </h1>
          <p className="text-sm text-slate-400">
            {estateDisplayName} · Issued {formatDate(invoice.issueDate)}
          </p>
        </div>

        <div className="flex flex-col items-end gap-3">
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${statusLabelClass(
              (invoice.status as string | undefined) ?? "DRAFT",
            )}`}
          >
            {(invoice.status ?? "DRAFT").toString()}
          </span>

          {/* Status actions */}
          <form
            action={`/api/invoices/${invoice._id}/status`}
            method="POST"
            className="flex items-center gap-2"
          >
            <label className="text-xs text-slate-400" htmlFor="status">
              Update status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={(invoice.status as InvoiceStatus | undefined) ?? "DRAFT"}
              className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="DRAFT">Draft</option>
              <option value="SENT">Sent</option>
              <option value="PAID">Paid</option>
              <option value="VOID">Void</option>
            </select>
            <button
              type="submit"
              className="inline-flex items-center rounded-md bg-slate-700 px-3 py-1 text-xs font-medium text-slate-50 hover:bg-slate-600"
            >
              Save
            </button>
          </form>

          <div className="flex gap-2">
            <Link
              href={`/app/estates/${estateId}/invoices`}
              className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900/40 px-3 py-1.5 text-sm font-medium text-slate-100 hover:bg-slate-800/60"
            >
              Back to invoices
            </Link>
            <Link
              href={`/app/estates/${estateId}/invoices/${invoice._id}/edit`}
              className="inline-flex items-center rounded-md bg-indigo-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-400"
            >
              Edit invoice
            </Link>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Subtotal
          </div>
          <div className="mt-1 text-lg font-semibold text-slate-50">
            {formatCurrency(subtotal)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
          <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate-400">
            <span>Tax</span>
            <span>{taxRate ? `${taxRate.toFixed(1)}%` : "—"}</span>
          </div>
          <div className="mt-1 text-lg font-semibold text-slate-50">
            {formatCurrency(taxAmount)}
          </div>
        </div>
        <div className="rounded-xl border border-indigo-600/60 bg-indigo-900/20 px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-indigo-200">
            Total Due
          </div>
          <div className="mt-1 text-lg font-semibold text-white">
            {formatCurrency(total)}
          </div>
          <p className="mt-1 text-xs text-indigo-100/70">
            Due {formatDate(invoice.dueDate)}
          </p>
        </div>
      </div>

      {/* Line items */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/60">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-100">Line Items</h2>
          <p className="text-xs text-slate-400">
            {lineItems.length} item{lineItems.length === 1 ? "" : "s"}
          </p>
        </div>
        {lineItems.length === 0 ? (
          <div className="px-4 py-6 text-sm text-slate-400">
            No line items on this invoice yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-t border-slate-800/80 text-sm">
              <thead className="bg-slate-900/60">
                <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Description</th>
                  <th className="px-4 py-2 text-right">Hours</th>
                  <th className="px-4 py-2 text-right">Rate</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {lineItems.map((item, idx) => {
                  const key = item._id ?? `${idx}-${item.description ?? "item"}`;
                  const kindLabel =
                    item.kind === "TIME"
                      ? "Time"
                      : item.kind === "EXPENSE"
                      ? "Expense"
                      : item.kind === "ADJUSTMENT"
                      ? "Adjustment"
                      : item.kind ?? "Item";

                  return (
                    <tr key={key} className="text-slate-100">
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-300">
                        {formatDate(item.date ?? null)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-300">
                        {kindLabel}
                      </td>
                      <td className="max-w-md px-4 py-2 align-top text-sm text-slate-100">
                        {item.description ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right text-sm text-slate-200">
                        {typeof item.hours === "number"
                          ? item.hours.toFixed(2)
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right text-sm text-slate-200">
                        {typeof item.rate === "number"
                          ? formatCurrency(item.rate)
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right text-sm font-medium text-slate-50">
                        {formatCurrency(item.amount ?? null)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t border-slate-800/80 bg-slate-900/60 text-sm text-slate-100">
                <tr>
                  <td className="px-4 py-2" colSpan={5}>
                    Subtotal
                  </td>
                  <td className="px-4 py-2 text-right font-medium">
                    {formatCurrency(subtotal)}
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2" colSpan={5}>
                    Tax
                  </td>
                  <td className="px-4 py-2 text-right font-medium">
                    {formatCurrency(taxAmount)}
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2" colSpan={5}>
                    Total
                  </td>
                  <td className="px-4 py-2 text-right font-semibold">
                    {formatCurrency(total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-100">Notes</h2>
        <p className="mt-2 whitespace-pre-line text-sm text-slate-300">
          {invoice.notes && invoice.notes.trim().length > 0
            ? invoice.notes
            : "No additional notes for this invoice."}
        </p>
      </div>
    </div>
  );
}