import React from "react";
import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Invoice } from "@/models/Invoice";
import InvoiceEditForm, {
  type InvoiceStatus,
  type RawLineItem,
} from "@/components/invoices/InvoiceEditForm";

export const metadata: Metadata = {
  title: "Edit Invoice | LegatePro",
};

type PageProps = {
  params: Promise<{
    estateId: string;
    invoiceId: string;
  }>;
};

export default async function InvoiceEditPage({ params }: PageProps) {
  const { estateId, invoiceId } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  await connectToDatabase();

  const invoice = await Invoice.findOne({
    _id: invoiceId,
    ownerId: session!.user!.id,
    estateId,
  })
    .lean()
    .exec();

  if (!invoice) {
    notFound();
  }

  const status = (invoice.status || "DRAFT") as InvoiceStatus;

  const initialLineItems: RawLineItem[] = Array.isArray(invoice.lineItems)
    ? (invoice.lineItems as RawLineItem[])
    : [];

  const currency =
    typeof invoice.currency === "string" && invoice.currency.trim().length > 0
      ? invoice.currency.trim().toUpperCase()
      : "USD";

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-slate-500">
          Invoices
        </p>
        <h1 className="text-2xl font-semibold text-slate-100">
          Edit invoice
        </h1>
        <p className="text-sm text-slate-400">
          Update line items, memo, and status for this invoice. Totals will be
          recalculated automatically.
        </p>
      </header>

      <InvoiceEditForm
        invoiceId={String(invoice._id)}
        estateId={estateId}
        initialStatus={status}
        initialNotes={(invoice.notes as string | null) ?? null}
        initialCurrency={currency}
        initialLineItems={initialLineItems}
      />
    </div>
  );
}