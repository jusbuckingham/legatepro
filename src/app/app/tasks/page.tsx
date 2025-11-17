// src/app/app/tasks/page.tsx

export default function TasksPage() {
  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">
          Tasks &amp; deadlines
        </h2>
        <p className="text-sm text-slate-400">
          Track calls, filings, court dates, and follow-ups across your estates.
        </p>
      </header>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">
        This section isn&apos;t wired up yet. Once we add tasks, you&apos;ll see
        a sortable list of upcoming and overdue items here.
      </div>
    </div>
  );
}