// src/app/app/billing/page.tsx
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Billing · LegatePro",
  description: "Manage your LegatePro subscription and invoices.",
};

const PLANS = [
  {
    id: "free",
    name: "Starter",
    price: "$0",
    cadence: "per estate",
    tagline: "Get organized for a single estate.",
    features: [
      "1 active estate workspace",
      "Task checklist + timecard",
      "Expenses + utilities + rent tracking",
      "Document index & notes",
    ],
    highlight: false,
  },
  {
    id: "pro",
    name: "Pro Personal Representative",
    price: "$19",
    cadence: "per month",
    tagline: "For PRs juggling multiple estates.",
    features: [
      "Unlimited estate workspaces",
      "Exportable timecards (CSV / PDF)",
      "Rent + expense ledgers for court & accountants",
      "Priority support on probate questions",
      "Team sharing (coming soon)",
    ],
    highlight: true,
  },
];

export default function BillingPage() {
  const currentPlanId = "free"; // TODO: wire to real user subscription
  const currentPlan = PLANS.find((p) => p.id === currentPlanId) ?? PLANS[0];
  const isBillingLive = false;

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-4 md:p-6 lg:p-8">
      {/* Header */}
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
              Billing &amp; Subscription
            </h1>
            <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950/40 px-2 py-0.5 text-[11px] font-medium text-slate-300">
              Beta
            </span>
          </div>
          <p className="max-w-2xl text-sm text-slate-400">
            Manage your LegatePro plan, see what&apos;s included, and get ready for
            Stripe-powered billing. We&apos;ll never charge you without a clear,
            explicit upgrade step.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link
              href="/app/settings"
              className="text-xs font-medium text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
            >
              Back to settings
            </Link>
            <span className="text-xs text-slate-600">•</span>
            <Link
              href="/app"
              className="text-xs font-medium text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
            >
              Go to dashboard
            </Link>
          </div>
        </div>

        <div className="w-full max-w-sm rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 text-emerald-100 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
            Current plan
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-50">{currentPlan.name}</div>
          <p className="mt-1 text-xs text-emerald-200/80">
            All core features are available while we finish billing integration.
          </p>

          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              disabled={!isBillingLive}
              className="inline-flex w-full items-center justify-center rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs font-medium text-slate-200 shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              Manage billing portal
            </button>
            {!isBillingLive ? (
              <p className="text-[11px] text-emerald-200/70">
                Coming soon: update payment method, download invoices, and manage your plan.
              </p>
            ) : null}
          </div>
        </div>
      </header>

      {/* Plans */}
      <section className="grid gap-6 md:grid-cols-2">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          const isPro = plan.highlight;

          return (
            <div
              key={plan.id}
              className={[
                "relative flex h-full flex-col rounded-2xl border bg-slate-950/40 p-5 shadow-sm",
                isPro
                  ? "border-[#F15A43]/70 shadow-[0_0_0_1px_rgba(241,90,67,0.45)]"
                  : "border-slate-800",
              ].join(" ")}
            >
              {isPro && (
                <div className="absolute -top-2 right-4 rounded-full bg-[#F15A43] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-950 shadow">
                  Most popular
                </div>
              )}

              <div className="mb-4">
                <h2 className="text-lg font-semibold text-slate-50">
                  {plan.name}
                </h2>
                <p className="mt-1 text-xs text-slate-400">{plan.tagline}</p>
              </div>

              <div className="mb-4 flex items-baseline gap-1">
                <span className="text-2xl font-semibold text-slate-50">
                  {plan.price}
                </span>
                <span className="text-xs text-slate-400">{plan.cadence}</span>
              </div>

              <ul className="mb-5 space-y-2 text-xs text-slate-300">
                {plan.features.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span
                      className={`mt-[3px] inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] ${
                        isPro
                          ? "border-[#F15A43]/80 text-[#F15A43]"
                          : "border-slate-600 text-slate-300"
                      }`}
                    >
                      ✓
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto">
                {isCurrent ? (
                  <button
                    type="button"
                    className="inline-flex w-full items-center justify-center rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs font-medium text-slate-200 shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                    disabled
                  >
                    Current plan
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!isBillingLive}
                    className="inline-flex w-full items-center justify-center rounded-md border border-[#F15A43]/80 bg-[#F15A43] px-3 py-2 text-xs font-semibold text-slate-950 shadow-sm hover:bg-[#f26b56] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Upgrade (Stripe coming soon)
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {/* Invoices */}
      <section className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Invoices &amp; receipts</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Download billing receipts once Stripe is enabled.
            </p>
          </div>
          <button
            type="button"
            disabled={!isBillingLive}
            className="inline-flex items-center justify-center rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-200 shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            Download invoices
          </button>
        </div>

        <div className="mt-3 rounded-xl border border-dashed border-slate-800 bg-slate-950/40 p-4">
          <p className="text-sm font-medium text-slate-100">No invoices yet</p>
          <p className="mt-1 text-xs text-slate-400">
            When billing is live, your receipts will appear here automatically.
          </p>
        </div>
      </section>

      {/* Stripe integration note */}
      <section className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-4 text-xs text-slate-300">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Stripe integration roadmap
        </div>
        <p className="mb-2">
          LegatePro will use Stripe for secure subscription management and receipts. While billing is in beta, you&apos;ll be able to use the
          app without charges. When we&apos;re ready, you&apos;ll see a clear
          upgrade flow and pricing summary before anything changes.
        </p>
        <p className="text-[11px] text-slate-500">
          Under the hood, this page will talk to <code className="rounded bg-slate-900 px-1 py-0.5">/api/billing</code>{" "}
          and Stripe&apos;s customer portal so you can update payment methods,
          download invoices, and manage your plan without emailing anyone.
        </p>
      </section>
    </div>
  );
}