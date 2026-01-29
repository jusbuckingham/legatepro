import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import PageHeader from "@/components/layout/PageHeader";
import { InvoiceEditForm } from "@/components/invoices/InvoiceEditForm";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { requireEstateEditAccess } from "@/lib/estateAccess";
import { Invoice } from "@/models/Invoice";

export const metadata: Metadata = {
  title: "Edit Invoice | LegatePro",
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type InvoiceStatus = "DRAFT" | "SENT" | "UNPAID" | "PARTIAL" | "PAID" | "VOID";

type InvoiceLineItemType = "TIME" | "EXPENSE" | "FEE" | "COST";

type InvoiceEditLineItemLocal = {
  _id?: string;
  label: string;
  type: InvoiceLineItemType;
  description: string;
  quantity?: number | null;
  unitPrice?: number | null;
  total?: number | null;
};

type PageProps = {
  params: Promise<{
    estateId: string;
    invoiceId: string;
  }>;
};

function normalizeStatus(value: unknown): InvoiceStatus {
  if (typeof value !== "string") return "DRAFT";
  const v = value.trim().toUpperCase();
  const allowed: InvoiceStatus[] = ["DRAFT", "SENT", "UNPAID", "PARTIAL", "PAID", "VOID"];
  return (allowed.includes(v as InvoiceStatus) ? (v as InvoiceStatus) : "DRAFT");
}

function normalizeCurrency(value: unknown): string {
  if (typeof value !== "string") return "USD";
  const v = value.trim().toUpperCase();
  return v.length ? v : "USD";
}

function normalizeLineItemType(value: unknown): InvoiceLineItemType {
  if (typeof value !== "string") return "FEE";
  const v = value.trim().toUpperCase();
  const allowed: InvoiceLineItemType[] = ["TIME", "EXPENSE", "FEE", "COST"];
  return (allowed.includes(v as InvoiceLineItemType) ? (v as InvoiceLineItemType) : "FEE");
}

export default async function InvoiceEditPage({ params }: PageProps) {
  const { estateId, invoiceId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/app/estates/${estateId}/invoices/${invoiceId}/edit`);
  }

  await connectToDatabase();

  // Permission check: only OWNER/EDITOR should edit
  const access = await requireEstateEditAccess({ estateId, userId: session.user.id });
  if (!access?.role || access.role === "VIEWER") {
    redirect(`/app/estates/${estateId}/invoices/${invoiceId}?forbidden=1`);
  }

  const invoice = await Invoice.findOne({
    _id: invoiceId,
    estateId,
  })
    .lean()
    .exec();

  if (!invoice) {
    notFound();
  }

  const status = normalizeStatus((invoice as { status?: unknown }).status);
  const currency = normalizeCurrency((invoice as { currency?: unknown }).currency);

  const rawLineItems = (invoice as { lineItems?: unknown }).lineItems;

  const initialLineItems: InvoiceEditLineItemLocal[] = Array.isArray(rawLineItems)
    ? (rawLineItems as unknown[]).map((item, index) => {
        const src = item as {
          _id?: unknown;
          type?: unknown;
          label?: unknown;
          description?: unknown;
          quantity?: unknown;
          unitPrice?: unknown;
          total?: unknown;
        };

        const description = typeof src.description === "string" ? src.description : "";
        const label = typeof src.label === "string" && src.label.trim().length ? src.label.trim() : "";

        const quantity = typeof src.quantity === "number" ? src.quantity : null;
        const unitPrice = typeof src.unitPrice === "number" ? src.unitPrice : null;
        const total = typeof src.total === "number" ? src.total : null;

        return {
          _id: src._id ? String(src._id) : undefined,
          label: label || description || `Line item ${index + 1}`,
          type: normalizeLineItemType(src.type),
          description,
          quantity,
          unitPrice,
          total,
        };
      })
    : [];

  const notes = (invoice as { notes?: unknown }).notes;

  return (
    <div className="space-y-8 p-6">
      <PageHeader
        eyebrow={
          <nav className="text-xs text-slate-500">
            <Link href="/app/estates" className="text-slate-400 hover:text-slate-200 hover:underline">
              Estates
            </Link>
            <span className="mx-1 text-slate-600">/</span>
            <Link href={`/app/estates/${estateId}`} className="text-slate-400 hover:text-slate-200 hover:underline">
              Overview
            </Link>
            <span className="mx-1 text-slate-600">/</span>
            <Link
              href={`/app/estates/${estateId}/invoices`}
              className="text-slate-400 hover:text-slate-200 hover:underline"
            >
              Invoices
            </Link>
            <span className="mx-1 text-slate-600">/</span>
            <span className="truncate text-rose-200">Edit</span>
          </nav>
        }
        title="Edit invoice"
        description="Update line items, memo, and status for this invoice. Totals are recalculated automatically."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-200">
              {access.role}
            </span>
            <Link
              href={`/app/estates/${estateId}/invoices/${invoiceId}`}
              className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/60"
            >
              View
            </Link>
            <Link
              href={`/app/estates/${estateId}/invoices`}
              className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/60"
            >
              Back
            </Link>
          </div>
        }
      />

      <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 shadow-sm sm:p-6">
        <InvoiceEditForm
          invoiceId={String((invoice as { _id: unknown })._id)}
          estateId={estateId}
          initialStatus={status}
          initialNotes={typeof notes === "string" ? notes : null}
          initialCurrency={currency}
          initialLineItems={initialLineItems}
        />
      </section>
    </div>
  );
}