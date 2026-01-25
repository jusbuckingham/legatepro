import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 px-4 py-12 text-slate-50">
      <main className="w-full max-w-3xl rounded-2xl border border-slate-800 bg-slate-950/80 p-8 shadow-xl shadow-black/40">
        {/* Header / brand */}
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-1 flex h-9 w-9 items-center justify-center rounded-lg border border-red-500/60 bg-red-500/10 text-xs font-semibold tracking-[0.18em]">
              LP
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                LegatePro
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                You’ve been named Personal Representative. Start with a clear next step.
              </p>

              {/* Trust / highlights */}
              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                <span className="inline-flex items-center rounded-full border border-emerald-500/50 bg-emerald-500/10 px-3 py-1 font-medium uppercase tracking-wide text-emerald-300">
                  Private beta
                </span>
                <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/50 px-3 py-1 font-medium uppercase tracking-wide text-slate-300">
                  No document uploads
                </span>
                <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/50 px-3 py-1 font-medium uppercase tracking-wide text-slate-300">
                  Court-ready record
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-start gap-1 text-right text-xs sm:items-end">
            <span className="text-[11px] text-slate-500">
              Built for personal reps.
            </span>
            <span className="text-[11px] text-slate-600">
              Stay organized. Stay ready.
            </span>
          </div>
        </header>

        {/* Value props */}
        <section className="space-y-4">
          <p className="text-sm leading-relaxed text-slate-300">
            Probate is a lot to hold in your head. LegatePro keeps your tasks, document index, costs, and deadlines in one place, so you always know what’s next.
          </p>

          <ul className="grid gap-3 text-sm text-slate-200 sm:grid-cols-2">
            <li className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
                Tasks
              </div>
              <p className="mt-1 text-xs text-slate-400">
                A clear checklist built around real probate milestones.
              </p>
            </li>
            <li className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
                Money in &amp; out
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Track expenses, repairs, utilities, and rent. Export clean totals when you need them.
              </p>
            </li>
            <li className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
                Document index
              </div>
              <p className="mt-1 text-xs text-slate-400">
                List what you have and where it lives: Drive, iCloud, email, or paper.
              </p>
            </li>
            <li className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
                Timecard
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Log your PR hours and notes. Keep proof if you request compensation.
              </p>
            </li>
          </ul>

          {/* Outcome */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-200">
              What you get
            </h2>
            <div className="mt-3 grid gap-2 text-xs text-slate-300 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                <div className="font-medium text-slate-100">A clean timeline</div>
                <p className="mt-1 text-slate-400">
                  Every action, note, and cost captured in one place.
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                <div className="font-medium text-slate-100">A court-ready summary</div>
                <p className="mt-1 text-slate-400">
                  Documents indexed, tasks tracked, and totals easy to share.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Primary actions */}
        <footer className="mt-8 space-y-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <Link
                href="/app"
                className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-sm shadow-emerald-500/30 hover:bg-emerald-400"
              >
                Start free
              </Link>
              <Link
                href="#how-it-works"
                className="inline-flex items-center justify-center rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-100 hover:border-slate-500 hover:text-white"
              >
                How it works
              </Link>
            </div>
            <p className="text-xs text-slate-500">
              Built for first-timers. Clear enough to share.
            </p>
          </div>

          {/* How it works */}
          <section
            id="how-it-works"
            className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 sm:p-5"
          >
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-200">
              How it works
            </h2>
            <ol className="mt-3 space-y-3 text-sm text-slate-300">
              <li className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-[11px] font-semibold text-slate-200">
                  1
                </span>
                <div>
                  <p className="font-medium text-slate-100">Set up your estate</p>
                  <p className="text-xs text-slate-400">
                    Add the basics: court info, properties, and key contacts.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-[11px] font-semibold text-slate-200">
                  2
                </span>
                <div>
                  <p className="font-medium text-slate-100">Work the checklist</p>
                  <p className="text-xs text-slate-400">
                    Follow the checklist. Log costs, rent, and your time as you go.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-[11px] font-semibold text-slate-200">
                  3
                </span>
                <div>
                  <p className="font-medium text-slate-100">Close with confidence</p>
                  <p className="text-xs text-slate-400">
                    When it’s time to close, you have a clean record of what happened and what it cost.
                  </p>
                </div>
              </li>
            </ol>
          </section>

          <div className="mt-4 flex flex-col gap-2 border-t border-slate-900 pt-4 text-[11px] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] text-slate-500">
              Not legal advice. Confirm requirements with your court or attorney.
            </p>
            <div className="flex gap-3">
              <Link
                href="/privacy"
                className="text-[11px] text-slate-500 hover:text-slate-300"
              >
                Privacy
              </Link>
              <Link
                href="/terms"
                className="text-[11px] text-slate-500 hover:text-slate-300"
              >
                Terms
              </Link>
              <Link
                href="/support"
                className="text-[11px] text-slate-500 hover:text-slate-300"
              >
                Support
              </Link>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
