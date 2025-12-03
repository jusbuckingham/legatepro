import React from "react";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { connectToDatabase } from "@/lib/db";
import { Invoice } from "@/models/Invoice";
import { Estate } from "@/models/Estate";
import { WorkspaceSettings } from "@/models/WorkspaceSettings";
import { auth } from "@/lib/auth";

type InvoiceStatus =
  | "DRAFT"
  | "SENT"
  | "UNPAID"
  | "PARTIAL"
  | "PAID"
  | "VOID";

type PageProps = {
  params: Promise<{
    estateId: string;
    invoiceId: string;
  }>;
};

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
  paidAt?: Date;
  invoiceNumber?: string;
  currency?: string;
};

type EstateDocLean = {
  _id: string;
  displayName?: string;
  caseName?: string;
  caseNumber?: string;
};

function formatCurrency(
  amount: number,
  currency: string | undefined = "USD",
): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

function formatDateOptional(date?: Date): string {
  if (!date) return "";
  try {
    return format(date, "MMM d, yyyy");
  } catch {
    return "";
  }
}

function getInvoiceAmount(inv: InvoiceDocLean): number {
  if (typeof inv.totalAmount === "number") return inv.totalAmount;
  if (typeof inv.subtotal === "number") return inv.subtotal;
  return 0;
}

export const metadata = {
  title: "Printable Invoice | LegatePro",
};

export default async function PrintableInvoicePage({ params }: PageProps) {
  const { estateId, invoiceId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  await connectToDatabase();

  const workspaceSettings = await WorkspaceSettings.findOne({
    ownerId: session.user.id,
  })
    .lean()
    .catch(() => null as unknown as null);

  const ws = (workspaceSettings ?? null) as {
    firmName?: string | null;
    firmAddressLine1?: string | null;
    firmAddressLine2?: string | null;
    firmCity?: string | null;
    firmRegion?: string | null;
    firmPostalCode?: string | null;
    firmEmail?: string | null;
    firmPhone?: string | null;
  } | null;

  const firmName =
    (ws?.firmName &&
      typeof ws.firmName === "string" &&
      ws.firmName.trim().length > 0 &&
      ws.firmName.trim()) ||
    "LegatePro Law";

  const addressParts: string[] = [];

  if (
    ws?.firmAddressLine1 &&
    typeof ws.firmAddressLine1 === "string" &&
    ws.firmAddressLine1.trim().length > 0
  ) {
    addressParts.push(ws.firmAddressLine1.trim());
  }

  if (
    ws?.firmAddressLine2 &&
    typeof ws.firmAddressLine2 === "string" &&
    ws.firmAddressLine2.trim().length > 0
  ) {
    addressParts.push(ws.firmAddressLine2.trim());
  }

  const cityRegionPostal: string[] = [];

  if (
    ws?.firmCity &&
    typeof ws.firmCity === "string" &&
    ws.firmCity.trim().length > 0
  ) {
    cityRegionPostal.push(ws.firmCity.trim());
  }

  if (
    ws?.firmRegion &&
    typeof ws.firmRegion === "string" &&
    ws.firmRegion.trim().length > 0
  ) {
    cityRegionPostal.push(ws.firmRegion.trim());
  }

  if (
    ws?.firmPostalCode &&
    typeof ws.firmPostalCode === "string" &&
    ws.firmPostalCode.trim().length > 0
  ) {
    cityRegionPostal.push(ws.firmPostalCode.trim());
  }

  if (
    addressParts.length === 0 &&
    (!ws || !ws.firmCity || !ws.firmRegion)
  ) {
    // Sensible default if nothing is configured
    addressParts.push("Los Angeles, CA");
  }

  const contactParts: string[] = [];

  if (
    ws?.firmEmail &&
    typeof ws.firmEmail === "string" &&
    ws.firmEmail.trim().length > 0
  ) {
    contactParts.push(ws.firmEmail.trim());
  }

  if (
    ws?.firmPhone &&
    typeof ws.firmPhone === "string" &&
    ws.firmPhone.trim().length > 0
  ) {
    contactParts.push(ws.firmPhone.trim());
  }

  const contactLine =
    contactParts.length > 0 ? contactParts.join(" • ") : null;

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
    paidAt: (rawInvoice as { paidAt?: Date }).paidAt,
    invoiceNumber: (rawInvoice as { invoiceNumber?: string }).invoiceNumber,
    currency: (rawInvoice as { currency?: string }).currency,
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

  const amount = getInvoiceAmount(invoiceDoc);
  const issueDateFormatted = formatDateOptional(invoiceDoc.issueDate);
  const dueDateFormatted = formatDateOptional(invoiceDoc.dueDate);
  const paidAtFormatted = formatDateOptional(invoiceDoc.paidAt);

  const invoiceNumberLabel =
    invoiceDoc.invoiceNumber || `…${invoiceDoc._id.slice(-6)}`;

  const rawStatus = String(invoiceDoc.status || "DRAFT").toUpperCase();
  const statusUpper: InvoiceStatus =
    rawStatus === "SENT" ||
    rawStatus === "UNPAID" ||
    rawStatus === "PARTIAL" ||
    rawStatus === "PAID" ||
    rawStatus === "VOID"
      ? rawStatus
      : "DRAFT";

  return (
    <div className="min-h-screen bg-white text-slate-900 print:bg-white print:text-black">
      <div className="mx-auto max-w-3xl px-6 py-8 print:px-4 print:py-4">
        {/* Header / Firm Info + Invoice meta */}
        <header className="mb-8 flex items-start justify-between gap-6 border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Invoice
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Invoice #{invoiceNumberLabel}
            </p>
            <div className="mt-4 text-xs text-slate-600 space-y-0.5">
              <p className="font-semibold text-slate-800">From</p>
              <p>{firmName}</p>
              {addressParts.map((line) => (
                <p key={line}>{line}</p>
              ))}
              {contactLine && <p>{contactLine}</p>}
            </div>
          </div>

          <div className="text-right text-sm text-slate-700 space-y-1">
            <div>
              <span className="font-medium text-slate-900">Status: </span>
              <span>{statusUpper}</span>
            </div>
            {issueDateFormatted && (
              <div>
                <span className="font-medium text-slate-900">Issue date: </span>
                <span>{issueDateFormatted}</span>
              </div>
            )}
            {dueDateFormatted && (
              <div>
                <span className="font-medium text-slate-900">Due date: </span>
                <span>{dueDateFormatted}</span>
              </div>
            )}
            {paidAtFormatted && (
              <div>
                <span className="font-medium text-slate-900">Paid date: </span>
                <span>{paidAtFormatted}</span>
              </div>
            )}
          </div>
        </header>

        {/* Bill to / estate info */}
        <section className="mb-8 flex justify-between gap-6 text-sm text-slate-700">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Bill to
            </p>
            <p className="font-medium text-slate-900">{estateLabel}</p>
            {estateDoc?.caseNumber && (
              <p className="text-slate-700">Case #{estateDoc.caseNumber}</p>
            )}
          </div>
          <div className="text-right text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Invoice total
            </p>
            <p className="mt-1 text-xl font-semibold text-slate-900">
              {formatCurrency(amount, invoiceDoc.currency)}
            </p>
          </div>
        </section>

        {/* Line items (simple single-line summary for now) */}
        <section className="mb-8">
          <table className="min-w-full border border-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr className="border-b border-slate-200">
                <th className="px-3 py-2 text-left font-medium text-slate-700">
                  Description
                </th>
                <th className="px-3 py-2 text-right font-medium text-slate-700">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-200 align-top">
                <td className="px-3 py-3 text-slate-800">
                  {invoiceDoc.notes && invoiceDoc.notes.trim().length > 0
                    ? invoiceDoc.notes
                    : "Professional services rendered"}
                </td>
                <td className="px-3 py-3 text-right text-slate-800">
                  {formatCurrency(amount, invoiceDoc.currency)}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Totals */}
        <section className="flex justify-end">
          <div className="w-full max-w-xs space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-700">Subtotal</span>
              <span className="text-slate-900">
                {formatCurrency(
                  invoiceDoc.subtotal ?? amount,
                  invoiceDoc.currency,
                )}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-700">Tax</span>
              <span className="text-slate-900">
                {formatCurrency(0, invoiceDoc.currency)}
              </span>
            </div>
            <div className="mt-2 border-t border-slate-200 pt-2 flex items-center justify-between">
              <span className="font-semibold text-slate-900">Total</span>
              <span className="font-semibold text-slate-900">
                {formatCurrency(amount, invoiceDoc.currency)}
              </span>
            </div>
          </div>
        </section>

        {/* Footer / note */}
        <footer className="mt-8 text-xs text-slate-500">
          <p>Thank you for your trust and business.</p>
        </footer>
      </div>
    </div>
  );
}