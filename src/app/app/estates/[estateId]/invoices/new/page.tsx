import React from "react";
import Link from "next/link";

type PageProps = {
  params: Promise<{
    estateId: string;
  }>;
};

export const metadata = {
  title: "New Invoice | LegatePro",
};

export default async function EstateNewInvoicePage({ params }: PageProps) {
  const { estateId } = await params;

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
            placeholder="e.g. 500.00"
          />
          <p className="text-[11px] text-slate-500">
            The total amount to bill on this invoice. Line items will be inferred
            from this value for now.
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