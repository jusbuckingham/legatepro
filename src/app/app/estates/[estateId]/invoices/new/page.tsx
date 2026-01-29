import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import PageHeader from "@/components/layout/PageHeader";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { requireEstateEditAccess } from "@/lib/estateAccess";
import { WorkspaceSettings } from "@/models/WorkspaceSettings";

type PageProps = {
  params: Promise<{
    estateId: string;
  }>;
};

export const metadata: Metadata = {
  title: "New Invoice | LegatePro",
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function EstateNewInvoicePage({ params }: PageProps) {
  const { estateId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/app/estates/${estateId}/invoices/new`)}`);
  }

  await connectToDatabase();

  const access = await requireEstateEditAccess({ estateId, userId: session.user.id });
  const role = access?.role ?? "VIEWER";

  if (role === "VIEWER") {
    redirect(`/app/estates/${estateId}/invoices?forbidden=1`);
  }

  let currencyLabel = "USD";
  let defaultRateLabel: string | null = null;
  let defaultTermsLabel: string | null = null;

  const settings = await WorkspaceSettings.findOne({
    ownerId: session.user.id,
  })
    .lean()
    .catch(() => null);

  if (settings && typeof settings.defaultCurrency === "string" && settings.defaultCurrency.trim().length > 0) {
    currencyLabel = settings.defaultCurrency.trim().toUpperCase();
  }

  if (settings && typeof settings.defaultHourlyRateCents === "number" && settings.defaultHourlyRateCents > 0) {
    defaultRateLabel = `${currencyLabel} ${(settings.defaultHourlyRateCents / 100).toFixed(2)}/hr`;
  }

  if (settings && typeof settings.defaultInvoiceTerms === "string") {
    switch (settings.defaultInvoiceTerms) {
      case "NET_15":
        defaultTermsLabel = "NET 15 (15 days after issue date)";
        break;
      case "NET_30":
        defaultTermsLabel = "NET 30 (30 days after issue date)";
        break;
      case "NET_45":
        defaultTermsLabel = "NET 45 (45 days after issue date)";
        break;
      case "NET_60":
        defaultTermsLabel = "NET 60 (60 days after issue date)";
        break;
      case "DUE_ON_RECEIPT":
        defaultTermsLabel = "Due on receipt (no extra days)";
        break;
      default:
        defaultTermsLabel = null;
    }
  }

  return (
    <div className="space-y-8 p-6">
      <PageHeader
        eyebrow={
          <nav className="text-xs text-slate-500">
            <Link href="/app/estates" className="text-slate-400 hover:text-slate-200 hover:underline">
              Estates
            </Link>
            <span className="mx-1 text-slate-600">/</span>
            <Link
              href={`/app/estates/${estateId}`}
              className="text-slate-400 hover:text-slate-200 hover:underline"
            >
              Overview
            </Link>
            <span className="mx-1 text-slate-600">/</span>
            <Link
              href={`/app/estates/${estateId}/invoices`}
              className="text-slate-400 hover:text-slate-200 hover:underline"
            >
              Invoices
            </Link>
            <span className="mx-1 text-slate-600">/</span>
            <span className="truncate text-rose-200">New</span>
          </nav>
        }
        title="New invoice"
        description="Create a simple invoice tied to this estate. You can refine the billing model and line items later as LegatePro evolves."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-200">
              {role}
            </span>
            <Link
              href={`/app/estates/${estateId}/invoices`}
              className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/60"
            >
              Back to invoices
            </Link>
          </div>
        }
      />

      <form
        action="/api/invoices"
        method="POST"
        className="space-y-6 rounded-xl border border-slate-800 bg-slate-950/40 p-4 sm:p-6"
      >
        <input type="hidden" name="estateId" value={estateId} />

        <div className="space-y-1.5">
          <label htmlFor="amount" className="text-xs font-medium text-slate-200">
            Amount
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            step="0.01"
            min="0"
            required
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-0 ring-emerald-500/0 transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
            placeholder={`e.g. 500.00 (${currencyLabel})`}
          />
          <p className="text-[11px] text-slate-500">
            The total amount to bill on this invoice, in {currencyLabel}. Line items will be inferred from this value for now.
            {defaultRateLabel ? ` Your workspace default hourly rate is ${defaultRateLabel}.` : ""}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="issueDate" className="text-xs font-medium text-slate-200">
              Issue date
            </label>
            <input
              id="issueDate"
              name="issueDate"
              type="date"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-0 ring-emerald-500/0 transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="dueDate" className="text-xs font-medium text-slate-200">
              Due date
            </label>
            <input
              id="dueDate"
              name="dueDate"
              type="date"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-0 ring-emerald-500/0 transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              {defaultTermsLabel
                ? `If left blank, your workspace invoice terms (${defaultTermsLabel}) will be applied automatically.`
                : "If left blank, your workspace invoice terms (e.g., NET 30) will be applied automatically."}
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="status" className="text-xs font-medium text-slate-200">
            Initial status
          </label>
          <select
            id="status"
            name="status"
            defaultValue="DRAFT"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-0 ring-emerald-500/0 transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
          >
            <option value="DRAFT">Draft</option>
            <option value="SENT">Sent</option>
            <option value="PAID">Paid</option>
            <option value="VOID">Void</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="notes" className="text-xs font-medium text-slate-200">
            Memo / description
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={4}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-0 ring-emerald-500/0 transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
            placeholder="Describe the work performed, services rendered, or the purpose of this invoice."
          />
          <p className="text-[11px] text-slate-500">
            This will appear on the invoice and in summaries so you can quickly recognize what was billed.
          </p>
        </div>

        <p className="text-xs text-slate-500">
          Tip: Add clear memos (e.g., “Probate filing fee reimbursement” or “Property maintenance invoice”) so reporting stays painless.
        </p>

        <div className="flex flex-col gap-2 border-t border-slate-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href={`/app/estates/${estateId}/invoices`}
            className="text-xs text-slate-400 hover:text-slate-200 underline-offset-2 hover:underline"
          >
            ← Back to invoices
          </Link>
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-md bg-rose-500 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-950 hover:bg-rose-400"
          >
            Create invoice
          </button>
        </div>
      </form>
    </div>
  );
}