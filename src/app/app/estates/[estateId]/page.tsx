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

type DashboardInvoice = {
  _id: string;
  description: string;
  amount: number;
  issueDate: string;
  dueDate?: string;
  status?: string;
};

type EstateLean = {
  _id: unknown;
  name?: string | null;
  decedentName?: string | null;
  caseNumber?: string | null;
  referenceId?: string | null;
  courtName?: string | null;
};

type InvoiceLean = {
  _id: unknown;
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

export default async function EstateOverviewPage({ params }: PageProps) {
  const { estateId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  await connectToDatabase();

  const estateDoc = (await Estate.findOne({
    _id: estateId,
    ownerId: session.user.id,
  })
    .lean()
    .exec()) as EstateLean | null;

  if (!estateDoc) {
    notFound();
  }

  const invoiceDocs = (await Invoice.find(
    { estateId, ownerId: session.user.id },
    {
      description: 1,
      status: 1,
      issueDate: 1,
      dueDate: 1,
      subtotal: 1,
      totalAmount: 1,
    },
  )
    .lean()
    .exec()) as InvoiceLean[];

  const invoices: DashboardInvoice[] = invoiceDocs.map((doc) => {
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
        : doc.issueDate ?? "";

    const due =
      doc.dueDate instanceof Date
        ? doc.dueDate.toISOString()
        : doc.dueDate ?? undefined;

    const description =
      typeof doc.description === "string" && doc.description.trim().length > 0
        ? doc.description
        : "Invoice";

    return {
      _id: String(doc._id),
      description,
      amount: amountDollars,
      issueDate: issue,
      dueDate: due,
      status: doc.status ?? undefined,
    };
  });

  const totalInvoiced = invoices.reduce(
    (sum, inv) => sum + (inv.amount ?? 0),
    0,
  );

  const unpaidTotal = invoices
    .filter((inv) => (inv.status ?? "DRAFT").toUpperCase() !== "PAID")
    .reduce((sum, inv) => sum + (inv.amount ?? 0), 0);

  const paidTotal = invoices
    .filter((inv) => (inv.status ?? "DRAFT").toUpperCase() === "PAID")
    .reduce((sum, inv) => sum + (inv.amount ?? 0), 0);

  const overdueCount = invoices.filter((inv) => {
    if (!inv.dueDate) return false;
    const due = new Date(inv.dueDate);
    const now = new Date();
    const statusUpper = (inv.status ?? "DRAFT").toUpperCase();
    return due < now && statusUpper !== "PAID";
  }).length;

  const estateName = estateDoc.name ?? "Estate";
  const decedentName = estateDoc.decedentName ?? null;
  const caseNumber = estateDoc.caseNumber ?? null;
  const referenceId = estateDoc.referenceId ?? null;
  const courtName = estateDoc.courtName ?? null;

  const recentInvoices = [...invoices]
    .sort((a, b) => {
      const aDate = a.issueDate ? new Date(a.issueDate).getTime() : 0;
      const bDate = b.issueDate ? new Date(b.issueDate).getTime() : 0;
      return bDate - aDate;
    })
    .slice(0, 5);

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
          <h1 className="mt-1 text-2xl font-semibold">{estateName}</h1>
          {decedentName && (
            <p className="text-sm text-gray-600">
              Decedent: <span className="font-medium">{decedentName}</span>
            </p>
          )}
          <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-500">
            {caseNumber && (
              <span>
                Case: <span className="font-medium">{caseNumber}</span>
              </span>
            )}
            {referenceId && (
              <span>
                Reference:{" "}
                <span className="font-medium">{referenceId}</span>
              </span>
            )}
            {courtName && (
              <span>
                Court: <span className="font-medium">{courtName}</span>
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <Link
            href={`/app/estates/${estateId}/invoices`}
            className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            View all invoices
          </Link>
        </div>
      </header>

      {/* Financial summary */}
      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-gray-500">
            Total Invoiced
          </p>
          <p className="mt-1 text-xl font-semibold">
            {formatCurrency(totalInvoiced)}
          </p>
        </div>
        <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-gray-500">
            Outstanding
          </p>
          <p className="mt-1 text-xl font-semibold">
            {formatCurrency(unpaidTotal)}
          </p>
        </div>
        <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-gray-500">
            Paid
          </p>
          <p className="mt-1 text-xl font-semibold">
            {formatCurrency(paidTotal)}
          </p>
        </div>
        <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-gray-500">
            Overdue Invoices
          </p>
          <p className="mt-1 text-xl font-semibold">{overdueCount}</p>
        </div>
      </section>

      {/* Recent invoices */}
      <section className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent Invoices</h2>
          <Link
            href={`/app/estates/${estateId}/invoices`}
            className="text-xs font-medium text-blue-600 hover:underline"
          >
            View all
          </Link>
        </div>

        {recentInvoices.length === 0 ? (
          <p className="text-sm text-gray-500">
            No invoices have been created for this estate yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-gray-500">
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Issue Date</th>
                  <th className="px-3 py-2">Due Date</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {recentInvoices.map((inv) => {
                  const statusUpper = (inv.status ?? "DRAFT").toUpperCase();
                  const statusLabel =
                    STATUS_LABELS[statusUpper] ?? inv.status ?? "Unknown";

                  return (
                    <tr key={inv._id} className="border-b last:border-0">
                      <td className="px-3 py-2 align-top">
                        <Link
                          href={`/app/estates/${estateId}/invoices/${inv._id}`}
                          className="text-sm font-medium text-blue-600 hover:underline"
                        >
                          {inv.description}
                        </Link>
                      </td>
                      <td className="px-3 py-2 align-top text-right">
                        {formatCurrency(inv.amount)}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {formatDate(inv.issueDate)}
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