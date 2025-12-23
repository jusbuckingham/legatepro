// src/app/app/documents/page.tsx

import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import PageHeader from "@/components/layout/PageHeader";

export const metadata = {
  title: "Documents | LegatePro",
};

export default async function DocumentsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/app/documents");
  }
  return (
    <div className="space-y-8 p-4 md:p-6">
      <PageHeader
        eyebrow={
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Link
              href="/app"
              className="font-medium text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
            >
              ← Back to dashboard
            </Link>

            <span className="text-slate-600">•</span>

            <nav className="text-xs text-slate-500" aria-label="Breadcrumb">
              <span className="text-slate-400">App</span>
              <span className="mx-1 text-slate-600">/</span>
              <span className="text-rose-300">Documents</span>
            </nav>
          </div>
        }
        title="Documents"
        description="A central place to find wills, letters of administration, court filings, IDs, tax forms, and supporting records."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-rose-500/40 bg-rose-950/70 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-rose-100 shadow-sm">
              Estate-scoped
            </span>
            <span className="inline-flex items-center rounded-full border border-slate-700/40 bg-slate-900/60 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-400 shadow-sm">
              Global library: planned
            </span>
          </div>
        }
      />

      {/* Main documents section */}
      <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <p className="text-base font-semibold text-slate-100">Documents live inside estates</p>
            <p className="max-w-2xl text-sm text-slate-400">
              LegatePro keeps documents estate-scoped by design so files stay legally separated and easy to audit.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/app/estates"
              className="inline-flex items-center rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-100 hover:bg-rose-500/20 hover:text-rose-50"
            >
              Open an estate’s documents
            </Link>
            <Link
              href="/app/estates/new"
              className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900/40 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-900/70 hover:text-slate-50"
            >
              Create an estate
            </Link>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
            <p className="text-sm font-semibold text-slate-200">What you can do now</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-slate-400">
              <li>Open an estate and manage its document index</li>
              <li>Add Drive/Dropbox links so you can find files fast</li>
              <li>Use consistent tags (COURT, ID, TAX, BANK)</li>
            </ul>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
            <p className="text-sm font-semibold text-slate-200">Recommended structure</p>
            <ul className="mt-2 space-y-1 text-sm text-slate-400">
              <li>
                <span className="font-medium text-slate-300">Title</span>: short, human readable
              </li>
              <li>
                <span className="font-medium text-slate-300">Tag</span>: type/category (e.g., COURT)
              </li>
              <li>
                <span className="font-medium text-slate-300">Link</span>: authoritative source of truth
              </li>
            </ul>
          </div>

          <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/60 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Best practice</p>
            <p className="mt-2 text-sm text-slate-400">
              Store the authoritative file in Drive or Dropbox, paste the share link into the estate entry, and keep the estate index as your audit trail.
            </p>
            <div className="mt-3">
              <Link
                href="/app/estates"
                className="text-xs font-medium text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
              >
                Browse estates →
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// src/components/layout/PageHeader.tsx

import type { ReactNode } from "react";

export interface PageHeaderProps {
  eyebrow?: ReactNode;
  title: string;
  description?: string;
  actions?: ReactNode;
}