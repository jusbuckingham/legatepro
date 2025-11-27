import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";
import { Invoice } from "@/models/Invoice";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";

type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "VOID";
type InvoiceStatusFilter = "ALL" | InvoiceStatus;

type PageProps = {
  params: Promise<{ estateId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

type InvoiceLean = {
  _id: string;
  estateId: string;
  ownerId: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  issueDate?: Date;
  dueDate?: Date;
  subtotal?: number;
  taxAmount?: number;
  totalAmount?: number;
  balanceDue?: number;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

function formatCurrency(value: number | undefined | null): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "$0.00";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value?: Date | string | null): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, "MMM d, yyyy");
}

function statusBadgeClass(status: InvoiceStatus): string {
  switch (status) {
    case "DRAFT":
      return "bg-slate-800/80 text-slate-100 border border-slate-700";
    case "SENT":
      return "bg-blue-500/10 text-blue-300 border border-blue-500/40";
    case "PAID":
      return "bg-emerald-500/10 text-emerald-300 border border-emerald-500/40";
    case "VOID":
      return "bg-red-500/10 text-red-300 border border-red-500/40";
    default:
      return "bg-slate-800/80 text-slate-100 border border-slate-700";
  }
}

export default async function EstateInvoicesPage({
  params,
  searchParams,
}: PageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const { estateId } = await params;
  const resolvedSearchParams = await searchParams;

  await connectToDatabase();

  const estate = await Estate.findOne({
    _id: estateId,
    ownerId: session.user.id,
  }).lean();

  if (!estate) {
    notFound();
  }

  const statusFilterParam =
    typeof resolvedSearchParams?.status === "string"
      ? resolvedSearchParams.status.toUpperCase()
      : "ALL";

  const statusFilter: InvoiceStatusFilter =
    statusFilterParam === "DRAFT" ||
    statusFilterParam === "SENT" ||
    statusFilterParam === "PAID" ||
    statusFilterParam === "VOID"
      ? (statusFilterParam as InvoiceStatus)
      : "ALL";

  const sortParam =
    (resolvedSearchParams?.sort as string | undefined) || "issueDateDesc";

  const query: Record<string, unknown> = {
    estateId,
    ownerId: session.user.id,
  };

  if (statusFilter !== "ALL") {
    query.status = statusFilter;
  }

  const rawInvoices = (await Invoice.find(query)
    .sort({ issueDate: -1, createdAt: -1 })
    .lean()) as unknown as InvoiceLean[];

  const invoices = [...rawInvoices].sort((a, b) => {
    const aIssue = a.issueDate ? new Date(a.issueDate).getTime() : 0;
    const bIssue = b.issueDate ? new Date(b.issueDate).getTime() : 0;
    const aDue = a.dueDate ? new Date(a.dueDate).getTime() : 0;
    const bDue = b.dueDate ? new Date(b.dueDate).getTime() : 0;
    const aTotal = a.totalAmount ?? 0;
    const bTotal = b.totalAmount ?? 0;

    switch (sortParam) {
      case "issueDateAsc":
        return aIssue - bIssue;
      case "dueDateAsc":
        return aDue - bDue;
      case "dueDateDesc":
        return bDue - aDue;
      case "amountAsc":
        return aTotal - bTotal;
      case "amountDesc":
        return bTotal - aTotal;
      case "issueDateDesc":
      default:
        return bIssue - aIssue;
    }
  });

  const totalCount = invoices.length;
  const totalDraft = invoices.filter((i) => i.status === "DRAFT").length;
  const totalSent = invoices.filter((i) => i.status === "SENT").length;
  const totalPaid = invoices.filter((i) => i.status === "PAID").length;
  const totalVoid = invoices.filter((i) => i.status === "VOID").length;

  const totalBilled = invoices.reduce(
    (sum, i) => sum + (i.totalAmount ?? 0),
    0
  );
  const totalOutstanding = invoices
    .filter((i) => i.status !== "VOID")
    .reduce((sum, i) => sum + (i.balanceDue ?? 0), 0);

  const estateDisplayName =
    // @ts-expect-error – displayName is in the schema, TS doesn’t know
    (estate.displayName as string | undefined) ||
    // @ts-expect-error – caseName is in the schema
    (estate.caseName as string | undefined) ||
    String(estate._id);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
            Estate Invoices
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-50">
            {estateDisplayName}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Generate and track invoices based on time &amp; expenses for this
            estate.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/app/estates/${estateId}/invoices/new`}
            className="inline-flex items-center rounded-full bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-900 shadow-sm hover:bg-emerald-400"
          >
            + New invoice
          </Link>
          <Link
            href={`/app/estates/${estateId}/time`}
            className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/60 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800/80"
          >
            View time entries
          </Link>
        </div>
      </div>

      {/* Analytics cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
            Total invoices
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-50">
            {totalCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Draft {totalDraft} · Sent {totalSent} · Paid {totalPaid}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
            Total billed
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-50">
            {formatCurrency(totalBilled)}
          </p>
          <p className="mt-1 text-xs text-slate-500">All statuses</p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
            Outstanding
          </p>
          <p className="mt-2 text-2xl font-semibold text-amber-300">
            {formatCurrency(totalOutstanding)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Excludes voided invoices
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
            Status mix
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-full bg-slate-800/70 px-2 py-1 text-slate-200">
              Draft {totalDraft}
            </span>
            <span className="rounded-full bg-blue-500/10 px-2 py-1 text-blue-300">
              Sent {totalSent}
            </span>
            <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-emerald-300">
              Paid {totalPaid}
            </span>
            <span className="rounded-full bg-red-500/10 px-2 py-1 text-red-300">
              Void {totalVoid}
            </span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400">Status:</span>
          {["ALL", "DRAFT", "SENT", "PAID", "VOID"].map((status) => {
            const isActive = statusFilter === status;
            const search = new URLSearchParams(
              resolvedSearchParams as Record<string, string>
            );
            if (status === "ALL") {
              search.delete("status");
            } else {
              search.set("status", status);
            }
            const href = `/app/estates/${estateId}/invoices?${search.toString()}`;

            return (
              <Link
                key={status}
                href={href}
                className={`rounded-full px-3 py-1 ${
                  isActive
                    ? "bg-slate-50 text-slate-900"
                    : "bg-slate-900/80 text-slate-300 hover:bg-slate-800"
                }`}
              >
                {status === "ALL" ? "All" : status}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400">Sort:</span>
          {[
            { id: "issueDateDesc", label: "Issue ↓" },
            { id: "issueDateAsc", label: "Issue ↑" },
            { id: "dueDateAsc", label: "Due ↑" },
            { id: "dueDateDesc", label: "Due ↓" },
            { id: "amountDesc", label: "Amount ↓" },
            { id: "amountAsc", label: "Amount ↑" },
          ].map((opt) => {
            const isActive = sortParam === opt.id;
            const search = new URLSearchParams(
              resolvedSearchParams as Record<string, string>
            );
            search.set("sort", opt.id);
            const href = `/app/estates/${estateId}/invoices?${search.toString()}`;

            return (
              <Link
                key={opt.id}
                href={href}
                className={`rounded-full px-3 py-1 ${
                  isActive
                    ? "bg-slate-50 text-slate-900"
                    : "bg-slate-900/80 text-slate-300 hover:bg-slate-800"
                }`}
              >
                {opt.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/80">
        <table className="min-w-full divide-y divide-slate-800">
          <thead className="bg-slate-950/80">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                Invoice
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                Issue date
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                Due date
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                Total
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                Balance
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                Status
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {invoices.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-sm text-slate-500"
                >
                  No invoices yet. Start by creating one from time entries and
                  expenses.
                </td>
              </tr>
            ) : (
              invoices.map((invoice) => (
                <tr key={invoice._id} className="hover:bg-slate-900/60">
                  <td className="px-4 py-3 text-sm text-slate-100">
                    <div className="flex flex-col">
                      <Link
                        href={`/app/estates/${estateId}/invoices/${invoice._id}`}
                        className="font-medium text-slate-50 hover:text-emerald-300"
                      >
                        {invoice.invoiceNumber || "Draft invoice"}
                      </Link>
                      {invoice.notes && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">
                          {invoice.notes}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-200">
                    {formatDate(invoice.issueDate)}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-200">
                    {formatDate(invoice.dueDate)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-100">
                    {formatCurrency(invoice.totalAmount)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-amber-200">
                    {formatCurrency(invoice.balanceDue)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusBadgeClass(
                        invoice.status
                      )}`}
                    >
                      {invoice.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/app/estates/${estateId}/invoices/${invoice._id}`}
                        className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-900"
                      >
                        View
                      </Link>
                      <Link
                        href={`/app/estates/${estateId}/invoices/${invoice._id}/edit`}
                        className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-900"
                      >
                        Edit
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}