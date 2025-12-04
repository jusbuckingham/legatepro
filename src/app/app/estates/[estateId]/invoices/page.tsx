import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";
import { Invoice } from "@/models/Invoice";

type InvoiceStatus = "DRAFT" | "SENT" | "UNPAID" | "PARTIAL" | "PAID" | "VOID";

type PageSearchParams = {
  status?: string;
  q?: string;
  timeframe?: string;
  sortBy?: string;
  invoiceNumber?: string;
};

type PageProps = {
  params: Promise<{
    estateId: string;
  }>;
  searchParams: Promise<PageSearchParams>;
};

type EstateDocLean = {
  _id: string | { toString: () => string };
  displayName?: string;
  caseName?: string;
};

type InvoiceLean = {
  _id: string | { toString: () => string };
  estateId?: string | { toString: () => string } | null | undefined;
  status?: string;
  issueDate?: Date | string;
  dueDate?: Date | string;
  subtotal?: number; // may be dollars (legacy) or cents (new)
  totalAmount?: number; // may be dollars (legacy) or cents (new)
  total?: number; // legacy field
  notes?: string;
  invoiceNumber?: string;
};

type InvoiceListItem = {
  _id: string;
  status: string;
  issueDate?: Date;
  dueDate?: Date;
  total: number; // normalized to dollars
  balanceDue: number; // normalized to dollars
  notes?: string;
  invoiceNumber?: string;
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

function formatDate(value?: Date): string {
  if (!value) return "—";
  try {
    return format(value, "MMM d, yyyy");
  } catch {
    return "—";
  }
}

/**
 * Handle legacy invoices that stored dollars directly AND
 * new invoices that store integer cents.
 */
function normalizeMoneyFromDb(raw?: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  if (raw > 10_000) {
    return raw / 100;
  }
  return raw;
}

function getAmount(inv: InvoiceLean): number {
  const raw =
    typeof inv.totalAmount === "number"
      ? inv.totalAmount
      : typeof inv.total === "number"
      ? inv.total
      : typeof inv.subtotal === "number"
      ? inv.subtotal
      : 0;

  return normalizeMoneyFromDb(raw);
}

function normalizeDate(value?: Date | string): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default async function EstateInvoicesPage({
  params,
  searchParams,
}: PageProps) {
  const { estateId } = await params;
  const {
    status: statusRaw,
    q: qRaw,
    timeframe: timeframeRaw,
    sortBy: sortByRaw,
    invoiceNumber: invoiceNumberRaw,
  } = await searchParams;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  await connectToDatabase();

  const estateDoc = (await Estate.findOne({
    _id: estateId,
    ownerId: session.user.id,
  })
    .select("_id displayName caseName")
    .lean()) as EstateDocLean | null;

  if (!estateDoc) {
    redirect("/app/estates");
  }

  const q = (qRaw ?? "").trim();
  const statusFilter = (statusRaw ?? "ALL").toUpperCase();
  const timeframe = timeframeRaw ?? "all";
  const sortBy = sortByRaw ?? "recent";
  const invoiceNumberFilter = (invoiceNumberRaw ?? "").trim();

  const mongoQuery: { [key: string]: unknown } = {
    ownerId: session.user.id,
    estateId,
  };

  // Status filter
  if (statusFilter === "UNPAID") {
    mongoQuery.status = {
      $in: ["DRAFT", "SENT", "UNPAID", "PARTIAL"],
    };
  } else if (statusFilter !== "ALL") {
    mongoQuery.status = statusFilter as InvoiceStatus;
  }

  // Invoice number filter
  if (invoiceNumberFilter.length > 0) {
    mongoQuery.invoiceNumber = {
      $regex: invoiceNumberFilter,
      $options: "i",
    };
  }

  // Text search (notes + invoiceNumber)
  if (q.length > 0) {
    mongoQuery.$or = [
      { notes: { $regex: q, $options: "i" } },
      { invoiceNumber: { $regex: q, $options: "i" } },
    ];
  }

  // Timeframe filter
  const now = new Date();
  if (timeframe === "30d") {
    const past30 = new Date(now);
    past30.setDate(now.getDate() - 30);
    mongoQuery.issueDate = { $gte: past30 };
  } else if (timeframe === "this-month") {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    mongoQuery.issueDate = { $gte: startOfMonth };
  }

  // Sorting
  const sortOption: Record<string, 1 | -1> = {};
  if (sortBy === "invoice-asc") {
    sortOption.invoiceNumber = 1;
    sortOption.createdAt = -1;
  } else if (sortBy === "invoice-desc") {
    sortOption.invoiceNumber = -1;
    sortOption.createdAt = -1;
  } else {
    sortOption.issueDate = -1;
    sortOption.createdAt = -1;
  }

  const invoiceDocs = (await Invoice.find(mongoQuery)
    .sort(sortOption)
    .lean()) as InvoiceLean[];

  const invoices: InvoiceListItem[] = invoiceDocs.map((inv) => {
    const amount = getAmount(inv);
    const statusStr = String(inv.status || "DRAFT").toUpperCase();

    const balanceDue =
      statusStr === "PAID" || statusStr === "VOID" ? 0 : amount;

    return {
      _id:
        typeof inv._id === "string"
          ? inv._id
          : inv._id.toString(),
      status: statusStr,
      issueDate: normalizeDate(inv.issueDate),
      dueDate: normalizeDate(inv.dueDate),
      total: amount,
      balanceDue,
      notes: inv.notes,
      invoiceNumber: inv.invoiceNumber,
    };
  });

  const totalInvoiced = invoices.reduce((sum, inv) => {
    return sum + (inv.status !== "VOID" ? inv.total : 0);
  }, 0);

  const totalCollected = invoices.reduce((sum, inv) => {
    return sum + (inv.status === "PAID" ? inv.total : 0);
  }, 0);

  const totalOutstanding = invoices.reduce((sum, inv) => {
    return (
      sum +
      (inv.status !== "PAID" && inv.status !== "VOID" ? inv.total : 0)
    );
  }, 0);

  const estateIdStr =
    typeof estateDoc._id === "string"
      ? estateDoc._id
      : estateDoc._id.toString();

  const estateLabel =
    estateDoc.displayName ||
    estateDoc.caseName ||
    `Estate …${estateIdStr.slice(-6)}`;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Estate billing
          </p>
          <h1 className="text-2xl font-semibold text-slate-100">
            Invoices for {estateLabel}
          </h1>
          <p className="text-sm text-slate-400">
            View all invoices associated with this estate. Filter by status,
            timeframe, or search by notes and invoice number.
          </p>
          <p className="mt-1 text-xs">
            <Link
              href={`/app/estates/${estateIdStr}`}
              className="text-sky-400 hover:text-sky-300"
            >
              ← Back to estate overview
            </Link>
          </p>
        </div>

        <Link
          href={`/app/estates/${estateIdStr}/invoices/new`}
          className="inline-flex items-center rounded-md bg-sky-500 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-sky-400"
        >
          New invoice
        </Link>
      </header>

      {/* Filters */}
      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <form className="flex flex-wrap items-end gap-3" method="GET">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Search
            </label>
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Notes, invoice number…"
              className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div className="min-w-[140px]">
            <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Invoice #
            </label>
            <input
              type="text"
              name="invoiceNumber"
              defaultValue={invoiceNumberFilter}
              placeholder="e.g. INV-2024-001"
              className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Status
            </label>
            <select
              name="status"
              defaultValue={statusFilter}
              className="mt-1 rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              <option value="ALL">All</option>
              <option value="UNPAID">
                Unpaid (DRAFT/SENT/UNPAID/PARTIAL)
              </option>
              <option value="DRAFT">Draft</option>
              <option value="SENT">Sent</option>
              <option value="PAID">Paid</option>
              <option value="VOID">Void</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Timeframe
            </label>
            <select
              name="timeframe"
              defaultValue={timeframe}
              className="mt-1 rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              <option value="all">All time</option>
              <option value="30d">Last 30 days</option>
              <option value="this-month">This month</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Sort by
            </label>
            <select
              name="sortBy"
              defaultValue={sortBy}
              className="mt-1 rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              <option value="recent">Recent (issue date)</option>
              <option value="invoice-asc">Invoice # (A–Z)</option>
              <option value="invoice-desc">Invoice # (Z–A)</option>
            </select>
          </div>

          <button
            type="submit"
            className="inline-flex items-center rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-white"
          >
            Apply filters
          </button>
        </form>
      </section>

      {/* Summary cards */}
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs font-medium text-slate-400">
            Total invoiced (filtered)
          </p>
          <p className="mt-2 text-xl font-semibold text-slate-50">
            {formatCurrency(totalInvoiced)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            Sum of all non-void invoices matching the current filters.
          </p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs font-medium text-slate-400">
            Collected (PAID)
          </p>
          <p className="mt-2 text-xl font-semibold text-slate-50">
            {formatCurrency(totalCollected)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            Invoices marked PAID in the current view.
          </p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs font-medium text-slate-400">
            Outstanding balance
          </p>
          <p className="mt-2 text-xl font-semibold text-slate-50">
            {formatCurrency(totalOutstanding)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            Total balance due on non-PAID, non-VOID invoices.
          </p>
        </div>
      </section>

      {/* Invoices table */}
      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-100">
            Invoices ({invoices.length})
          </h2>
        </div>

        {invoices.length === 0 ? (
          <p className="text-xs text-slate-500">
            No invoices match the current filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2 pr-4 font-medium">Invoice</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Issue date</th>
                  <th className="py-2 pr-4 font-medium">Due date</th>
                  <th className="py-2 pr-4 font-medium text-right">Total</th>
                  <th className="py-2 pr-4 font-medium text-right">
                    Balance due
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const label =
                    inv.invoiceNumber ??
                    (inv._id ? `…${inv._id.slice(-6)}` : inv._id);

                  const detailLink = `/app/estates/${estateIdStr}/invoices/${inv._id}`;

                  return (
                    <tr
                      key={inv._id}
                      className="border-b border-slate-900 last:border-0"
                    >
                      <td className="py-2 pr-4">
                        <Link
                          href={detailLink}
                          className="text-xs text-sky-400 hover:text-sky-300"
                        >
                          {label}
                        </Link>
                        {inv.notes && (
                          <div className="mt-0.5 max-w-xs truncate text-[11px] text-slate-500">
                            {inv.notes}
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[11px] uppercase tracking-wide text-slate-300">
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-slate-300">
                        {formatDate(inv.issueDate)}
                      </td>
                      <td className="py-2 pr-4 text-slate-300">
                        {formatDate(inv.dueDate)}
                      </td>
                      <td className="py-2 pr-4 text-right text-slate-100">
                        {formatCurrency(inv.total)}
                      </td>
                      <td className="py-2 pr-4 text-right text-slate-100">
                        {formatCurrency(inv.balanceDue)}
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