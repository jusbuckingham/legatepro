// src/app/app/estates/[estateId]/invoices/[invoiceId]/print/page.tsx
import { redirect, notFound } from "next/navigation";
import { format } from "date-fns";
import { connectToDatabase } from "@/lib/db";
import { Invoice } from "@/models/Invoice";
import { Estate } from "@/models/Estate";
import { WorkspaceSettings } from "@/models/WorkspaceSettings";
import { auth } from "@/lib/auth";

type PageProps = {
  params: Promise<{
    estateId: string;
    invoiceId: string;
  }>;
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
  const { estateId, invoiceId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  await connectToDatabase();

  // Ensure the current user can access this estate (OWNER/EDITOR/VIEWER)
  // We intentionally do NOT scope queries by ownerId here so collaborators can print.
  // Authorization is enforced by estate access.
  const { requireEstateAccess } = await import("@/lib/estateAccess");
  try {
    await requireEstateAccess({ estateId, userId: session.user.id });
  } catch {
    notFound();
  }

  const [workspaceSettings, invoiceDoc, estateDoc] = await Promise.all([
    WorkspaceSettings.findOne({ ownerId: session.user.id }).lean().exec(),
    Invoice.findOne({ _id: invoiceId, estateId }).lean().exec(),
    Estate.findOne({ _id: estateId }).lean().exec(),
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

  const statusLabel = STATUS_LABELS[status] ?? "Draft";
  const isDraft = status === "DRAFT";
  const isVoid = status === "VOID";
  const isPaid = status === "PAID";

  const invoiceNumber =
    (invoiceDoc as { invoiceNumber?: string | null }).invoiceNumber ?? null;

  const issueDate =
    (invoiceDoc as { issueDate?: Date | string | null }).issueDate ?? null;
  const dueDate =
    (invoiceDoc as { dueDate?: Date | string | null }).dueDate ?? null;
  const paidAt =
    (invoiceDoc as { paidAt?: Date | string | null }).paidAt ?? null;

  const dueDateObj = dueDate ? new Date(dueDate) : null;
  const now = new Date();
  const isOverdue = Boolean(
    !isPaid &&
      !isVoid &&
      dueDateObj &&
      !Number.isNaN(dueDateObj.getTime()) &&
      dueDateObj.getTime() < now.getTime(),
  );
  const daysPastDue = isOverdue
    ? Math.max(
        1,
        Math.floor(
          (now.getTime() - (dueDateObj as Date).getTime()) / (1000 * 60 * 60 * 24),
        ),
      )
    : 0;

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

  const invoiceIdStr = String((invoiceDoc as { _id?: unknown })._id ?? "");

  const displayInvoiceTitle =
    invoiceNumber && invoiceNumber.trim().length > 0
      ? `Invoice ${invoiceNumber}`
      : invoiceIdStr
        ? `Invoice …${invoiceIdStr.slice(-6)}`
        : "Invoice";

  const amountDueCents = totalCents; // can be adjusted later if partial payments are added

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto max-w-3xl px-6 pt-6 print:hidden">
        <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-600">Print view</p>
          <div className="flex items-center gap-3">
            <a
              href={`/app/estates/${estateId}/invoices/${invoiceId}`}
              className="text-xs font-medium text-slate-700 underline-offset-2 hover:text-slate-900 hover:underline"
            >
              Back to invoice
            </a>
            <span className="text-xs text-slate-400">Tip: Use your browser print dialog.</span>
          </div>
        </div>
      </div>
      {isDraft || isVoid ? (
        <div className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center print:fixed">
          <p
            className={
              "select-none text-7xl font-black uppercase tracking-widest " +
              (isVoid ? "text-slate-200" : "text-slate-100")
            }
            style={{ transform: "rotate(-18deg)" }}
          >
            {isVoid ? "VOID" : "DRAFT"}
          </p>
        </div>
      ) : null}

      <div className="relative z-10 mx-auto max-w-3xl px-6 py-8 print:px-0 print:py-4">
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

            <div className="mt-2 flex flex-wrap justify-end gap-2 text-[11px] text-slate-700">
              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5">
                Issue: {formatDate(issueDate)}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5">
                Due: {formatDate(dueDate)}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 font-semibold text-slate-900">
                Amount due: {formatCurrency(amountDueCents / 100, currency)}
              </span>
            </div>

            <p className="mt-2 text-xs text-slate-500">
              Estate: {estateName}
            </p>
          </div>
        </header>
        {(isPaid || isVoid || isOverdue) ? (
          <section className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4">
            {isPaid ? (
              <>
                <p className="text-sm font-semibold text-slate-900">Paid</p>
                <p className="mt-1 text-xs text-slate-600">
                  This invoice has been marked paid{paidAt ? ` on ${formatDate(paidAt)}` : ""}.
                </p>
              </>
            ) : isVoid ? (
              <>
                <p className="text-sm font-semibold text-slate-900">Voided</p>
                <p className="mt-1 text-xs text-slate-600">
                  This invoice has been voided and should not be collected.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-slate-900">Overdue</p>
                <p className="mt-1 text-xs text-slate-600">
                  This invoice is {daysPastDue} day{daysPastDue === 1 ? "" : "s"} past the due date.
                </p>
              </>
            )}
          </section>
        ) : null}

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

        <footer className="mt-8 space-y-1 text-xs text-slate-500 print:mt-6">
          <p>Thank you for your trust and business.</p>
          <p>Generated {formatDate(now)}.</p>
        </footer>
      </div>
    </div>
  );
}