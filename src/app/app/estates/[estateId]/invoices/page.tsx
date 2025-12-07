// src/app/app/estates/[estateId]/invoices/page.tsx
import Link from 'next/link';
import CreateInvoiceForm from './CreateInvoiceForm';
import InvoiceStatusButtons from './InvoiceStatusButtons';

type PageProps = {
  params: {
    estateId: string;
  };
};

type InvoiceLean = {
  _id: string;
  description: string;
  amount: number;
  issueDate: string;
  dueDate?: string;
  status?: string;
};

async function getInvoices(estateId: string): Promise<InvoiceLean[]> {
  const res = await fetch(`/api/estates/${estateId}/invoices`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    // In case of error, just return an empty list so the page still renders
    return [];
  }

  return (await res.json()) as InvoiceLean[];
}

export default async function InvoicesPage({ params }: PageProps) {
  const invoices = await getInvoices(params.estateId);

  const totalAmount = invoices.reduce((sum, inv) => sum + inv.amount, 0);

  const unpaidTotal = invoices
    .filter((inv) => (inv.status ?? 'draft') !== 'paid')
    .reduce((sum, inv) => sum + inv.amount, 0);

  const overdueCount = invoices.filter((inv) => {
    if (!inv.dueDate) return false;
    const due = new Date(inv.dueDate);
    const now = new Date();
    return due < now && (inv.status ?? 'draft') !== 'paid';
  }).length;

  return (
    <div className="space-y-8">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Invoices</h1>
          <p className="text-sm text-gray-500">
            Estate ID: {params.estateId}
          </p>
        </div>
      </header>

      {/* Estate invoice summary */}
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-gray-500">
            Total Invoiced
          </p>
          <p className="mt-1 text-xl font-semibold">
            ${totalAmount.toFixed(2)}
          </p>
        </div>
        <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-gray-500">
            Outstanding
          </p>
          <p className="mt-1 text-xl font-semibold">
            ${unpaidTotal.toFixed(2)}
          </p>
        </div>
        <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-gray-500">
            Overdue
          </p>
          <p className="mt-1 text-xl font-semibold">
            {overdueCount}
          </p>
        </div>
      </section>

      <CreateInvoiceForm estateId={params.estateId} />

      <section className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Existing Invoices</h2>

        {invoices.length === 0 ? (
          <p className="text-sm text-gray-500">No invoices yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-gray-500">
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Issue Date</th>
                  <th className="px-3 py-2">Due Date</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv._id} className="border-b last:border-0">
                    <td className="px-3 py-2 align-top">
                      <Link
                        href={`/app/estates/${params.estateId}/invoices/${inv._id}`}
                        className="text-sm font-medium text-blue-600 hover:underline"
                      >
                        {inv.description}
                      </Link>
                    </td>
                    <td className="px-3 py-2 align-top">
                      ${inv.amount.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {inv.issueDate
                        ? new Date(inv.issueDate).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {inv.dueDate
                        ? new Date(inv.dueDate).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <InvoiceStatusButtons
                        invoiceId={inv._id}
                        initialStatus={inv.status ?? 'draft'}
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex justify-end gap-2 text-xs">
                        <Link
                          href={`/app/estates/${params.estateId}/invoices/${inv._id}`}
                          className="text-blue-600 hover:underline"
                        >
                          View
                        </Link>
                        <Link
                          href={`/app/estates/${params.estateId}/invoices/${inv._id}/edit`}
                          className="text-blue-600 hover:underline"
                        >
                          Edit
                        </Link>
                        <Link
                          href={`/app/estates/${params.estateId}/invoices/${inv._id}/print`}
                          className="text-blue-600 hover:underline"
                        >
                          Print
                        </Link>
                      </div>
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