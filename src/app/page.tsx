import Link from "next/link";

export default function Home() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 py-12 text-foreground">
      {/* Subtle decorative gradients */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-rose-500/10 blur-3xl" />
        <div className="absolute -bottom-48 right-[-120px] h-[520px] w-[520px] rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(1200px_circle_at_top,rgba(244,63,94,0.08),transparent_55%)]" />
      </div>
      <main className="relative w-full max-w-3xl rounded-2xl border border-border bg-card p-8 shadow-sm">
        {/* Header / brand */}
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-1 flex h-9 w-9 items-center justify-center rounded-lg border border-rose-500/30 bg-rose-500/10 text-xs font-semibold tracking-[0.18em] text-rose-600">
              LP
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                LegatePro
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                You’ve been named Personal Representative. Start with a clear next step.
              </p>

              {/* Trust / highlights */}
              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 font-semibold uppercase tracking-wide text-emerald-600">
                  Private beta
                </span>
                <span className="inline-flex items-center rounded-full border border-border bg-muted/30 px-3 py-1 font-semibold uppercase tracking-wide text-muted-foreground">
                  No document uploads
                </span>
                <span className="inline-flex items-center rounded-full border border-border bg-muted/30 px-3 py-1 font-semibold uppercase tracking-wide text-muted-foreground">
                  Court-ready record
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-start gap-1 text-right text-xs sm:items-end">
            <span className="text-[11px] text-muted-foreground">
              Built for personal reps.
            </span>
            <span className="text-[11px] text-muted-foreground">
              Stay organized. Stay ready.
            </span>
          </div>
        </header>

        {/* Value props */}
        <section className="space-y-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Probate is a lot to hold in your head. LegatePro keeps your tasks, document index, costs, and deadlines in one place, so you always know what’s next.
          </p>

          <ul className="grid gap-3 text-sm text-foreground sm:grid-cols-2">
            <li className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
                Tasks
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                A clear checklist built around real probate milestones.
              </p>
            </li>
            <li className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
                Money in &amp; out
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Track expenses, repairs, utilities, and rent. Export clean totals when you need them.
              </p>
            </li>
            <li className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
                Document index
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                List what you have and where it lives: Drive, iCloud, email, or paper.
              </p>
            </li>
            <li className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
                Timecard
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Log your PR hours and notes. Keep proof if you request compensation.
              </p>
            </li>
          </ul>

          {/* Outcome */}
          <div className="rounded-2xl border border-border bg-muted/20 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground">
              What you get
            </h2>
            <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-card p-3">
                <div className="font-medium text-foreground">A clean timeline</div>
                <p className="mt-1 text-muted-foreground">
                  Every action, note, and cost captured in one place.
                </p>
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <div className="font-medium text-foreground">A court-ready summary</div>
                <p className="mt-1 text-muted-foreground">
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
                className="inline-flex items-center justify-center rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Start free
              </Link>
              <Link
                href="#how-it-works"
                className="inline-flex items-center justify-center rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/15 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                How it works
              </Link>
            </div>
            <p className="text-xs text-muted-foreground">
              Built for first-timers. Clear enough to share.
            </p>
          </div>

          {/* How it works */}
          <section
            id="how-it-works"
            className="rounded-2xl border border-border bg-card p-4 sm:p-5"
          >
            <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
              How it works
            </h2>
            <ol className="mt-3 space-y-3 text-sm text-muted-foreground">
              <li className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">
                  1
                </span>
                <div>
                  <p className="font-medium text-foreground">Set up your estate</p>
                  <p className="text-xs text-muted-foreground">
                    Add the basics: court info, properties, and key contacts.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">
                  2
                </span>
                <div>
                  <p className="font-medium text-foreground">Work the checklist</p>
                  <p className="text-xs text-muted-foreground">
                    Follow the checklist. Log costs, rent, and your time as you go.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">
                  3
                </span>
                <div>
                  <p className="font-medium text-foreground">Close with confidence</p>
                  <p className="text-xs text-muted-foreground">
                    When it’s time to close, you have a clean record of what happened and what it cost.
                  </p>
                </div>
              </li>
            </ol>
          </section>

          <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] text-muted-foreground">
              Not legal advice. Confirm requirements with your court or attorney.
            </p>
            <div className="flex gap-3">
              <Link
                href="/privacy"
                className="text-[11px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/15 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Privacy
              </Link>
              <Link
                href="/terms"
                className="text-[11px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/15 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Terms
              </Link>
              <Link
                href="/support"
                className="text-[11px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/15 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
