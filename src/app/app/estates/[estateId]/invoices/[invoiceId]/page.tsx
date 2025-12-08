// src/app/app/estates/[estateId]/invoices/[invoiceId]/page.tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import InvoiceStatusButtons from '../InvoiceStatusButtons';

type PageProps = {
  params: {
    estateId: string;
    invoiceId: string;
  };
};

type InvoiceLineItem = {
  _id: string;
  description: string;
  quantity?: number | null;
  unitPrice?: number | null;
  total?: number | null;
};

type InvoiceDetail = {
  _id: string;
  estateId: string;
  status: string;
  invoiceNumber?: string | null;
  issueDate?: string | null;
  dueDate?: string | null;
  subtotal?: number | null;
  totalAmount?: number | null;
  paidAt?: string | null;
  notes?: string | null;
  lineItems?: InvoiceLineItem[] | null;
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PAID: 'Paid',
  SENT: 'Sent',
  VOID: 'Void',
  UNPAID: 'Unpaid',
  PARTIAL: 'Partial',
};

function formatCurrency(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return '$0.00';
  return `$${amount.toFixed(2)}`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

async function getInvoice(invoiceId: string): Promise<InvoiceDetail | null> {
  const res = await fetch(`/api/invoices/${invoiceId}`, {
    cache: 'no-store',
  });

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    throw new Error('Failed to fetch invoice');
  }

  return (await res.json()) as InvoiceDetail;
}

export default async function EstateInvoiceDetailPage({ params }: PageProps) {
  const invoice = await getInvoice(params.invoiceId);

  if (!invoice) {
    notFound();
  }

  const statusUpper = (invoice.status ?? 'DRAFT').toUpperCase();
  const statusLabel = STATUS_LABELS[statusUpper] ?? invoice.status ?? 'Unknown';

  const title =
    invoice.invoiceNumber && invoice.invoiceNumber.trim().length > 0
      ? `Invoice ${invoice.invoiceNumber}`
      : `Invoice …${String(invoice._id).slice(-6)}`;

  const total = invoice.totalAmount ?? invoice.subtotal ?? 0;

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-3 border-b border-gray-200 pb-4 md:flex-row md:items-baseline md:justify-between">
        <div>
          <p className="text-xs text-gray-500">
            <Link
              href={`/app/estates/${params.estateId}/invoices`}
              className="hover:underline"
            >
              ← Back to estate invoices
            </Link>
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-gray-500">
            Estate ID: {params.estateId}
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          {/* Status pill */}
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium uppercase tracking-wide">
            {statusLabel}
          </span>

          {/* Interactive status control */}
          <InvoiceStatusButtons
            invoiceId={String(invoice._id)}
            initialStatus={statusUpper}
          />

          {/* Actions toolbar */}
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <Link
              href={`/app/estates/${params.estateId}/invoices/${params.invoiceId}/edit`}
              className="rounded-md border border-gray-300 px-3 py-1 font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              Edit
            </Link>
            <Link
              href={`/app/estates/${params.estateId}/invoices/${params.invoiceId}/print`}
              className="rounded-md border border-gray-300 px-3 py-1 font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              Print
            </Link>
            <Link
              href={`/app/estates/${params.estateId}/invoices`}
              className="rounded-md border border-gray-200 px-3 py-1 font-medium text-gray-500 hover:bg-gray-50"
            >
              Back to list
            </Link>
          </div>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-gray-500">
            Total Amount
          </p>
          <p className="mt-1 text-xl font-semibold">
            {formatCurrency(total)}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Subtotal: {formatCurrency(invoice.subtotal ?? null)}
          </p>
        </div>
        <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-gray-500">
            Dates
          </p>
          <p className="mt-1 text-sm">
            <span className="font-medium">Issue:</span>{' '}
            {formatDate(invoice.issueDate)}
          </p>
          <p className="mt-1 text-sm">
            <span className="font-medium">Due:</span>{' '}
            {formatDate(invoice.dueDate)}
          </p>
          {invoice.paidAt && (
            <p className="mt-1 text-sm">
              <span className="font-medium">Paid:</span>{' '}
              {formatDate(invoice.paidAt)}
            </p>
          )}
        </div>
        <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-gray-500">
            Status Details
          </p>
          <p className="mt-1 text-sm">
            Current status:{' '}
            <span className="font-medium capitalize">{statusLabel}</span>
          </p>
          {invoice.notes && (
            <p className="mt-2 text-xs text-gray-600">
              <span className="font-medium">Notes:</span> {invoice.notes}
            </p>
          )}
        </div>
      </section>

      <section className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Line Items</h2>
        {!invoice.lineItems || invoice.lineItems.length === 0 ? (
          <p className="text-sm text-gray-500">No line items recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-gray-500">
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-right">Quantity</th>
                  <th className="px-3 py-2 text-right">Unit Price</th>
                  <th className="px-3 py-2 text-right">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lineItems.map((item) => (
                  <tr key={item._id} className="border-b last:border-0">
                    <td className="px-3 py-2 align-top">
                      {item.description}
                    </td>
                    <td className="px-3 py-2 align-top text-right">
                      {item.quantity ?? '—'}
                    </td>
                    <td className="px-3 py-2 align-top text-right">
                      {item.unitPrice != null
                        ? formatCurrency(item.unitPrice)
                        : '—'}
                    </td>
                    <td className="px-3 py-2 align-top text-right">
                      {item.total != null
                        ? formatCurrency(item.total)
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}