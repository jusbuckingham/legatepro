// src/app/app/documents/page.tsx

import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export const metadata = {
  title: "Documents | LegatePro",
};

export default async function DocumentsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/app/documents");
  }
  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <nav className="text-xs text-slate-500">
            <span className="text-slate-400">App</span>
            <span className="mx-1 text-slate-600">/</span>
            <span className="text-rose-300">Documents</span>
          </nav>

          <h1 className="text-xl font-semibold tracking-tight text-slate-50">
            Documents
          </h1>
          <p className="max-w-2xl text-sm text-slate-400">
            A central place for wills, letters of administration, court filings, and
            supporting records.
          </p>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center rounded-full border border-rose-500/40 bg-rose-950/70 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-rose-100 shadow-sm">
            Estate-scoped
          </span>
          <span className="inline-flex items-center rounded-full border border-slate-700/40 bg-slate-900/60 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-400 shadow-sm">
            Global library: coming soon
          </span>
        </div>
      </div>

      {/* Main documents section */}
      <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 shadow-sm">
        <div className="space-y-2">
          <p className="text-lg font-semibold text-slate-100">
            Documents live inside estates
          </p>
          <p className="text-sm text-slate-400">
            Estate-level scoping helps keep files legally separated and auditable. A global library is planned for future releases.
          </p>

          <div className="mt-3">
            <p className="text-sm font-semibold text-slate-300">What you can do now</p>
            <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-slate-400">
              <li>Open an estate and manage its document index</li>
              <li>Add links to Drive/Dropbox files so you can find them quickly</li>
              <li>Use consistent tags (e.g., COURT, ID, TAX, BANK) for fast scanning</li>
            </ul>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/app/estates"
            className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900/40 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-900/70"
          >
            Go to estates
          </Link>
          <Link
            href="/app/estates"
            className="inline-flex items-center rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-100 hover:bg-rose-500/20"
          >
            Open an estate’s document index
          </Link>
          <Link
            href="/app/estates/new"
            className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900/40 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-900/70"
          >
            Create your first estate
          </Link>
        </div>

        <div className="mt-4 rounded-xl border border-dashed border-slate-800 bg-slate-950/60 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Best practice
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Store the authoritative file in Drive or Dropbox, paste the share link into the estate document entry, and keep the estate index as your audit trail.
          </p>
        </div>
      </section>
    </div>
  );
}