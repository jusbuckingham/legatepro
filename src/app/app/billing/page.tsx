"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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

type BillingSnapshot = {
  customer: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    stripeCustomerId: string | null;
  };
  subscription: {
    planId: string;
    planName: string;
    price: number;
    currency: string;
    interval: "month" | "year";
    status: string;
    managedByStripe: boolean;
  };
};

async function fetchBilling(): Promise<BillingSnapshot> {
  const res = await fetch("/api/billing", { cache: "no-store" });
  const json = await res.json();
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || "Failed to load billing");
  }
  return json.data;
}

async function startCheckout(planId: string): Promise<string> {
  const res = await fetch("/api/billing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planId }),
  });
  const json = await res.json();
  if (!res.ok || !json?.ok || !json.data?.url) {
    throw new Error(json?.error || "Failed to start checkout");
  }
  return json.data.url;
}

async function startPortal(): Promise<string> {
  const res = await fetch("/api/billing/portal", { method: "POST" });
  const json = await res.json();
  if (!res.ok || !json?.ok || !json.data?.url) {
    throw new Error(json?.error || "Failed to open portal");
  }
  return json.data.url;
}

export default function BillingPage() {
  const [snapshot, setSnapshot] = useState<BillingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);
  const [busyPortal, setBusyPortal] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await fetchBilling();
        if (mounted) setSnapshot(data);
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : "Billing unavailable");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const currentPlanId = snapshot?.subscription.planId ?? "free";

  const currentPlanLabel = useMemo(() => {
    return (PLANS.find((p) => p.id === currentPlanId) ?? PLANS[0]).name;
  }, [currentPlanId]);

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold text-slate-50">Billing & Subscription</h1>
          <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950/40 px-2 py-0.5 text-[11px] font-medium text-slate-300">
            Current: {currentPlanLabel}
          </span>
        </div>
        <p className="text-sm text-slate-400">
          Manage your LegatePro plan. Upgrades are handled securely through Stripe.
        </p>
        <div className="flex gap-3 text-xs">
          <Link href="/app" className="text-slate-300 hover:underline">
            Dashboard
          </Link>
          <Link href="/app/settings" className="text-slate-300 hover:underline">
            Settings
          </Link>
        </div>
      </header>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-950/30 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <section className="grid gap-6 md:grid-cols-2">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          return (
            <div
              key={plan.id}
              className={`rounded-xl border p-5 ${
                plan.highlight ? "border-[#F15A43]" : "border-slate-800"
              }`}
            >
              <h2 className="text-lg font-semibold text-slate-50">{plan.name}</h2>
              <p className="mt-1 text-xs text-slate-400">{plan.tagline}</p>

              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-2xl font-semibold text-slate-50">{plan.price}</span>
                <span className="text-xs text-slate-400">{plan.cadence}</span>
              </div>

              <ul className="mt-4 space-y-2 text-xs text-slate-300">
                {plan.features.map((f) => (
                  <li key={f}>✓ {f}</li>
                ))}
              </ul>

              <div className="mt-5">
                {isCurrent ? (
                  <button
                    disabled
                    className="w-full rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-300"
                  >
                    Current plan
                  </button>
                ) : (
                  <button
                    disabled={loading || busyPlanId === plan.id}
                    onClick={async () => {
                      try {
                        setBusyPlanId(plan.id);
                        const url = await startCheckout(plan.id);
                        window.location.href = url;
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Checkout failed");
                      } finally {
                        setBusyPlanId(null);
                      }
                    }}
                    className="w-full rounded-md bg-[#F15A43] px-3 py-2 text-xs font-semibold text-black hover:bg-[#f26b56]"
                  >
                    {busyPlanId === plan.id ? "Redirecting…" : "Upgrade"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </section>

      <section className="rounded-xl border border-slate-800 p-4">
        <h2 className="text-sm font-semibold text-slate-100">Customer portal</h2>
        <p className="mt-1 text-xs text-slate-400">
          Update payment methods, cancel subscriptions, and download invoices.
        </p>
        <button
          disabled={!snapshot || busyPortal}
          onClick={async () => {
            try {
              setBusyPortal(true);
              const url = await startPortal();
              window.location.href = url;
            } catch (e) {
              setError(e instanceof Error ? e.message : "Portal unavailable");
            } finally {
              setBusyPortal(false);
            }
          }}
          className="mt-3 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-200"
        >
          {busyPortal ? "Opening…" : "Open Stripe portal"}
        </button>
      </section>
    </div>
  );
}