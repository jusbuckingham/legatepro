import React from "react";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";

type EstateListItem = {
  _id: string;
  displayName?: string;
  caseName?: string;
  caseNumber?: string;
};

type EstateDocLean = {
  _id: unknown;
  displayName?: string;
  caseName?: string;
  caseNumber?: string;
};

export const metadata = {
  title: "New Invoice | LegatePro",
};

export default async function NewInvoicePage() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.id) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-2xl font-semibold text-slate-100 mb-4">
          Start a new invoice
        </h1>
        <p className="text-slate-400">
          You must be signed in to create invoices.
        </p>
      </div>
    );
  }

  await connectToDatabase();

  const estateDocs = (await Estate.find({
    ownerId: session.user.id,
  })
    .sort({ createdAt: -1 })
    .lean()) as EstateDocLean[];

  const estates: EstateListItem[] = estateDocs.map((e) => ({
    _id: String(e._id),
    displayName: e.displayName,
    caseName: e.caseName,
    caseNumber: e.caseNumber,
  }));

  const hasEstates = estates.length > 0;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">
            Start a new invoice
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Choose an estate to create a new invoice. You&apos;ll be taken to
            that estate&apos;s invoice form.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/app/invoices"
            className="inline-flex items-center rounded-md bg-slate-800 px-3 py-2 text-xs font-medium text-slate-100 border border-slate-700 hover:bg-slate-700"
          >
            Back to Invoices
          </Link>
          <Link
            href="/app/estates"
            className="inline-flex items-center rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-slate-100 border border-slate-800 hover:bg-slate-800"
          >
            View Estates
          </Link>
        </div>
      </header>

      {!hasEstates ? (
        <section className="border border-slate-800 rounded-lg bg-slate-900/40 p-6">
          <h2 className="text-sm font-medium text-slate-100 mb-2">
            No estates found
          </h2>
          <p className="text-sm text-slate-400 mb-4">
            To create an invoice, you&apos;ll need at least one estate in the
            system.
          </p>
          <Link
            href="/app/estates/new"
            className="inline-flex items-center rounded-md bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-500"
          >
            Create your first estate
          </Link>
        </section>
      ) : (
        <section className="border border-slate-800 rounded-lg overflow-hidden bg-slate-900/40">
          <div className="border-b border-slate-800 px-4 py-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-slate-100">
              Select an estate
            </h2>
            <p className="text-xs text-slate-400">
              {estates.length} estate{estates.length === 1 ? "" : "s"} available
              for invoicing
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/60">
                  <Th>Estate</Th>
                  <Th>Case</Th>
                  <Th>Case #</Th>
                  <Th className="text-right">Action</Th>
                </tr>
              </thead>
              <tbody>
                {estates.map((estate) => {
                  const estateLabel =
                    estate.displayName ||
                    estate.caseName ||
                    "Unnamed estate";

                  return (
                    <tr
                      key={estate._id}
                      className="border-b border-slate-800/70 hover:bg-slate-900/70"
                    >
                      <Td className="font-medium text-slate-100">
                        <Link
                          href={`/app/estates/${estate._id}`}
                          className="hover:underline"
                        >
                          {estateLabel}
                        </Link>
                      </Td>
                      <Td className="text-slate-300">
                        {estate.caseName || "—"}
                      </Td>
                      <Td className="text-slate-300">
                        {estate.caseNumber || "—"}
                      </Td>
                      <Td className="text-right">
                        <Link
                          href={`/app/estates/${estate._id}/invoices/new`}
                          className="inline-flex items-center rounded-md bg-sky-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-sky-500"
                        >
                          Create invoice
                        </Link>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
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
      className={`px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400 ${
        className ?? ""
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
    <td
      className={`px-3 py-2 align-middle text-xs text-slate-200 ${
        className ?? ""
      }`}
    >
      {children}
    </td>
  );
}