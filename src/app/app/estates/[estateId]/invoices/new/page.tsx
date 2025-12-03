import React from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { WorkspaceSettings } from "@/models/WorkspaceSettings";

type PageProps = {
  params: Promise<{
    estateId: string;
  }>;
};

export const metadata: Metadata = {
  title: "New Invoice | LegatePro",
};

export default async function EstateNewInvoicePage({ params }: PageProps) {
  const { estateId } = await params;

  const session = await getServerSession(authOptions);

  let currencyLabel = "USD";
  let defaultRateLabel: string | null = null;
  let defaultTermsLabel: string | null = null;

  if (session?.user?.id) {
    await connectToDatabase();

    const settings = await WorkspaceSettings.findOne({
      ownerId: session.user.id,
    })
      .lean()
      .catch(() => null as unknown as null);

    if (
      settings &&
      typeof settings.defaultCurrency === "string" &&
      settings.defaultCurrency.trim().length > 0
    ) {
      currencyLabel = settings.defaultCurrency.trim().toUpperCase();
    }

    if (
      settings &&
      typeof settings.defaultHourlyRateCents === "number" &&
      settings.defaultHourlyRateCents > 0
    ) {
      defaultRateLabel = `${currencyLabel} ${(
        settings.defaultHourlyRateCents / 100
      ).toFixed(2)}/hr`;
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
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-slate-500">
          Invoices
        </p>
        <h1 className="text-2xl font-semibold text-slate-100">
          New invoice for estate
        </h1>
        <p className="text-sm text-slate-400">
          Create a simple invoice tied to this estate. You can refine the billing
          model and line items later as LegatePro evolves.
        </p>
      </header>

      <form
        action="/api/invoices"
        method="POST"
        className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/60 p-4"
      >
        <input type="hidden" name="estateId" value={estateId} />

        <div className="flex flex-col gap-1">
          <label
            htmlFor="amount"
            className="text-xs font-medium text-slate-300"
          >
            Amount
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            step="0.01"
            min="0"
            required
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
            placeholder={`e.g. 500.00 (${currencyLabel})`}
          />
          <p className="text-[11px] text-slate-500">
            The total amount to bill on this invoice, in {currencyLabel}. Line
            items will be inferred from this value for now.
            {defaultRateLabel && (
              <>
                {" "}
                Your workspace default hourly rate is {defaultRateLabel}.
              </>
            )}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="issueDate"
              className="text-xs font-medium text-slate-300"
            >
              Issue date
            </label>
            <input
              id="issueDate"
              name="issueDate"
              type="date"
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="dueDate"
              className="text-xs font-medium text-slate-300"
            >
              Due date
            </label>
            <input
              id="dueDate"
              name="dueDate"
              type="date"
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              {defaultTermsLabel
                ? `If left blank, your workspace invoice terms (${defaultTermsLabel}) will be applied automatically.`
                : "If left blank, your workspace invoice terms (e.g., NET 30) will be applied automatically."}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="status"
            className="text-xs font-medium text-slate-300"
          >
            Initial status
          </label>
          <select
            id="status"
            name="status"
            defaultValue="DRAFT"
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option value="DRAFT">Draft</option>
            <option value="SENT">Sent</option>
            <option value="PAID">Paid</option>
            <option value="VOID">Void</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="notes"
            className="text-xs font-medium text-slate-300"
          >
            Memo / description
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={4}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
            placeholder="Describe the work performed, services rendered, or the purpose of this invoice."
          />
          <p className="text-[11px] text-slate-500">
            This will appear on the invoice and in summaries so you can quickly
            recognize what was billed.
          </p>
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
          <Link
            href={`/app/estates/${estateId}/invoices`}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            ← Back to invoices
          </Link>
          <button
            type="submit"
            className="inline-flex items-center rounded-md bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
          >
            Create invoice
          </button>
        </div>
      </form>
    </div>
  );
}