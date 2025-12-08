// src/app/app/estates/[estateId]/invoices/[invoiceId]/print/page.tsx
import { redirect, notFound } from "next/navigation";
import { format } from "date-fns";
import { connectToDatabase } from "@/lib/db";
import { Invoice } from "@/models/Invoice";
import { Estate } from "@/models/Estate";
import { WorkspaceSettings } from "@/models/WorkspaceSettings";
import { auth } from "@/lib/auth";

type PageProps = {
  params: {
    estateId: string;
    invoiceId: string;
  };
};

type InvoiceStatus =
  | "DRAFT"
  | "SENT"
  | "UNPAID"
  | "PARTIAL"
  | "PAID"
  | "VOID";

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  UNPAID: "Unpaid",
  PARTIAL: "Partial",
  PAID: "Paid",
  VOID: "Void",
};

type LineItemDoc = {
  _id?: unknown;
  label?: unknown;
  type?: unknown;
  description?: unknown;
  quantity?: unknown;
  unitPrice?: unknown;
  total?: unknown;
};

function formatCurrency(
  amount: number | null | undefined,
  currency: string | null | undefined,
): string {
  const safeAmount = typeof amount === "number" && !Number.isNaN(amount)
    ? amount
    : 0;

  const curr = typeof currency === "string" && currency.trim().length > 0
    ? currency
    : "USD";

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: curr,
    }).format(safeAmount);
  } catch {
    return `$${safeAmount.toFixed(2)}`;
  }
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return format(d, "MMM d, yyyy");
  } catch {
    return d.toLocaleDateString();
  }
}

export default async function PrintableInvoicePage({ params }: PageProps) {
  const { estateId, invoiceId } = params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  await connectToDatabase();

  const [workspaceSettings, invoiceDoc, estateDoc] = await Promise.all([
    WorkspaceSettings.findOne({ ownerId: session.user.id }).lean().exec(),
    Invoice.findOne({ _id: invoiceId, ownerId: session.user.id }).lean().exec(),
    Estate.findOne({ _id: estateId, ownerId: session.user.id }).lean().exec(),
  ]);

  if (!invoiceDoc || !estateDoc) {
    notFound();
  }

  // Workspace info
  const workspaceName =
    (workspaceSettings as { businessName?: string | null } | null)?.businessName ??
    "LegatePro";
  const workspaceAddress =
    (workspaceSettings as { businessAddress?: string | null } | null)
      ?.businessAddress ?? "";
  const workspacePhone =
    (workspaceSettings as { businessPhone?: string | null } | null)
      ?.businessPhone ?? "";
  const workspaceEmail =
    (workspaceSettings as { businessEmail?: string | null } | null)
      ?.businessEmail ?? "";

  // Invoice basics
  const rawStatus =
    (invoiceDoc as { status?: string | null }).status ?? "DRAFT";
  const status = (
    typeof rawStatus === "string" && rawStatus.trim().length > 0
      ? rawStatus.trim().toUpperCase()
      : "DRAFT"
  ) as InvoiceStatus;

  const statusLabel = STATUS_LABELS[status];

  const invoiceNumber =
    (invoiceDoc as { invoiceNumber?: string | null }).invoiceNumber ?? null;

  const issueDate =
    (invoiceDoc as { issueDate?: Date | string | null }).issueDate ?? null;
  const dueDate =
    (invoiceDoc as { dueDate?: Date | string | null }).dueDate ?? null;
  const paidAt =
    (invoiceDoc as { paidAt?: Date | string | null }).paidAt ?? null;

  const subtotalCents =
    (invoiceDoc as { subtotal?: number | null }).subtotal ?? 0;
  const totalCents =
    (invoiceDoc as { totalAmount?: number | null }).totalAmount ??
    subtotalCents;
  const currency =
    (invoiceDoc as { currency?: string | null }).currency ?? "USD";

  const notes = (invoiceDoc as { notes?: string | null }).notes ?? null;

  const lineItemsRaw =
    (invoiceDoc as { lineItems?: LineItemDoc[] | null }).lineItems ?? [];

  const lineItems: LineItemDoc[] = Array.isArray(lineItemsRaw)
    ? lineItemsRaw
    : [];

  // Estate info
  const estateName =
    (estateDoc as { name?: string | null }).name ?? "Estate";
  const estateReference =
    (estateDoc as { referenceId?: string | null }).referenceId ?? null;
  const estateCourtCase =
    (estateDoc as { caseNumber?: string | null }).caseNumber ?? null;

  const displayInvoiceTitle =
    invoiceNumber && invoiceNumber.trim().length > 0
      ? `Invoice ${invoiceNumber}`
      : `Invoice …${String(
          (invoiceDoc as { _id?: unknown })._id ?? "",
        ).slice(-6)}`;

  const amountDueCents = totalCents; // can be adjusted later if partial payments are added

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto max-w-3xl px-6 py-8 print:px-0 print:py-4">
        {/* Header */}
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {workspaceName}
            </h1>
            {workspaceAddress && (
              <p className="mt-1 text-xs text-slate-600">
                {workspaceAddress}
              </p>
            )}
            {(workspacePhone || workspaceEmail) && (
              <p className="mt-1 text-xs text-slate-600">
                {workspacePhone && <span>{workspacePhone}</span>}
                {workspacePhone && workspaceEmail && <span> · </span>}
                {workspaceEmail && <span>{workspaceEmail}</span>}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {statusLabel}
            </p>
            <p className="mt-1 text-lg font-semibold">{displayInvoiceTitle}</p>
            <p className="mt-1 text-xs text-slate-500">
              Estate: {estateName}
            </p>
            {estateReference && (
              <p className="mt-0.5 text-xs text-slate-500">
                Reference: {estateReference}
              </p>
            )}
            {estateCourtCase && (
              <p className="mt-0.5 text-xs text-slate-500">
                Court Case: {estateCourtCase}
              </p>
            )}
          </div>
        </header>

        {/* Meta / dates */}
        <section className="mt-4 grid gap-4 text-sm md:grid-cols-2">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Billing To
            </p>
            <p className="text-sm font-medium">{estateName}</p>
          </div>
          <div className="space-y-1 text-sm md:text-right">
            <p>
              <span className="font-medium">Issue Date:</span>{" "}
              {formatDate(issueDate)}
            </p>
            <p>
              <span className="font-medium">Due Date:</span>{" "}
              {formatDate(dueDate)}
            </p>
            {paidAt && (
              <p>
                <span className="font-medium">Paid:</span>{" "}
                {formatDate(paidAt)}
              </p>
            )}
          </div>
        </section>

        {/* Line items */}
        <section className="mt-6 rounded-md border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">Description</th>
                <th className="px-4 py-2 text-right">Quantity</th>
                <th className="px-4 py-2 text-right">Rate</th>
                <th className="px-4 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.length === 0 ? (
                <tr>
                  <td
                    className="px-4 py-4 text-center text-sm text-slate-500"
                    colSpan={4}
                  >
                    No line items recorded.
                  </td>
                </tr>
              ) : (
                lineItems.map((raw, index) => {
                  const item = raw as LineItemDoc;

                  const description =
                    typeof item.description === "string" &&
                    item.description.trim().length > 0
                      ? item.description
                      : typeof item.label === "string" &&
                          item.label.trim().length > 0
                        ? item.label
                        : `Line item ${index + 1}`;

                  const quantity =
                    typeof item.quantity === "number" ? item.quantity : null;
                  const unitPriceCents =
                    typeof item.unitPrice === "number" ? item.unitPrice : null;
                  const totalCentsItem =
                    typeof item.total === "number" ? item.total : null;

                  const rowKey =
                    item._id != null ? String(item._id) : `line-${index}`;

                  return (
                    <tr
                      key={rowKey}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td className="px-4 py-2 align-top">
                        <p className="text-sm">{description}</p>
                      </td>
                      <td className="px-4 py-2 align-top text-right">
                        {quantity != null ? quantity : "—"}
                      </td>
                      <td className="px-4 py-2 align-top text-right">
                        {unitPriceCents != null
                          ? formatCurrency(
                              unitPriceCents / 100,
                              currency,
                            )
                          : "—"}
                      </td>
                      <td className="px-4 py-2 align-top text-right">
                        {totalCentsItem != null
                          ? formatCurrency(
                              totalCentsItem / 100,
                              currency,
                            )
                          : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </section>

        {/* Totals */}
        <section className="mt-6 flex flex-col items-end gap-2 text-sm">
          <div className="flex min-w-[240px] justify-between">
            <span className="text-slate-600">Subtotal</span>
            <span className="font-medium text-slate-900">
              {formatCurrency(subtotalCents / 100, currency)}
            </span>
          </div>
          <div className="flex min-w-[240px] justify-between">
            <span className="text-slate-600">Total</span>
            <span className="font-semibold text-slate-900">
              {formatCurrency(totalCents / 100, currency)}
            </span>
          </div>
          <div className="mt-2 flex min-w-[240px] justify-between border-t border-slate-200 pt-2">
            <span className="text-slate-600">Amount Due</span>
            <span className="text-lg font-semibold text-slate-900">
              {formatCurrency(amountDueCents / 100, currency)}
            </span>
          </div>
        </section>

        {/* Notes / footer */}
        {(notes && notes.trim().length > 0) && (
          <section className="mt-6 text-sm text-slate-700">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Notes
            </p>
            <p className="mt-1 whitespace-pre-line">{notes}</p>
          </section>
        )}

        <footer className="mt-8 text-xs text-slate-500 print:mt-6">
          <p>Thank you for your trust and business.</p>
        </footer>
      </div>
    </div>
  );
}