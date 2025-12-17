// src/app/app/documents/page.tsx

import Link from "next/link";

export const metadata = {
  title: "Documents | LegatePro",
};

export default function DocumentsPage() {
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

        <div className="mt-1 flex flex-col items-end gap-2 text-xs text-slate-400">
          <span className="inline-flex items-center rounded-full border border-rose-500/40 bg-rose-950/70 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-rose-100 shadow-sm">
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-rose-400" />
            Court packet helper
          </span>
          <span className="text-[11px] text-slate-500">
            Estate-level indexes live inside each estate.
          </span>
        </div>
      </div>

      {/* Not wired yet */}
      <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 shadow-sm">
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-100">
            This page is coming soon
          </p>
          <p className="text-sm text-slate-400">
            Global documents will let you upload, tag, and reuse files across multiple
            estates. For now, use each estate’s <span className="text-slate-200">Document index</span>
            to track where documents live and how to find them.
          </p>
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
            Open a document index
          </Link>
        </div>

        <div className="mt-4 rounded-xl border border-dashed border-slate-800 bg-slate-950/60 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Tip
          </p>
          <p className="mt-1 text-xs text-slate-500">
            If you store files in Drive/Dropbox, paste the share link into the estate
            document entry so you can find it later in seconds.
          </p>
        </div>
      </section>
    </div>
  );
}