import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";
import { Invoice } from "@/models/Invoice";
import { authOptions } from "@/lib/auth";

type URLSearchParamsType = {
  [key: string]: string | string[] | undefined;
};

type PageProps = {
  params: Promise<{
    estateId: string;
  }>;
  searchParams?: URLSearchParamsType;
};

type InvoiceStatus =
  | "DRAFT"
  | "SENT"
  | "PAID"
  | "PARTIAL"
  | "VOID"
  | "UNPAID"
  | string;

type InvoiceDoc = {
  _id: unknown;
  number?: string;
  status?: InvoiceStatus;
  issueDate?: Date | string | null;
  dueDate?: Date | string | null;
  total?: number;
  balanceDue?: number;
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatShortDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export const dynamic = "force-dynamic";

export default async function EstateInvoicesPage({
  params,
  searchParams,
}: PageProps) {
  // ✅ Handle Next 16 async params and guard against undefined estateId
  const { estateId } = await params;

  if (!estateId || estateId === "undefined") {
    redirect("/app/estates");
  }

  const session = await getServerSession(authOptions);
  if (!session || !session.user || !session.user.id) {
    redirect("/login");
  }

  await connectToDatabase();

  // Load the estate to validate access + display header info
  const estate = await Estate.findOne({
    _id: estateId,
    ownerId: session.user.id,
  }).lean();

  if (!estate) {
    redirect("/app/estates");
  }

  // Filters from searchParams (optional)
  const statusFilterRaw =
    typeof searchParams?.status === "string"
      ? searchParams.status.toUpperCase()
      : "ALL";

  const statusFilter: InvoiceStatus | "ALL" =
    statusFilterRaw === "DRAFT" ||
    statusFilterRaw === "SENT" ||
    statusFilterRaw === "PAID" ||
    statusFilterRaw === "PARTIAL" ||
    statusFilterRaw === "VOID" ||
    statusFilterRaw === "UNPAID"
      ? (statusFilterRaw as InvoiceStatus)
      : "ALL";

  const sortRaw =
    typeof searchParams?.sort === "string" ? searchParams.sort : "issueDateDesc";

  const sortOption: "issueDateAsc" | "issueDateDesc" | "dueDateAsc" | "dueDateDesc" =
    sortRaw === "issueDateAsc" ||
    sortRaw === "issueDateDesc" ||
    sortRaw === "dueDateAsc" ||
    sortRaw === "dueDateDesc"
      ? sortRaw
      : "issueDateDesc";

const sortSpec: Record<string, "asc" | "desc"> =
  sortOption === "issueDateAsc"
    ? { issueDate: "asc" }
    : sortOption === "issueDateDesc"
    ? { issueDate: "desc" }
    : sortOption === "dueDateAsc"
    ? { dueDate: "asc" }
    : { dueDate: "desc" };
type EstateForLabel = {
  displayName?: string;
  caseName?: string;
  decedentName?: string;
};

  const query: Record<string, unknown> = {
    estateId,
    ownerId: session.user.id,
  };

  if (statusFilter !== "ALL") {
    query.status = statusFilter;
  }

  const invoiceDocs = (await Invoice.find(query)
    .sort(sortSpec)
    .lean()) as unknown as InvoiceDoc[];

  const invoices = invoiceDocs.map((inv) => ({
    _id: String(inv._id),
    number: inv.number ?? "—",
    status: inv.status ?? "DRAFT",
    issueDate: inv.issueDate ? new Date(inv.issueDate) : null,
    dueDate: inv.dueDate ? new Date(inv.dueDate) : null,
    total: inv.total ?? 0,
    balanceDue: inv.balanceDue ?? inv.total ?? 0,
  }));

  const unpaidInvoices = invoices.filter((inv) => {
    const status = inv.status;
    return (
      status === "SENT" ||
      status === "UNPAID" ||
      status === "PARTIAL"
    );
  });

  const unpaidTotal = unpaidInvoices.reduce(
    (sum, inv) => sum + inv.balanceDue,
    0,
  );

  const overdueCount = unpaidInvoices.filter((inv) => {
    if (!inv.dueDate) return false;
    const today = new Date();
    const due = inv.dueDate;
    return due < today;
  }).length;

const estateForLabel = estate as unknown as EstateForLabel;

const estateLabel =
  estateForLabel.displayName ||
  estateForLabel.caseName ||
  estateForLabel.decedentName ||
  "Estate";

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      {/* Header */}
      <header className="space-y-2 border-b border-slate-800 pb-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-rose-400">
              Estate invoices
            </p>
            <h1 className="text-xl font-semibold text-slate-50 md:text-2xl">
              {estateLabel}
            </h1>
            <p className="text-xs text-slate-400">
              Track billing for this estate — invoices, balances, and due dates.
            </p>
          </div>

          <Link
            href={`/app/estates/${estateId}/invoices/new`}
            className="inline-flex items-center rounded-full border border-rose-500/80 bg-rose-600/20 px-3 py-1.5 text-xs font-medium text-rose-100 shadow-sm shadow-rose-900/40 hover:bg-rose-600/40"
          >
            + New invoice
          </Link>
        </div>

        <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Unpaid total:</span>
            <span className="font-semibold text-rose-200">
              {formatCurrency(unpaidTotal)}
            </span>
          </div>
          {overdueCount > 0 && (
            <div className="inline-flex items-center rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-200">
              {overdueCount} overdue
            </div>
          )}
        </div>
      </header>

      {/* Filters */}
      <section className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap gap-1">
          {["ALL", "SENT", "UNPAID", "PARTIAL", "PAID"].map((status) => {
            const isActive = statusFilter === status;
            const sp = new URLSearchParams(
              searchParams as Record<string, string> | undefined,
            );
            if (status === "ALL") sp.delete("status");
            else sp.set("status", status);
            const href = `/app/estates/${estateId}/invoices?${sp.toString()}`;

            return (
              <Link
                key={status}
                href={href}
                className={
                  isActive
                    ? "rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-900"
                    : "rounded-full border border-slate-700 px-3 py-1 text-slate-300 hover:border-slate-500 hover:text-slate-100"
                }
              >
                {status === "ALL" ? "All" : status.toLowerCase()}
              </Link>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-1">
          {[
            { label: "Issue ↓", val: "issueDateDesc" },
            { label: "Issue ↑", val: "issueDateAsc" },
            { label: "Due ↓", val: "dueDateDesc" },
            { label: "Due ↑", val: "dueDateAsc" },
          ].map((opt) => {
            const isActive = sortOption === opt.val;
            const sp = new URLSearchParams(
              searchParams as Record<string, string> | undefined,
            );
            sp.set("sort", opt.val);
            const href = `/app/estates/${estateId}/invoices?${sp.toString()}`;

            return (
              <Link
                key={opt.val}
                href={href}
                className={
                  isActive
                    ? "rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-900"
                    : "rounded-full border border-slate-700 px-3 py-1 text-slate-300 hover:border-slate-500 hover:text-slate-100"
                }
              >
                {opt.label}
              </Link>
            );
          })}
        </div>
      </section>

      {/* Table */}
      <section className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
        {invoices.length === 0 ? (
          <p className="text-xs text-slate-400">
            No invoices yet for this estate. When you create invoices, they’ll
            appear here with status, due dates, and balances.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-1 text-xs">
              <thead className="text-[11px] uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-2 py-1 text-left font-medium">Invoice</th>
                  <th className="px-2 py-1 text-left font-medium">Status</th>
                  <th className="px-2 py-1 text-right font-medium">Total</th>
                  <th className="px-2 py-1 text-right font-medium">
                    Balance due
                  </th>
                  <th className="px-2 py-1 text-right font-medium">Due</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr
                    key={inv._id}
                    className="rounded-xl bg-slate-900/70 align-middle text-slate-100"
                  >
                    <td className="px-2 py-1.5">
                      <Link
                        href={`/app/estates/${estateId}/invoices/${inv._id}`}
                        className="text-[11px] font-medium text-slate-50 hover:text-rose-200"
                      >
                        #{inv.number}
                      </Link>
                      <div className="text-[10px] text-slate-400">
                        Issued {formatShortDate(inv.issueDate)}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-[11px] text-slate-300">
                      {inv.status}
                    </td>
                    <td className="px-2 py-1.5 text-right text-[11px]">
                      {formatCurrency(inv.total)}
                    </td>
                    <td className="px-2 py-1.5 text-right text-[11px] text-rose-200">
                      {formatCurrency(inv.balanceDue)}
                    </td>
                    <td className="px-2 py-1.5 text-right text-[11px] text-slate-300">
                      {formatShortDate(inv.dueDate)}
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