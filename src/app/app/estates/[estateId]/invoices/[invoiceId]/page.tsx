import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";
import { Invoice } from "@/models/Invoice";

type PageProps = {
  params: Promise<{
    estateId: string;
  }>;
};

type InvoiceRow = {
  _id: string;
  invoiceNumber?: string | null;
  description: string;
  amount: number;
  issueDate?: string | null;
  dueDate?: string | null;
  status?: string | null;
};

type EstateLean = {
  _id: unknown;
  name?: string | null;
};

type InvoiceLeanDoc = {
  _id: unknown;
  estateId: unknown;
  invoiceNumber?: string | null;
  description?: string | null;
  status?: string | null;
  issueDate?: Date | string | null;
  dueDate?: Date | string | null;
  subtotal?: number | null;
  totalAmount?: number | null;
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  UNPAID: "Unpaid",
  PARTIAL: "Partial",
  PAID: "Paid",
  VOID: "Void",
};

function formatCurrency(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return "$0.00";
  return `$${amount.toFixed(2)}`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

export default async function InvoicesPage({ params }: PageProps) {
  const { estateId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  await connectToDatabase();

  const [estateDoc, invoiceDocs] = await Promise.all([
    Estate.findOne({ _id: estateId, ownerId: session.user.id })
      .lean()
      .exec() as Promise<EstateLean | null>,
    Invoice.find(
      { estateId, ownerId: session.user.id },
      {
        invoiceNumber: 1,
        description: 1,
        status: 1,
        issueDate: 1,
        dueDate: 1,
        subtotal: 1,
        totalAmount: 1,
      },
    )
      .lean()
      .exec() as Promise<InvoiceLeanDoc[]>,
  ]);

  if (!estateDoc) {
    notFound();
  }

  const invoices: InvoiceRow[] = invoiceDocs.map((doc) => {
    const rawAmount =
      typeof doc.totalAmount === "number"
        ? doc.totalAmount
        : typeof doc.subtotal === "number"
        ? doc.subtotal
        : 0;

    const amountDollars =
      typeof rawAmount === "number" && !Number.isNaN(rawAmount)
        ? rawAmount / 100
        : 0;

    const issue =
      doc.issueDate instanceof Date
        ? doc.issueDate.toISOString()
        : (doc.issueDate as string | null | undefined) ?? null;

    const due =
      doc.dueDate instanceof Date
        ? doc.dueDate.toISOString()
        : (doc.dueDate as string | null | undefined) ?? null;

    const description =
      typeof doc.description === "string" && doc.description.trim().length > 0
        ? doc.description
        : doc.invoiceNumber
        ? `Invoice ${doc.invoiceNumber}`
        : "Invoice";

    return {
      _id: String(doc._id),
      invoiceNumber: doc.invoiceNumber ?? null,
      description,
      amount: amountDollars,
      issueDate: issue,
      dueDate: due,
      status: doc.status ?? null,
    };
  });

  const totalAmount = invoices.reduce((sum, inv) => sum + inv.amount, 0);

  const estateName = estateDoc.name ?? "Estate";

  const sortedInvoices = [...invoices].sort((a, b) => {
    const aDate = a.issueDate ? new Date(a.issueDate).getTime() : 0;
    const bDate = b.issueDate ? new Date(b.issueDate).getTime() : 0;
    return bDate - aDate;
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-col gap-3 border-b border-gray-200 pb-4 md:flex-row md:items-baseline md:justify-between">
        <div>
          <p className="text-xs text-gray-500">
            <Link href="/app/estates" className="hover:underline">
              ← Back to estates
            </Link>
          </p>
          <h1 className="mt-1 text-2xl font-semibold">
            Invoices for {estateName}
          </h1>
          <p className="text-sm text-gray-500">Estate ID: {estateId}</p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <p className="text-xs font-medium uppercase text-gray-500">
            Total Invoiced
          </p>
          <p className="text-lg font-semibold">
            {formatCurrency(totalAmount)}
          </p>
        </div>
      </header>

      {/* Invoices table */}
      <section className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">All Invoices</h2>
          {/* You can wire this to your create invoice flow if desired */}
          <Link
            href={`/app/estates/${estateId}/invoices/new`}
            className="text-xs font-medium text-blue-600 hover:underline"
          >
            Create invoice
          </Link>
        </div>

        {sortedInvoices.length === 0 ? (
          <p className="text-sm text-gray-500">
            No invoices have been created for this estate yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-gray-500">
                  <th className="px-3 py-2">Invoice</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Issue Date</th>
                  <th className="px-3 py-2">Due Date</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedInvoices.map((inv) => {
                  const statusUpper = (inv.status ?? "DRAFT").toUpperCase();
                  const statusLabel =
                    STATUS_LABELS[statusUpper] ?? inv.status ?? "Unknown";

                  const title =
                    inv.invoiceNumber && inv.invoiceNumber.trim().length > 0
                      ? `Invoice ${inv.invoiceNumber}`
                      : inv.description;

                  return (
                    <tr key={inv._id} className="border-b last:border-0">
                      <td className="px-3 py-2 align-top">
                        <Link
                          href={`/app/estates/${estateId}/invoices/${inv._id}`}
                          className="text-sm font-medium text-blue-600 hover:underline"
                        >
                          {title}
                        </Link>
                      </td>
                      <td className="px-3 py-2 align-top text-right">
                        {formatCurrency(inv.amount)}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {formatDate(inv.issueDate ?? null)}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {formatDate(inv.dueDate ?? null)}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium capitalize">
                          {statusLabel}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="flex justify-end gap-2 text-xs">
                          <Link
                            href={`/app/estates/${estateId}/invoices/${inv._id}`}
                            className="text-blue-600 hover:underline"
                          >
                            View
                          </Link>
                          <Link
                            href={`/app/estates/${estateId}/invoices/${inv._id}/edit`}
                            className="text-blue-600 hover:underline"
                          >
                            Edit
                          </Link>
                          <Link
                            href={`/app/estates/${estateId}/invoices/${inv._id}/print`}
                            className="text-blue-600 hover:underline"
                          >
                            Print
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
      </section>
    </div>
  );
}