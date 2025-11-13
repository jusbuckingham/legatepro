import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12 text-slate-50">
      <main className="w-full max-w-3xl rounded-2xl border border-slate-800 bg-slate-950/80 p-8 shadow-xl shadow-black/40">
        <header className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              LegatePro
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Probate, simplified—like TurboTax, but for estates.
            </p>
          </div>
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Private beta
          </div>
        </header>

        <section className="space-y-4">
          <p className="text-sm leading-relaxed text-slate-300">
            LegatePro gives personal representatives a calm, structured workspace
            to manage an estate from start to finish—tasks, expenses, documents,
            properties, rent, and your timecard all in one place.
          </p>

          <ul className="grid gap-3 text-sm text-slate-200 sm:grid-cols-2">
            <li className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
                Tasks
              </div>
              <p className="mt-1 text-xs text-slate-400">
                A clear checklist that feels closer to how real probate actually works.
              </p>
            </li>
            <li className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
                Expenses &amp; rent
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Track estate costs and rental income so you&apos;re ready for court and tax time.
              </p>
            </li>
            <li className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
                Document index
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Keep a simple index of every key document, wherever it lives—Drive, iCloud, or paper.
              </p>
            </li>
            <li className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
                Timecard
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Log your hours as personal rep and calculate compensation in one click.
              </p>
            </li>
          </ul>
        </section>

        <footer className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <Link
              href="/app"
              className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-sm shadow-emerald-500/30 hover:bg-emerald-400"
            >
              Open your workspace
            </Link>
          </div>
          <p className="text-xs text-slate-500">
            Built for personal representatives who are doing this for the first time—and
            never want to reinvent the process again.
          </p>
        </footer>
      </main>
    </div>
  );
}
