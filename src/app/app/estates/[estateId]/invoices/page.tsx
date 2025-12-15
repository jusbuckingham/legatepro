// src/app/app/estates/[estateId]/invoices/page.tsx
import Link from "next/link";
import { headers } from "next/headers";

import CreateInvoiceForm from "./CreateInvoiceForm";
import InvoiceStatusButtons from "./InvoiceStatusButtons";

import { requireEstateAccess } from "@/lib/estateAccess";

type PageProps = {
  params: Promise<{
    estateId: string;
  }>;
};

type InvoiceLean = {
  _id: string;
  description: string;
  amount: number;
  issueDate: string;
  dueDate?: string;
  status?: string;
};

async function getBaseUrl(): Promise<string> {
  // Prefer a configured base URL (useful in prod), otherwise derive from request headers.
  const envBase = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (envBase) return envBase.replace(/\/$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

async function getInvoices(estateId: string): Promise<InvoiceLean[]> {
  const baseUrl = await getBaseUrl();

  const res = await fetch(`${baseUrl}/api/estates/${estateId}/invoices`, {
    cache: "no-store",
  });

  if (!res.ok) {
    // In case of error, just return an empty list so the page still renders
    return [];
  }

  return (await res.json()) as InvoiceLean[];
}

export default async function InvoicesPage({ params }: PageProps) {
  const { estateId } = await params;

  // Access control (redirects / throws inside helper as appropriate)
  const access = await requireEstateAccess({ estateId });
  const role = access.role;
  const canEdit = role !== "VIEWER";

  const invoices = await getInvoices(estateId);

  const totalAmount = invoices.reduce((sum, inv) => sum + inv.amount, 0);

  const unpaidTotal = invoices
    .filter((inv) => (inv.status ?? "draft") !== "paid")
    .reduce((sum, inv) => sum + inv.amount, 0);

  const overdueCount = invoices.filter((inv) => {
    if (!inv.dueDate) return false;
    const due = new Date(inv.dueDate);
    const now = new Date();
    return due < now && (inv.status ?? "draft") !== "paid";
  }).length;

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-3 md:flex-row md:items-baseline md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Invoices</h1>
          <p className="text-sm text-gray-500">Estate ID: {estateId}</p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-semibold uppercase text-gray-700">
            Role: {role}
          </span>
          {!canEdit && (
            <Link
              href={`/app/estates/${estateId}?requestAccess=1`}
              className="text-xs text-blue-600 hover:underline"
            >
              Request edit access
            </Link>
          )}
        </div>
      </header>

      {/* Estate invoice summary */}
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-gray-500">Total Invoiced</p>
          <p className="mt-1 text-xl font-semibold">${totalAmount.toFixed(2)}</p>
        </div>
        <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-gray-500">Outstanding</p>
          <p className="mt-1 text-xl font-semibold">${unpaidTotal.toFixed(2)}</p>
        </div>
        <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-gray-500">Overdue</p>
          <p className="mt-1 text-xl font-semibold">{overdueCount}</p>
        </div>
      </section>

      {canEdit ? (
        <CreateInvoiceForm estateId={estateId} />
      ) : (
        <section className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-600">
            You have <span className="font-semibold">view-only</span> access. You can review invoices, but creating or editing invoices
            requires edit permissions.
          </p>
        </section>
      )}

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
                        href={`/app/estates/${estateId}/invoices/${inv._id}`}
                        className="text-sm font-medium text-blue-600 hover:underline"
                      >
                        {inv.description}
                      </Link>
                    </td>
                    <td className="px-3 py-2 align-top">${inv.amount.toFixed(2)}</td>
                    <td className="px-3 py-2 align-top">
                      {inv.issueDate ? new Date(inv.issueDate).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {canEdit ? (
                        <InvoiceStatusButtons invoiceId={inv._id} initialStatus={inv.status ?? "draft"} />
                      ) : (
                        <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold uppercase text-gray-700">
                          {(inv.status ?? "draft").replace(/_/g, " ")}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex justify-end gap-2 text-xs">
                        <Link
                          href={`/app/estates/${estateId}/invoices/${inv._id}`}
                          className="text-blue-600 hover:underline"
                        >
                          View
                        </Link>

                        {canEdit ? (
                          <Link
                            href={`/app/estates/${estateId}/invoices/${inv._id}/edit`}
                            className="text-blue-600 hover:underline"
                          >
                            Edit
                          </Link>
                        ) : (
                          <span className="cursor-not-allowed text-gray-400">Edit</span>
                        )}

                        <Link
                          href={`/app/estates/${estateId}/invoices/${inv._id}/print`}
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