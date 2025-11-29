import React from "react";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Invoice } from "@/models/Invoice";
import { Estate } from "@/models/Estate";
import { format, isAfter, subDays, startOfYear } from "date-fns";

type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "VOID";

type InvoiceListItem = {
  _id: string;
  estateId: string;
  number?: string;
  status: InvoiceStatus | string;
  issueDate?: string | Date;
  dueDate?: string | Date;
  total?: number;
  balanceDue?: number;
  estate?: {
    _id: string;
    displayName?: string;
    caseName?: string;
  };
};

type InvoiceDocPopulated = InvoiceListItem & {
  estateId?:
    | string
    | {
        _id?: string;
        displayName?: string;
        caseName?: string;
      };
  estate?: {
    _id?: string;
    displayName?: string;
    caseName?: string;
  };
};

type PageSearchParams =
  | Record<string, string | string[] | undefined>
  | Promise<Record<string, string | string[] | undefined>>;

type PageProps = {
  searchParams?: PageSearchParams;
};

type StatusFilter = "ALL" | InvoiceStatus;
type PeriodFilter = "all" | "30d" | "90d" | "year";

export const metadata = {
  title: "Invoices | LegatePro",
};

export default async function InvoicesPage({ searchParams }: PageProps) {
  const sp = await Promise.resolve(searchParams ?? {});
  const rawStatus =
    typeof sp.status === "string" ? sp.status.toUpperCase() : "ALL";
  const rawPeriod = typeof sp.period === "string" ? sp.period : "all";

  const statusFilter: StatusFilter =
    rawStatus === "DRAFT" ||
    rawStatus === "SENT" ||
    rawStatus === "PAID" ||
    rawStatus === "VOID"
      ? (rawStatus as InvoiceStatus)
      : "ALL";

  const periodFilter: PeriodFilter =
    rawPeriod === "30d" ||
    rawPeriod === "90d" ||
    rawPeriod === "year" ||
    rawPeriod === "all"
      ? rawPeriod
      : "all";

  const session = await getServerSession(authOptions);
  if (!session || !session.user?.id) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12">
        <h1 className="text-2xl font-semibold text-slate-100 mb-4">
          Invoices
        </h1>
        <p className="text-slate-400">
          You must be signed in to view invoices.
        </p>
      </div>
    );
  }

  await connectToDatabase();

  // Fetch invoices for this user, with estate metadata
  const invoiceDocs = (await Invoice.find({
    ownerId: session.user.id,
  })
    .populate({
      path: "estateId",
      select: "displayName caseName",
      model: Estate,
    })
    .sort({ issueDate: -1 })
    .lean()) as unknown as InvoiceDocPopulated[];

  // Normalize data + attach estate info safely
  const invoices: InvoiceListItem[] = invoiceDocs.map((inv) => {
    // estateId may be a string or a populated object depending on Mongoose
    const estatePop =
      typeof inv.estateId === "object" && inv.estateId !== null
        ? inv.estateId
        : inv.estate;

    const estateId =
      typeof inv.estateId === "string"
        ? inv.estateId
        : estatePop && estatePop._id
        ? String(estatePop._id)
        : "";

    return {
      _id: String(inv._id),
      estateId,
      number: inv.number,
      status: inv.status,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      total: inv.total,
      balanceDue: inv.balanceDue,
      estate: estatePop
        ? {
            _id: estateId,
            displayName: estatePop.displayName,
            caseName: estatePop.caseName,
          }
        : undefined,
    };
  });

  const now = new Date();
  let fromDate: Date | null = null;

  if (periodFilter === "30d") {
    fromDate = subDays(now, 30);
  } else if (periodFilter === "90d") {
    fromDate = subDays(now, 90);
  } else if (periodFilter === "year") {
    fromDate = startOfYear(now);
  }

  const filtered = invoices.filter((inv) => {
    if (statusFilter !== "ALL") {
      if (String(inv.status).toUpperCase() !== statusFilter) return false;
    }

    if (fromDate) {
      const issue = inv.issueDate ? new Date(inv.issueDate) : null;
      if (!issue || !isAfter(issue, fromDate)) return false;
    }

    return true;
  });

  // Analytics
  const totalInvoiced = invoices.reduce(
    (sum, inv) => sum + (typeof inv.total === "number" ? inv.total : 0),
    0,
  );
  const totalPaid = invoices
    .filter(
      (inv) =>
        String(inv.status).toUpperCase() === "PAID" &&
        typeof inv.total === "number",
    )
    .reduce((sum, inv) => sum + (inv.total ?? 0), 0);
  const totalOutstanding = invoices
    .filter(
      (inv) =>
        String(inv.status).toUpperCase() !== "VOID" &&
        String(inv.status).toUpperCase() !== "PAID",
    )
    .reduce(
      (sum, inv) =>
        sum +
        (typeof inv.balanceDue === "number"
          ? inv.balanceDue
          : typeof inv.total === "number"
            ? inv.total
            : 0),
      0,
    );

  const countByStatus: Record<InvoiceStatus, number> = {
    DRAFT: 0,
    SENT: 0,
    PAID: 0,
    VOID: 0,
  };

  invoices.forEach((inv) => {
    const s = String(inv.status).toUpperCase() as InvoiceStatus;
    if (s in countByStatus) {
      countByStatus[s] += 1;
    }
  });

  const overdueCount = invoices.filter((inv) => {
    if (
      String(inv.status).toUpperCase() === "PAID" ||
      String(inv.status).toUpperCase() === "VOID"
    ) {
      return false;
    }
    if (!inv.dueDate) return false;
    const due = new Date(inv.dueDate);
    return due < now;
  }).length;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">
            Invoices
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Track all billed work across estates, with totals and quick
            filters.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/app/estates"
            className="inline-flex items-center rounded-md bg-slate-800 px-3 py-2 text-xs font-medium text-slate-100 border border-slate-700 hover:bg-slate-700"
          >
            Back to Estates
          </Link>
        </div>
      </header>

      {/* Summary cards */}
      <section className="grid gap-4 grid-cols-1 md:grid-cols-3">
        <DataCard
          label="Total Invoiced"
          value={formatCurrency(totalInvoiced)}
          subtitle={`${invoices.length} invoice${
            invoices.length === 1 ? "" : "s"
          }`}
        />
        <DataCard
          label="Collected (Paid)"
          value={formatCurrency(totalPaid)}
          subtitle={`${countByStatus.PAID} paid`}
        />
        <DataCard
          label="Outstanding"
          value={formatCurrency(totalOutstanding)}
          subtitle={`${overdueCount} overdue`}
          accent="warning"
        />
      </section>

      {/* Filters */}
      <section className="border border-slate-800 rounded-lg bg-slate-900/40 p-4">
        <form className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col text-xs text-slate-300">
            <label htmlFor="status" className="mb-1">
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={statusFilter}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              <option value="ALL">All</option>
              <option value="DRAFT">Draft</option>
              <option value="SENT">Sent</option>
              <option value="PAID">Paid</option>
              <option value="VOID">Void</option>
            </select>
          </div>

          <div className="flex flex-col text-xs text-slate-300">
            <label htmlFor="period" className="mb-1">
              Time Period
            </label>
            <select
              id="period"
              name="period"
              defaultValue={periodFilter}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              <option value="all">All time</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="year">This year</option>
            </select>
          </div>

          <button
            type="submit"
            className="inline-flex items-center rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
          >
            Apply filters
          </button>
        </form>
      </section>

      {/* Table */}
      <section className="border border-slate-800 rounded-lg overflow-hidden bg-slate-900/40">
        <div className="border-b border-slate-800 px-4 py-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-100">
            Invoices ({filtered.length})
          </h2>
        </div>

        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400">
            No invoices match the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/60">
                  <Th>Invoice</Th>
                  <Th>Estate</Th>
                  <Th className="text-right">Issue Date</Th>
                  <Th className="text-right">Due Date</Th>
                  <Th className="text-center">Status</Th>
                  <Th className="text-right">Total</Th>
                  <Th className="text-right">Balance</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv) => {
                  const issue = inv.issueDate
                    ? format(new Date(inv.issueDate), "MMM d, yyyy")
                    : "—";
                  const due = inv.dueDate
                    ? format(new Date(inv.dueDate), "MMM d, yyyy")
                    : "—";
                  const statusStr = String(inv.status).toUpperCase();
                  const estateLabel =
                    inv.estate?.displayName ||
                    inv.estate?.caseName ||
                    "Unnamed estate";

                  const totalVal =
                    typeof inv.total === "number" ? inv.total : 0;
                  const balanceVal =
                    typeof inv.balanceDue === "number"
                      ? inv.balanceDue
                      : totalVal;

                  const estateHref = inv.estateId
                    ? `/app/estates/${inv.estateId}`
                    : undefined;
                  const invoiceHref =
                    inv.estateId && inv._id
                      ? `/app/estates/${inv.estateId}/invoices/${inv._id}`
                      : "#";

                  return (
                    <tr
                      key={inv._id}
                      className="border-b border-slate-800/70 hover:bg-slate-900/70"
                    >
                      <Td className="font-medium text-slate-100">
                        <Link
                          href={invoiceHref}
                          className="hover:underline"
                        >
                          {inv.number || shortId(inv._id)}
                        </Link>
                      </Td>
                      <Td>
                        {estateHref ? (
                          <Link
                            href={estateHref}
                            className="hover:underline text-slate-200"
                          >
                            {estateLabel}
                          </Link>
                        ) : (
                          <span className="text-slate-300">
                            {estateLabel}
                          </span>
                        )}
                      </Td>
                      <Td className="text-right text-slate-300">
                        {issue}
                      </Td>
                      <Td className="text-right text-slate-300">
                        {due}
                      </Td>
                      <Td className="text-center">
                        <StatusPill status={statusStr as InvoiceStatus} />
                      </Td>
                      <Td className="text-right">
                        {formatCurrency(totalVal)}
                      </Td>
                      <Td className="text-right">
                        {formatCurrency(balanceVal)}
                      </Td>
                      <Td className="text-right">
                        <Link
                          href={invoiceHref}
                          className="text-xs text-sky-400 hover:text-sky-300"
                        >
                          View
                        </Link>
                      </Td>
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

/* ---------- helpers & small components ---------- */

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function shortId(id: string) {
  if (!id) return "—";
  return `#${id.slice(-6).toUpperCase()}`;
}

type DataCardProps = {
  label: string;
  value: string;
  subtitle?: string;
  accent?: "default" | "warning";
};

function DataCard({
  label,
  value,
  subtitle,
  accent = "default",
}: DataCardProps) {
  const accentClasses =
    accent === "warning"
      ? "border-amber-400/60 bg-amber-500/5"
      : "border-slate-800 bg-slate-900/40";

  return (
    <div
      className={`rounded-lg border px-4 py-3 flex flex-col gap-1 ${accentClasses}`}
    >
      <span className="text-[11px] uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <span className="text-lg font-semibold text-slate-50">
        {value}
      </span>
      {subtitle && (
        <span className="text-xs text-slate-500">{subtitle}</span>
      )}
    </div>
  );
}

type ThProps = {
  children?: React.ReactNode;
  className?: string;
};

function Th({ children, className }: ThProps) {
  return (
    <th
      className={`px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400 ${className ?? ""
        }`}
    >
      {children}
    </th>
  );
}

type TdProps = {
  children?: React.ReactNode;
  className?: string;
};

function Td({ children, className }: TdProps) {
  return (
    <td className={`px-3 py-2 align-middle text-xs text-slate-200 ${className ?? ""}`}>
      {children}
    </td>
  );
}

type StatusPillProps = {
  status: InvoiceStatus;
};

function StatusPill({ status }: StatusPillProps) {
  const base =
    "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold";
  let variant = "bg-slate-800 text-slate-200 border border-slate-700";

  if (status === "DRAFT") {
    variant = "bg-slate-800 text-slate-200 border border-slate-700";
  } else if (status === "SENT") {
    variant = "bg-sky-500/15 text-sky-300 border border-sky-600/60";
  } else if (status === "PAID") {
    variant = "bg-emerald-500/15 text-emerald-300 border border-emerald-600/60";
  } else if (status === "VOID") {
    variant = "bg-rose-500/15 text-rose-300 border border-rose-600/60";
  }

  return (
    <span className={`${base} ${variant}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}