type EstateDocLean = {
  displayName?: string;
  caseName?: string;
  caseNumber?: string;
};
import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";

type PageProps = {
  params: Promise<{
    estateId: string;
  }>;
};

export const metadata = {
  title: "New Invoice | LegatePro",
};

export default async function NewEstateInvoicePage({ params }: PageProps) {
  const { estateId } = await params;

  if (!estateId || estateId === "undefined") {
    redirect("/app/estates");
  }

  const session = await getServerSession(authOptions);

  if (!session || !session.user?.id) {
    redirect("/login");
  }

  await connectToDatabase();

  const estateDoc = (await Estate.findOne({
    _id: estateId,
    ownerId: session.user.id,
  })
    .select("displayName caseName caseNumber")
    .lean()) as EstateDocLean | null;

  if (!estateDoc) {
    redirect("/app/estates");
  }

  const estateLabel =
    estateDoc.displayName || estateDoc.caseName || "Unnamed estate";

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">
            New invoice
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Estate:{" "}
            <span className="font-medium text-slate-100">{estateLabel}</span>
            {estateDoc.caseNumber && (
              <span className="text-slate-500">
                {" "}
                · Case #{estateDoc.caseNumber}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/app/estates/${estateId}/invoices`}
            className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900/40 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-800/60"
          >
            Back to invoices
          </Link>
          <Link
            href={`/app/estates/${estateId}`}
            className="inline-flex items-center rounded-md border border-slate-800 bg-slate-900/40 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-800"
          >
            Estate overview
          </Link>
        </div>
      </header>

      <section className="border border-slate-800 rounded-lg bg-slate-900/40 p-6">
        <p className="text-sm text-slate-300 mb-3">
          This is the estate-specific{" "}
          <span className="font-semibold">New Invoice</span> page. The full
          invoice form hasn&apos;t been wired up yet, but the routing is now
          correct and no longer loops between pages.
        </p>
        <p className="text-sm text-slate-400">
          Next steps (when you&apos;re ready):
        </p>
        <ul className="mt-2 list-disc list-inside text-sm text-slate-400 space-y-1">
          <li>
            Add an invoice creation form component here (line items, time
            entries, expenses, terms, etc.).
          </li>
          <li>
            On submit, POST to your existing <code>/api/invoices</code> route
            and then redirect to the new invoice detail page.
          </li>
          <li>
            Update the estate overview and global invoices index to surface the
            newly created invoice.
          </li>
        </ul>
      </section>
    </div>
  );
}