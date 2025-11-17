// src/app/app/page.tsx
import Link from "next/link";

export default function AppHomePage() {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-2xl font-semibold tracking-tight">Dashboard</h2>
        <p className="text-sm text-slate-400">
          High-level view of your estates, tasks, cash flow, and documents.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Active estates
          </p>
          <p className="mt-2 text-3xl font-semibold text-slate-50">0</p>
          <p className="mt-1 text-xs text-slate-500">
            We&apos;ll surface a count once your estate data is wired up.
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Open tasks
          </p>
          <p className="mt-2 text-3xl font-semibold text-slate-50">0</p>
          <p className="mt-1 text-xs text-slate-500">
            Upcoming probate deadlines, calls, and follow-ups will show here.
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Upcoming hearings
          </p>
          <p className="mt-2 text-3xl font-semibold text-slate-50">0</p>
          <p className="mt-1 text-xs text-slate-500">
            Court dates and key events tied to each estate.
          </p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-100">
            Recent activity
          </h3>
          <p className="mt-2 text-xs text-slate-400">
            As you log tasks, payments, and notes, they&apos;ll roll up here so you
            can see what changed across your estates at a glance.
          </p>
          <div className="mt-4 rounded-lg border border-dashed border-slate-800 p-4 text-center text-xs text-slate-500">
            No activity yet. Once data is wired, this becomes your running log.
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="text-sm font-semibold text-slate-100">
            Quick links
          </h3>
          <ul className="mt-3 space-y-2 text-sm text-emerald-300">
            <li>
              <Link href="/app/estates" className="hover:underline">
                → View all estates
              </Link>
            </li>
            <li>
              <Link href="/app/estates/new" className="hover:underline">
                → Create a new estate
              </Link>
            </li>
            <li>
              <Link href="/app/tasks" className="hover:underline">
                → Review tasks &amp; deadlines
              </Link>
            </li>
            <li>
              <Link href="/app/documents" className="hover:underline">
                → Organize documents
              </Link>
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}