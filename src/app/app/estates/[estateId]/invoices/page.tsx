// src/app/app/estates/[estateId]/invoices/page.tsx
import Link from "next/link";
import { headers } from "next/headers";

import CreateInvoiceForm from "./CreateInvoiceForm";
import InvoiceStatusButtons from "./InvoiceStatusButtons";

import { requireEstateAccess } from "@/lib/estateAccess";

type PageProps = {
  params: Promise<{ estateId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type InvoiceLean = {
  _id: string;
  description: string;
  amount: number;
  issueDate: string;
  dueDate?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
};

// --- Invoice status helpers ---
function normalizeStatus(status?: string): string {
  return (status ?? "draft").toLowerCase();
}

function formatStatusLabel(status?: string): string {
  return normalizeStatus(status).replace(/_/g, " ");
}

function statusPillClasses(status?: string): string {
  const s = normalizeStatus(status);
  if (s === "paid") return "bg-emerald-500/15 text-emerald-200 border-emerald-500/30";
  if (s === "void") return "bg-slate-500/15 text-slate-200 border-slate-500/30";
  if (s === "overdue") return "bg-rose-500/15 text-rose-200 border-rose-500/30";
  if (s === "sent") return "bg-blue-500/15 text-blue-200 border-blue-500/30";
  if (s === "scheduled") return "bg-amber-500/15 text-amber-200 border-amber-500/30";
  return "bg-slate-500/15 text-slate-200 border-slate-500/30";
}

function isOverdue(inv: { dueDate?: string; status?: string }): boolean {
  const s = normalizeStatus(inv.status);
  if (s === "paid" || s === "void") return false;
  if (!inv.dueDate) return false;
  const due = new Date(inv.dueDate);
  if (Number.isNaN(due.getTime())) return false;

  // Compare by day (ignore time) so an invoice isn't marked overdue mid-day due to timezone/time.
  const now = new Date();
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return dueDay < nowDay;
}

function isLockedStatus(status?: string): boolean {
  const s = normalizeStatus(status);
  return s === "paid" || s === "void";
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function toDateLabel(d?: string): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString();
}

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

  // IMPORTANT: When a Server Component calls an internal API route, it does NOT
  // automatically forward auth cookies. If the API route uses `auth()`, we must
  // forward the cookie header or the request may 401 and the UI will look empty.
  const h = await headers();
  const cookie = h.get("cookie") ?? "";

  const res = await fetch(`${baseUrl}/api/estates/${estateId}/invoices`, {
    cache: "no-store",
    headers: cookie ? { cookie } : undefined,
  });

  if (!res.ok) {
    return [];
  }

  return (await res.json()) as InvoiceLean[];
}

export default async function InvoicesPage({ params, searchParams }: PageProps) {
  const { estateId } = await params;
  // Access control (redirects / throws inside helper as appropriate)
  const access = await requireEstateAccess({ estateId });
  const role = access.role;
  const canEdit = role !== "VIEWER";
  const canWrite = canEdit;

  // --- GET filters from searchParams
  let searchQuery = "";
  let statusFilter = "";
  let overdueOnly = false;
  if (searchParams) {
    const sp = await searchParams;
    if (sp?.q && typeof sp.q === "string") searchQuery = sp.q.trim();
    if (sp?.status && typeof sp.status === "string") statusFilter = sp.status.toLowerCase();
    if (sp?.overdue && (sp.overdue === "1" || sp.overdue === "true")) overdueOnly = true;
  }

  const invoices = await getInvoices(estateId);
  // computedInvoices: derive status "overdue" if dueDate passed and not paid/void
  const computedInvoices = invoices.map((inv) => {
    const locked = isLockedStatus(inv.status);
    const overdue = !locked && isOverdue(inv);
    return {
      ...inv,
      status: overdue ? "overdue" : inv.status,
    };
  });
  computedInvoices.sort((a, b) => {
    const aKey = a.issueDate || a.createdAt || "";
    const bKey = b.issueDate || b.createdAt || "";
    const aTime = new Date(aKey).getTime();
    const bTime = new Date(bKey).getTime();
    if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
    if (Number.isNaN(aTime)) return 1;
    if (Number.isNaN(bTime)) return -1;
    return bTime - aTime;
  });

  // Filtering
  let filteredInvoices = computedInvoices;
  if (statusFilter && statusFilter !== "all") {
    filteredInvoices = filteredInvoices.filter(
      (inv) => normalizeStatus(inv.status) === statusFilter
    );
  }
  if (overdueOnly) {
    filteredInvoices = filteredInvoices.filter((inv) => normalizeStatus(inv.status) === "overdue");
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filteredInvoices = filteredInvoices.filter((inv) =>
      inv.description.toLowerCase().includes(q)
    );
  }

  // Summary stats
  const totalAmount = computedInvoices.reduce((sum, inv) => sum + inv.amount, 0);
  const unpaidTotal = computedInvoices
    .filter((inv) => normalizeStatus(inv.status) !== "paid")
    .reduce((sum, inv) => sum + inv.amount, 0);
  const overdueCount = computedInvoices.filter((inv) => normalizeStatus(inv.status) === "overdue").length;
  const paidCount = computedInvoices.filter((inv) => normalizeStatus(inv.status) === "paid").length;

  // Any filters active?
  const anyFilters = !!(
    searchQuery ||
    (statusFilter && statusFilter !== "all") ||
    overdueOnly
  );

  // Filter form action URL
  const filterAction = `/app/estates/${estateId}/invoices`;

  return (
    <div className="space-y-6 p-6">
      {/* Breadcrumb nav/header */}
      <header className="flex flex-col gap-3 md:flex-row md:items-baseline md:justify-between">
        <div>
          <nav className="mb-1 flex items-center gap-2 text-xs text-slate-400">
            <Link href="/app/estates" className="hover:underline text-slate-400">Estates</Link>
            <span className="mx-1">/</span>
            <Link href={`/app/estates/${estateId}`} className="hover:underline text-slate-400">
              {estateId}
            </Link>
            <span className="mx-1">/</span>
            <span className="text-slate-500">Invoices</span>
          </nav>
          <h1 className="text-2xl font-semibold text-slate-50">Invoices</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950/80 px-2 py-0.5 text-[11px] font-semibold uppercase text-slate-300">
            Role: {role}
          </span>
          {!canEdit && (
            <Link
              href={`/app/estates/${estateId}?requestAccess=1`}
              className="text-xs text-rose-400 hover:underline"
            >
              Request edit access
            </Link>
          )}
        </div>
      </header>

      {/* Summary strip */}
      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="text-xs font-medium uppercase text-slate-400">Total Invoiced</p>
          <p className="mt-1 text-xl font-semibold text-slate-50">{formatMoney(totalAmount)}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="text-xs font-medium uppercase text-slate-400">Outstanding</p>
          <p className="mt-1 text-xl font-semibold text-slate-50">{formatMoney(unpaidTotal)}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="text-xs font-medium uppercase text-slate-400">Overdue</p>
          <p className="mt-1 text-xl font-semibold text-rose-300">{overdueCount}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="text-xs font-medium uppercase text-slate-400">Paid</p>
          <p className="mt-1 text-xl font-semibold text-emerald-300">{paidCount}</p>
        </div>
      </section>

      {/* Create/readonly info */}
      {canEdit ? (
        <CreateInvoiceForm estateId={estateId} />
      ) : (
        <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="text-sm text-slate-400">
            You have <span className="font-semibold text-slate-200">view-only</span> access. You can review invoices, but creating or editing invoices
            requires edit permissions from the estate owner.
          </p>
        </section>
      )}

      {/* Invoices list section */}
      <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-50">Existing Invoices</h2>
            {computedInvoices.length > 0 && (
              <span className="rounded-full border border-slate-800 bg-slate-950/60 px-2 py-0.5 text-xs text-slate-400">
                {filteredInvoices.length} / {computedInvoices.length}
              </span>
            )}
          </div>
          {computedInvoices.length > 0 && (
            <form
              action={filterAction}
              method="get"
              className="flex flex-col gap-2 md:flex-row md:items-end md:gap-3"
            >
              <input
                type="text"
                name="q"
                placeholder="Search description…"
                defaultValue={searchQuery}
                className="rounded-md border border-slate-700 bg-slate-900/70 px-2 py-1 text-slate-100 placeholder:text-slate-500 text-sm"
                autoComplete="off"
              />
              <select
                name="status"
                defaultValue={statusFilter || "all"}
                className="rounded-md border border-slate-700 bg-slate-900/70 px-2 py-1 text-slate-100 text-sm"
              >
                <option value="all">All statuses</option>
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="scheduled">Scheduled</option>
                <option value="paid">Paid</option>
                <option value="void">Void</option>
                <option value="overdue">Overdue</option>
              </select>
              <label className="inline-flex items-center gap-1 text-xs text-slate-400">
                <input
                  type="checkbox"
                  name="overdue"
                  value="1"
                  defaultChecked={overdueOnly}
                  className="accent-rose-500"
                />
                Overdue only
              </label>
              {anyFilters && (
                <Link
                  href={filterAction}
                  className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-transparent px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-slate-900/40 whitespace-nowrap"
                >
                  Clear
                </Link>
              )}
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-md border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-sm font-medium text-slate-100 hover:bg-slate-900"
              >
                Apply
              </button>
            </form>
          )}
        </div>

        {/* Empty state: no invoices */}
        {computedInvoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="mb-3 h-16 w-16 rounded-full border-2 border-dashed border-slate-700 flex items-center justify-center">
              <svg width="36" height="36" viewBox="0 0 24 24" className="text-slate-700">
                <path fill="currentColor" d="M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.83a2 2 0 0 0-.59-1.41l-4.83-4.83A2 2 0 0 0 13.17 1H6zm0 2h7v5a2 2 0 0 0 2 2h5v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4zm9 0.41L19.59 7H16a1 1 0 0 1-1-1V2.41z"/>
              </svg>
            </div>
            <div className="text-slate-400 text-sm">No invoices yet.</div>
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10">
            <div className="mb-2 text-rose-400">No invoices match your filters.</div>
            <Link
              href={filterAction}
              className="text-xs text-blue-400 hover:underline"
            >
              Clear
            </Link>
          </div>
        ) : (
          <>
            {/* Mobile: cards */}
            <div className="flex flex-col gap-4 md:hidden">
              {filteredInvoices.map((inv) => {
                const locked = isLockedStatus(inv.status);
                const overdue = normalizeStatus(inv.status) === "overdue";
                const canEditInvoice = canWrite && !locked;

                return (
                  <div
                    key={inv._id}
                    className={
                      "rounded-xl border bg-slate-950/80 p-4 flex flex-col gap-2 " +
                      (overdue ? "border-rose-500/30" : "border-slate-800")
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Link
                          href={`/app/estates/${estateId}/invoices/${inv._id}`}
                          className="text-base font-semibold text-blue-300 hover:underline"
                        >
                          {inv.description}
                        </Link>
                        <div className="text-slate-400 text-xs mt-0.5">
                          Issued: {toDateLabel(inv.issueDate)} &nbsp;|&nbsp; Due: {toDateLabel(inv.dueDate)}
                        </div>
                      </div>
                      <div className="text-lg font-bold text-slate-100 shrink-0">{formatMoney(inv.amount)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {canWrite && !locked ? (
                        <InvoiceStatusButtons invoiceId={inv._id} initialStatus={inv.status ?? "draft"} />
                      ) : (
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase ${statusPillClasses(inv.status)}`}
                        >
                          {formatStatusLabel(inv.status)}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-3 mt-2 text-xs">
                      <Link
                        href={`/app/estates/${estateId}/invoices/${inv._id}`}
                        className="text-blue-400 hover:underline"
                      >
                        View
                      </Link>
                      {canEditInvoice ? (
                        <Link
                          href={`/app/estates/${estateId}/invoices/${inv._id}/edit`}
                          className="text-blue-400 hover:underline"
                        >
                          Edit
                        </Link>
                      ) : (
                        <span className="cursor-not-allowed text-slate-500">Edit</span>
                      )}
                      <Link
                        href={`/app/estates/${estateId}/invoices/${inv._id}/print`}
                        className="text-blue-400 hover:underline"
                      >
                        Print
                      </Link>
                    </div>
                    {locked && (
                      <p className="mt-1 text-[11px] text-slate-500">
                        This invoice is locked because it is {normalizeStatus(inv.status)}.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Desktop: table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-xs uppercase text-slate-400">
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2">Amount</th>
                    <th className="px-3 py-2">Issue Date</th>
                    <th className="px-3 py-2">Due Date</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.map((inv) => {
                    const locked = isLockedStatus(inv.status);
                    const overdue = normalizeStatus(inv.status) === "overdue";
                    const canEditInvoice = canWrite && !locked;

                    return (
                      <tr
                        key={inv._id}
                        className={
                          "border-b last:border-0 " +
                          (overdue ? "border-rose-500/20" : "border-slate-800")
                        }
                      >
                        <td className="px-3 py-2 align-top">
                          <Link
                            href={`/app/estates/${estateId}/invoices/${inv._id}`}
                            className="text-slate-100 hover:underline font-medium"
                          >
                            {inv.description}
                          </Link>
                        </td>
                        <td className="px-3 py-2 align-top text-slate-200">{formatMoney(inv.amount)}</td>
                        <td className="px-3 py-2 align-top text-slate-400">{toDateLabel(inv.issueDate)}</td>
                        <td className="px-3 py-2 align-top text-slate-400">{toDateLabel(inv.dueDate)}</td>
                        <td className="px-3 py-2 align-top">
                          {canWrite && !locked ? (
                            <InvoiceStatusButtons invoiceId={inv._id} initialStatus={inv.status ?? "draft"} />
                          ) : (
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase ${statusPillClasses(inv.status)}`}
                            >
                              {formatStatusLabel(inv.status)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="flex justify-end gap-2 text-xs">
                            <Link
                              href={`/app/estates/${estateId}/invoices/${inv._id}`}
                              className="text-blue-400 hover:underline"
                            >
                              View
                            </Link>
                            {canEditInvoice ? (
                              <Link
                                href={`/app/estates/${estateId}/invoices/${inv._id}/edit`}
                                className="text-blue-400 hover:underline"
                              >
                                Edit
                              </Link>
                            ) : (
                              <span className="cursor-not-allowed text-slate-500">Edit</span>
                            )}
                            <Link
                              href={`/app/estates/${estateId}/invoices/${inv._id}/print`}
                              className="text-blue-400 hover:underline"
                            >
                              Print
                            </Link>
                          </div>
                          {locked && (
                            <span className="ml-2 inline-flex items-center rounded-full border border-slate-700 bg-slate-900/60 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-400">
                              Locked
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}