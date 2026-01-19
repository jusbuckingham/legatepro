"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

type BillingPlan = {
  id: string;
  name: string;
  price: number;
  currency: string;
  interval: "month" | "year";
  stripePriceEnv?: string;
};

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
    status: string; // "active" | "trialing" | "past_due" | "canceled" | "inactive" ...
    managedByStripe: boolean;
  };
  plans: BillingPlan[];
};

async function fetchBilling(): Promise<BillingSnapshot> {
  const res = await fetch("/api/billing", {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const json = (await res.json()) as {
    ok: boolean;
    data?: BillingSnapshot;
    error?: string;
  };

  if (!res.ok || !json.ok || !json.data) {
    throw new Error(json.error || "Failed to load billing");
  }

  return json.data;
}

async function startCheckout(planId: string): Promise<string> {
  const res = await fetch("/api/billing", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ planId }),
  });

  const json = (await res.json()) as {
    ok: boolean;
    data?: { url?: string };
    error?: string;
  };

  if (!res.ok || !json.ok || !json.data?.url) {
    throw new Error(json.error || "Failed to start checkout");
  }

  return json.data.url;
}

async function startPortal(): Promise<string> {
  const res = await fetch("/api/billing/portal", {
    method: "POST",
    headers: { Accept: "application/json" },
  });

  const json = (await res.json()) as {
    ok: boolean;
    data?: { url?: string };
    error?: string;
  };

  if (!res.ok || !json.ok || !json.data?.url) {
    throw new Error(json.error || "Failed to open customer portal");
  }

  return json.data.url;
}

type Banner = {
  kind: "success" | "warning" | "info";
  title: string;
  message: string;
  actions?: Array<{ label: string; onClick: () => void; variant?: "primary" | "secondary" }>;
};

function BannerBox({ banner, onDismiss }: { banner: Banner; onDismiss: () => void }) {
  const styles =
    banner.kind === "success"
      ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-100"
      : banner.kind === "warning"
        ? "border-amber-500/30 bg-amber-950/20 text-amber-100"
        : "border-slate-700 bg-slate-950/40 text-slate-200";

  const titleColor =
    banner.kind === "success"
      ? "text-emerald-200"
      : banner.kind === "warning"
        ? "text-amber-200"
        : "text-slate-200";

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${styles}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={`text-sm font-semibold ${titleColor}`}>{banner.title}</div>
          <p className="mt-1 text-xs opacity-90">{banner.message}</p>

          {banner.actions?.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {banner.actions.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  onClick={a.onClick}
                  className={
                    a.variant === "primary"
                      ? "inline-flex items-center justify-center rounded-md bg-[#F15A43] px-3 py-2 text-xs font-semibold text-slate-950 shadow-sm hover:bg-[#f26b56]"
                      : "inline-flex items-center justify-center rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs font-medium text-slate-200 shadow-sm hover:bg-slate-900/80"
                  }
                >
                  {a.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md border border-slate-700 bg-slate-900/60 px-2 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-900/80"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

export default function BillingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [snapshot, setSnapshot] = useState<BillingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);
  const [busyPortal, setBusyPortal] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);

  const hasShownReturnBannerRef = useRef(false);

  const refreshBilling = useCallback(async () => {
    const data = await fetchBilling();
    setSnapshot(data);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchBilling();
        if (!cancelled) setSnapshot(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load billing");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const currentPlanId = snapshot?.subscription?.planId ?? "free";
  const currentStatus = snapshot?.subscription?.status ?? "inactive";
  const isPro = currentPlanId === "pro";
  const isBillingLive = Boolean(snapshot);

  // Plan object used in the header box
  const currentPlan = useMemo(
    () => PLANS.find((p) => p.id === currentPlanId) ?? PLANS[0],
    [currentPlanId],
  );

  const successParam = searchParams.get("success");
  const canceledParam = searchParams.get("canceled");

  // Post-Stripe return UX:
  // - show banner
  // - refresh snapshot so UI updates immediately
  // - optionally clean URL (remove params)
  useEffect(() => {
    if (hasShownReturnBannerRef.current) return;

    const cameFromStripe = successParam === "1" || canceledParam === "1";
    if (!cameFromStripe) return;

    hasShownReturnBannerRef.current = true;

    (async () => {
      try {
        // Refresh first so banner can reflect final state
        await refreshBilling();

        if (successParam === "1") {
          setBanner({
            kind: "success",
            title: "Upgrade complete",
            message: "You’re all set. Your subscription is active and managed through Stripe.",
            actions: [
              {
                label: "Manage subscription",
                variant: "secondary",
                onClick: async () => {
                  try {
                    setBusyPortal(true);
                    const url = await startPortal();
                    window.location.assign(url);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Failed to open customer portal");
                  } finally {
                    setBusyPortal(false);
                  }
                },
              },
              {
                label: "Go to estates",
                variant: "primary",
                onClick: () => router.push("/app/estates"),
              },
            ],
          });
        } else if (canceledParam === "1") {
          setBanner({
            kind: "warning",
            title: "Checkout canceled",
            message:
              "No worries — you weren’t charged. You can upgrade anytime, and your current plan stays the same.",
            actions: [
              {
                label: "Try again",
                variant: "primary",
                onClick: () => {
                  // keep user on page; they can click upgrade
                  window.scrollTo({ top: 0, behavior: "smooth" });
                },
              },
            ],
          });
        }
      } catch {
        setBanner({
          kind: "info",
          title: "Back from Stripe",
          message:
            "We couldn’t refresh billing status automatically. Try refreshing the page in a moment.",
        });
      } finally {
        // Clean the URL so refreshes/bookmarks don’t keep showing the banner
        router.replace("/app/billing");
      }
    })();
  }, [successParam, canceledParam, refreshBilling, router]);

  const statusLabel = useMemo(() => {
    const s = String(currentStatus || "").toLowerCase();
    if (!isBillingLive) return "Loading…";
    if (isPro) {
      if (s === "active") return "Active";
      if (s === "trialing") return "Trial";
      if (s === "past_due") return "Past due";
      if (s === "canceled") return "Canceled";
      return "Pro";
    }
    return "Free";
  }, [currentStatus, isBillingLive, isPro]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6 lg:p-8">
      {banner ? <BannerBox banner={banner} onDismiss={() => setBanner(null)} /> : null}

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
            Manage your LegatePro plan and Stripe subscription. You’ll always see a clear upgrade step before anything
            changes.
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
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
                Current plan
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-50">{currentPlan.name}</div>
              <div className="mt-1 text-[11px] text-emerald-200/80">Status: {statusLabel}</div>
            </div>

            <button
              type="button"
              onClick={async () => {
                try {
                  setLoading(true);
                  setError(null);
                  await refreshBilling();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Failed to refresh billing");
                } finally {
                  setLoading(false);
                }
              }}
              className="rounded-md border border-slate-700 bg-slate-900/60 px-2 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-900/80 disabled:opacity-60"
              disabled={loading}
              title="Refresh billing status"
            >
              Refresh
            </button>
          </div>

          <p className="mt-2 text-xs text-emerald-200/80">
            {loading
              ? "Loading your billing status…"
              : error
                ? `Billing unavailable: ${error}`
                : "Subscriptions are managed securely through Stripe."}
          </p>

          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              disabled={!isBillingLive || busyPortal}
            onClick={async () => {
              try {
                setBusyPortal(true);
                const url = await startPortal();
                window.location.assign(url);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to open customer portal");
              } finally {
                setBusyPortal(false);
              }
            }}
              className="inline-flex w-full items-center justify-center rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs font-medium text-slate-200 shadow-sm hover:bg-slate-900/80 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busyPortal ? "Opening portal…" : "Customer portal"}
            </button>

            {!isBillingLive ? (
              <p className="text-[11px] text-emerald-200/70">
                Connect Stripe to enable the customer portal (update payment methods, cancel, download invoices).
              </p>
            ) : null}
          </div>
        </div>
      </header>

      {/* Plans */}
      <section className="grid gap-6 md:grid-cols-2">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          const isProCard = plan.highlight;

          return (
            <div
              key={plan.id}
              className={[
                "relative flex h-full flex-col rounded-2xl border bg-slate-950/40 p-5 shadow-sm",
                isProCard
                  ? "border-[#F15A43]/70 shadow-[0_0_0_1px_rgba(241,90,67,0.45)]"
                  : "border-slate-800",
              ].join(" ")}
            >
              {isProCard && (
                <div className="absolute -top-2 right-4 rounded-full bg-[#F15A43] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-950 shadow">
                  Most popular
                </div>
              )}

              <div className="mb-4">
                <h2 className="text-lg font-semibold text-slate-50">{plan.name}</h2>
                <p className="mt-1 text-xs text-slate-400">{plan.tagline}</p>
              </div>

              <div className="mb-4 flex items-baseline gap-1">
                <span className="text-2xl font-semibold text-slate-50">{plan.price}</span>
                <span className="text-xs text-slate-400">{plan.cadence}</span>
              </div>

              <ul className="mb-5 space-y-2 text-xs text-slate-300">
                {plan.features.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span
                      className={`mt-[3px] inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] ${
                        isProCard ? "border-[#F15A43]/80 text-[#F15A43]" : "border-slate-600 text-slate-300"
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
                    disabled={!isBillingLive || busyPlanId === plan.id || (isPro && plan.id === "pro")}
                    onClick={async () => {
                      try {
                        setBusyPlanId(plan.id);
                        const url = await startCheckout(plan.id);
                        window.location.assign(url);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Failed to start checkout");
                      } finally {
                        setBusyPlanId(null);
                      }
                    }}
                    className="inline-flex w-full items-center justify-center rounded-md border border-[#F15A43]/80 bg-[#F15A43] px-3 py-2 text-xs font-semibold text-slate-950 shadow-sm hover:bg-[#f26b56] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busyPlanId === plan.id ? "Redirecting…" : "Upgrade to Pro"}
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
              {loading
                ? "Loading billing history…"
                : isBillingLive
                  ? "Receipts live in Stripe’s customer portal."
                  : "Connect billing to download receipts."}
            </p>
          </div>

          <button
            type="button"
            disabled={!isBillingLive || busyPortal}
            onClick={async () => {
              try {
                setBusyPortal(true);
                const url = await startPortal();
                window.location.assign(url);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to open customer portal");
              } finally {
                setBusyPortal(false);
              }
            }}
            className="inline-flex items-center justify-center rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-200 shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busyPortal ? "Opening…" : "View invoices in portal"}
          </button>
        </div>

        <div className="mt-3 rounded-xl border border-dashed border-slate-800 bg-slate-950/40 p-4">
          <p className="text-sm font-medium text-slate-100">Stripe portal</p>
          <p className="mt-1 text-xs text-slate-400">
            Update payment method, cancel/reactivate, and download invoices — all handled securely by Stripe.
          </p>
        </div>
      </section>
    </div>
  );
}