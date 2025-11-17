// src/app/app/documents/page.tsx

export default function DocumentsPage() {
  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">Documents</h2>
        <p className="text-sm text-slate-400">
          Central place for wills, letters of administration, court filings, and
          supporting records.
        </p>
      </header>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">
        This section isn&apos;t wired up yet. Once we hook up storage, you&apos;ll be
        able to upload, tag, and link documents to specific estates.
      </div>
    </div>
  );
}