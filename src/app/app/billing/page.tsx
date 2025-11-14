// src/app/app/billing/page.tsx

export const dynamic = "force-dynamic";

export default function BillingPage() {
  const currentPlan = "Trial";
  const isTrial = currentPlan === "Trial";

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <nav className="text-xs text-slate-500">
            <span className="text-slate-500">Account</span>
            <span className="mx-1 text-slate-600">/</span>
            <span className="text-rose-300">Billing</span>
          </nav>

          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-50">
              Billing &amp; subscription
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Manage your LegatePro plan, invoices, and payment method. This is
              where you&apos;ll connect Stripe once we turn on paid tiers.
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 text-xs">
          <span className="inline-flex items-center rounded-full border border-rose-500/40 bg-rose-950/70 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-rose-100 shadow-sm">
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-rose-400" />
            Billing workspace
          </span>
          <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-emerald-100">
            MVP: no live charges yet
          </span>
        </div>
      </div>

      {/* Current plan card */}
      <section className="grid gap-6 md:grid-cols-[minmax(0,2fr),minmax(0,1.2fr)]">
        <div className="space-y-4 rounded-xl border border-rose-900/50 bg-slate-950/80 p-4 shadow-sm shadow-rose-950/50">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-rose-200">
                Current plan
              </h2>
              <p className="text-sm text-slate-300">
                You&apos;re on the <span className="font-medium">{currentPlan}</span>{" "}
                plan. During the MVP, you can use LegatePro to organize your
                estates without any charges.
              </p>
            </div>

            <div className="text-right text-xs">
              <p className="text-slate-400">Status</p>
              <p className="mt-1 inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-100">
                <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Active
              </p>
            </div>
          </div>

          <div className="grid gap-3 text-sm md:grid-cols-3">
            <div className="space-y-1 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
              <p className="text-xs font-medium text-slate-400">
                Monthly cost
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-50">
                {isTrial ? "$0" : "$—"}
              </p>
              <p className="text-[11px] text-slate-500">
                We&apos;ll show your Stripe subscription here once plans are live.
              </p>
            </div>

            <div className="space-y-1 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
              <p className="text-xs font-medium text-slate-400">
                Estates included
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-50">
                Unlimited (MVP)
              </p>
              <p className="text-[11px] text-slate-500">
                Track as many probate files as you need while we&apos;re in early
                access.
              </p>
            </div>

            <div className="space-y-1 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
              <p className="text-xs font-medium text-slate-400">Users</p>
              <p className="mt-1 text-lg font-semibold text-slate-50">
                Single workspace
              </p>
              <p className="text-[11px] text-slate-500">
                In the future, you&apos;ll be able to invite co-PRs or attorneys to
                share access.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-800 pt-3 text-xs md:flex-row md:items-center md:justify-between">
            <p className="text-[11px] text-slate-500">
              When you&apos;re ready to charge, we&apos;ll connect this page directly to
              Stripe so upgrades, downgrades, and cancellations are all managed
              here.
            </p>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md bg-rose-500 px-3 py-1.5 text-sm font-medium text-slate-950 opacity-70 hover:opacity-100"
            >
              Stripe coming soon
            </button>
          </div>
        </div>

        {/* Invoices & payment method placeholder */}
        <div className="space-y-4">
          <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/80 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                Payment method
              </h2>
              <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] text-slate-400">
                Not set
              </span>
            </div>
            <p className="text-sm text-slate-400">
              Once Stripe is wired up, you&apos;ll be able to add a card on file for
              your subscription. For now, LegatePro stays in free early access.
            </p>
          </section>

          <section className="space-y-3 rounded-xl border border-dashed border-slate-800 bg-slate-950/60 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                Invoices &amp; history
              </h2>
              <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] text-slate-400">
                No invoices yet
              </span>
            </div>
            <p className="text-sm text-slate-400">
              When billing goes live, this is where you&apos;ll download receipts for
              your records or your attorney.
            </p>
            <p className="text-[11px] text-slate-500">
              Need a custom arrangement down the line? We can always layer in
              manual billing or firm-level pricing here.
            </p>
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-[11px] text-slate-500">
            <p>
              For now, focus on getting your estates clean and court-ready. Once
              we&apos;re confident the workflow truly saves time for personal reps and
              attorneys, we&apos;ll turn on billing with fair, transparent pricing.
            </p>
          </section>
        </div>
      </section>
    </div>
  );
}