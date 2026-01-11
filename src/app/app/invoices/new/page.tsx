import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import mongoose from "mongoose";
import { Estate } from "@/models/Estate";

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
  // Next 16: searchParams is now a Promise-like dynamic API
  searchParams?: Promise<{
    estateId?: string;
    created?: string;
  }>;
};

export const metadata: Metadata = {
  title: "New Invoice | LegatePro",
};

export default async function GlobalNewInvoicePage({ searchParams }: PageProps) {
  // Safely unwrap the promised searchParams (or fall back to empty object)
  const sp = (await searchParams) || {};
  const preselectedEstateId = sp.estateId;
  const isCreated = sp.created === "1";

  const session = await getServerSession(authOptions);

  if (!session || !session.user?.id) {
    redirect("/login");
  }

  await connectToDatabase();

  // Load estates this user can access (owner OR collaborator/member).
  // Support legacy ObjectId storage by querying both string ids and ObjectIds.
  const userObjectId = mongoose.Types.ObjectId.isValid(session.user.id)
    ? new mongoose.Types.ObjectId(session.user.id)
    : null;

  const estateAccessOr: Record<string, unknown>[] = [
    { ownerId: session.user.id },
    ...(userObjectId ? [{ ownerId: userObjectId }] : []),

    // Common collaborator/member patterns (safe even if fields don't exist)
    { collaboratorIds: session.user.id },
    ...(userObjectId ? [{ collaboratorIds: userObjectId }] : []),
    { collaborators: session.user.id },
    ...(userObjectId ? [{ collaborators: userObjectId }] : []),
    { memberIds: session.user.id },
    ...(userObjectId ? [{ memberIds: userObjectId }] : []),
    { members: session.user.id },
    ...(userObjectId ? [{ members: userObjectId }] : []),
    { userIds: session.user.id },
    ...(userObjectId ? [{ userIds: userObjectId }] : []),
  ];

  const estatesRaw = (await Estate.find({
    $or: estateAccessOr,
  })
    .select("_id displayName caseName caseNumber")
    .sort({ createdAt: -1 })
    .lean()) as EstateLean[];

  const estates: EstateListItem[] = estatesRaw.map((e) => ({
    _id: typeof e._id === "string" ? e._id : e._id.toString(),
    displayName: e.displayName,
    caseName: e.caseName,
    caseNumber: e.caseNumber,
  }));

  // If an estateId is already provided in the query string, only redirect
  // if it's an estate the user can access.
  if (preselectedEstateId) {
    const normalized = preselectedEstateId.toString();
    const canAccess = estates.some((e) => e._id === normalized);

    if (canAccess) {
      return redirect(`/app/estates/${normalized}/invoices/new`);
    }
    // If not accessible, fall through to the picker/empty-state UX.
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

      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <p className="text-xs font-semibold text-slate-100">How this works</p>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] text-slate-400">
          <li>Select the <span className="text-slate-200">estate</span> this invoice belongs to.</li>
          <li>You’ll add line items, issue/due dates, and payment status on the next screen.</li>
          <li>Invoices stay estate-scoped so records are easy to audit.</li>
        </ul>
      </div>

      {isCreated ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-100 shadow-sm">
          <p className="text-sm font-semibold text-emerald-100">Estate created</p>
          <p className="mt-0.5 text-[11px] text-emerald-100/80">
            Next: create your first invoice for that estate.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/app/estates"
              className="inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-500/20"
            >
              View estates
            </Link>
            <Link
              href="/app/dashboard"
              className="inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-500/20"
            >
              Dashboard
            </Link>
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        {estates.length === 0 ? (
          <div className="space-y-2 text-sm text-slate-400">
            <p>You don&apos;t have any estates yet.</p>
            <p>
              Create an estate first, then you&apos;ll be able to generate
              invoices for it.
            </p>
            <p className="text-[11px] text-slate-500">
              This keeps billing records separated per estate and makes accounting cleaner.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Link
                href="/app/estates/new"
                className="inline-flex items-center rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
              >
                Create estate
              </Link>
              <Link
                href="/app/estates"
                className="inline-flex items-center rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:bg-slate-900/40"
              >
                View estates
              </Link>
              <Link
                href="/app/dashboard"
                className="inline-flex items-center rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:bg-slate-900/40"
              >
                Dashboard
              </Link>
            </div>
          </div>
        ) : (
          <form action="/app/invoices/new" method="GET" className="space-y-4">
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
                defaultValue={estates[0]?._id ?? ""}
                required
                className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="">
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