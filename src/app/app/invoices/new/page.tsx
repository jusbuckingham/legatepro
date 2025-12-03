import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";

import type { Metadata } from "next";

type EstateListItem = {
  _id: string;
  displayName?: string;
  caseName?: string;
  caseNumber?: string;
};

type EstateLean = {
  _id: string | { toString: () => string };
  displayName?: string;
  caseName?: string;
  caseNumber?: string;
};

type PageProps = {
  searchParams?: Promise<{
    estateId?: string;
  }>;
};

export const metadata: Metadata = {
  title: "New Invoice | LegatePro",
};

export default async function GlobalNewInvoicePage({ searchParams }: PageProps) {
  const sp = (await searchParams) || {};
  const preselectedEstateId = sp.estateId;

  const session = await getServerSession(authOptions);

  if (!session || !session.user?.id) {
    redirect("/login");
  }

  await connectToDatabase();

  // Load the estates that belong to this user
  const estatesRaw = (await Estate.find({
    ownerId: session.user.id,
  })
    .select("_id displayName caseName caseNumber")
    .sort({ createdAt: -1 })
    .lean()) as EstateLean[];

  const estates: EstateListItem[] = estatesRaw.map((e) => ({
    _id:
      typeof e._id === "string"
        ? e._id
        : e._id.toString(),
    displayName: e.displayName,
    caseName: e.caseName,
    caseNumber: e.caseNumber,
  }));

  if (preselectedEstateId) {
    // If an estateId is already provided in the query string, jump straight
    // into the estate-specific invoice creation flow.
    return redirect(`/app/estates/${preselectedEstateId}/invoices/new`);
  }

  // If there is exactly one estate, we can skip the picker UX
  if (estates.length === 1) {
    return redirect(`/app/estates/${estates[0]._id}/invoices/new`);
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-slate-500">
          Invoices
        </p>
        <h1 className="text-2xl font-semibold text-slate-100">
          New invoice – choose estate
        </h1>
        <p className="text-sm text-slate-400">
          Start by selecting the estate this invoice belongs to. You&apos;ll then
          be taken to the estate-specific invoice form.
        </p>
      </header>

      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        {estates.length === 0 ? (
          <div className="space-y-2 text-sm text-slate-400">
            <p>You don&apos;t have any estates yet.</p>
            <p>
              Create an estate first, then you&apos;ll be able to generate invoices
              for it.
            </p>
            <div className="mt-3">
              <Link
                href="/app/estates/new"
                className="inline-flex items-center rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
              >
                Create estate
              </Link>
            </div>
          </div>
        ) : (
          <form
            action="/app/invoices/new"
            method="GET"
            className="space-y-4"
          >
            <div className="flex flex-col gap-1">
              <label
                htmlFor="estateId"
                className="text-xs font-medium text-slate-300"
              >
                Estate
              </label>
              <select
                id="estateId"
                name="estateId"
                defaultValue=""
                className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                required
              >
                <option value="" disabled>
                  Select an estate…
                </option>
                {estates.map((estate) => {
                  const label =
                    estate.displayName ||
                    estate.caseName ||
                    `Estate ${estate._id.slice(-6)}`;
                  const extra = estate.caseNumber
                    ? ` · Case #${estate.caseNumber}`
                    : "";
                  return (
                    <option key={estate._id} value={estate._id}>
                      {label}
                      {extra}
                    </option>
                  );
                })}
              </select>
              <p className="text-[11px] text-slate-500">
                Invoices are always tied to a single estate.
              </p>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2">
              <Link
                href="/app/invoices"
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                ← Back to invoices
              </Link>
              <button
                type="submit"
                className="inline-flex items-center rounded-md bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
              >
                Continue to invoice form
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}