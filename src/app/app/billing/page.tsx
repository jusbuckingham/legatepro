"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

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
] as const;

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

type ApiOk<T> = { ok: true; data: T };
type ApiErr = { ok: false; error?: string; code?: string };

type Banner =
  | { kind: "success"; title: string; message?: string }
  | { kind: "warning"; title: string; message?: string }
  | { kind: "error"; title: string; message?: string };

type Toast = {
  kind: "success" | "warning" | "error";
  message: string;
};

async function fetchBilling(): Promise<BillingSnapshot> {
  const res = await fetch("/api/billing", {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const json = (await res.json()) as ApiOk<BillingSnapshot> | ApiErr;
  if (!res.ok || !json?.ok) {
    throw new Error((json as ApiErr)?.error || "Failed to load billing");
  }
  return (json as ApiOk<BillingSnapshot>).data;
}

async function startCheckout(planId: string): Promise<string> {
  const res = await fetch("/api/billing", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ planId }),
  });

  const json = (await res.json()) as ApiOk<{ url: string }> | ApiErr;
  if (!res.ok || !json?.ok || !(json as ApiOk<{ url: string }>).data?.url) {
    throw new Error((json as ApiErr)?.error || "Failed to start checkout");
  }
  return (json as ApiOk<{ url: string }>).data.url;
}

async function startPortal(): Promise<string> {
  const res = await fetch("/api/billing/portal", {
    method: "POST",
    headers: { Accept: "application/json" },
  });

  const json = (await res.json()) as ApiOk<{ url: string }> | ApiErr;
  if (!res.ok || !json?.ok || !(json as ApiOk<{ url: string }>).data?.url) {
    throw new Error((json as ApiErr)?.error || "Failed to open portal");
  }
  return (json as ApiOk<{ url: string }>).data.url;
}

function normalizeStatus(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim().toLowerCase();
  return s || "unknown";
}

function statusLabel(status: string): string {
  switch (status) {
    case "active":
      return "Active";
    case "trialing":
      return "Trial";
    case "past_due":
      return "Past due";
    case "canceled":
      return "Canceled";
    case "incomplete":
      return "Incomplete";
    case "unpaid":
      return "Unpaid";
    case "paused":
      return "Paused";
    case "inactive":
      return "Inactive";
    default:
      return "Unknown";
  }
}

function statusBadgeClass(status: string): string {
  if (status === "active" || status === "trialing") {
    return "border-emerald-500/30 bg-emerald-950/30 text-emerald-200";
  }
  if (status === "past_due" || status === "unpaid" || status === "incomplete") {
    return "border-amber-500/30 bg-amber-950/30 text-amber-200";
  }
  if (status === "canceled") {
    return "border-slate-700 bg-slate-950/40 text-slate-300";
  }
  return "border-slate-700 bg-slate-950/40 text-slate-300";
}

function BannerBox({
  banner,
  onDismiss,
}: {
  banner: Banner;
  onDismiss?: () => void;
}) {
  const base = "rounded-md border p-3 text-sm";
  const cls =
    banner.kind === "success"
      ? "border-emerald-500/30 bg-emerald-950/30 text-emerald-100"
      : banner.kind === "warning"
        ? "border-amber-500/30 bg-amber-950/30 text-amber-100"
        : "border-red-500/30 bg-red-950/30 text-red-200";

  return (
    <div className={`${base} ${cls}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">{banner.title}</div>
          {banner.message ? (
            <div className="mt-0.5 text-xs opacity-90">{banner.message}</div>
          ) : null}
        </div>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded px-2 py-1 text-xs hover:bg-white/5"
            aria-label="Dismiss"
          >
            ✕
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ToastBar({ toast }: { toast: Toast }) {
  const base = "fixed bottom-4 right-4 z-50 max-w-sm rounded-md border px-3 py-2 text-xs shadow-lg";
  const cls =
    toast.kind === "success"
      ? "border-emerald-500/30 bg-emerald-950/90 text-emerald-100"
      : toast.kind === "warning"
        ? "border-amber-500/30 bg-amber-950/90 text-amber-100"
        : "border-red-500/30 bg-red-950/90 text-red-200";

  return (
    <div role="status" aria-live="polite" className={`${base} ${cls}`}>
      {toast.message}
    </div>
  );
}

export default function BillingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [snapshot, setSnapshot] = useState<BillingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);
  const [busyPortal, setBusyPortal] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchBilling();
      setSnapshot(data);
    } catch (e) {
      setBanner({
        kind: "error",
        title: "Billing unavailable",
        message: e instanceof Error ? e.message : "Failed to load billing",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const showToast = useCallback((t: Toast) => {
    setToast(t);
    window.setTimeout(() => setToast(null), 4500);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Post-checkout return UX
  useEffect(() => {
    const success = searchParams.get("success");
    const canceled = searchParams.get("canceled");

    if (success === "1") {
      setBanner({
        kind: "success",
        title: "You’re all set",
        message: "Subscription update received. Refreshing your plan status…",
      });
      showToast({ kind: "success", message: "✅ Plan updated — verifying with Stripe…" });
      void load();
      router.replace("/app/billing");
      return;
    }

    if (canceled === "1") {
      setBanner({
        kind: "warning",
        title: "Checkout canceled",
        message: "No charges were made. You can upgrade any time.",
      });
      showToast({ kind: "warning", message: "Checkout canceled — no charges were made." });
      router.replace("/app/billing");
    }
  }, [load, router, searchParams, showToast]);

  const currentPlanId = snapshot?.subscription?.planId ?? "free";
  const currentPlanLabel = useMemo(() => {
    return (PLANS.find((p) => p.id === currentPlanId) ?? PLANS[0]).name;
  }, [currentPlanId]);

  const subStatus = normalizeStatus(snapshot?.subscription?.status);

  const portalCtaLabel = useMemo(() => {
    if (!snapshot) return "Open Stripe portal";
    if (subStatus === "past_due" || subStatus === "unpaid" || subStatus === "incomplete") {
      return "Fix payment";
    }
    return "Manage subscription";
  }, [snapshot, subStatus]);

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      {toast ? <ToastBar toast={toast} /> : null}
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold text-slate-50">
            Billing &amp; Subscription
          </h1>
          <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950/40 px-2 py-0.5 text-[11px] font-medium text-slate-300">
            Current: {currentPlanLabel}
          </span>
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass(
              subStatus,
            )}`}
            title={`Subscription status: ${subStatus}`}
          >
            {statusLabel(subStatus)}
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

      {banner ? <BannerBox banner={banner} onDismiss={() => setBanner(null)} /> : null}

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
                        setBanner(null);
                        setBusyPlanId(plan.id);
                        const url = await startCheckout(plan.id);
                        window.location.assign(url);
                      } catch (e) {
                        setBanner({
                          kind: "error",
                          title: "Checkout failed",
                          message: e instanceof Error ? e.message : "Unable to start checkout",
                        });
                        showToast({ kind: "error", message: "Checkout failed — please try again." });
                      } finally {
                        setBusyPlanId(null);
                      }
                    }}
                    className="w-full rounded-md bg-[#F15A43] px-3 py-2 text-xs font-semibold text-black hover:bg-[#f26b56] disabled:opacity-60"
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
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Customer portal</h2>
            <p className="mt-1 text-xs text-slate-400">
              Update payment methods, cancel subscriptions, and download invoices.
            </p>
          </div>

          <button
            type="button"
            disabled={!snapshot || busyPortal}
            onClick={async () => {
              try {
                setBanner(null);
                setBusyPortal(true);
                const url = await startPortal();
                window.location.assign(url);
              } catch (e) {
                setBanner({
                  kind: "error",
                  title: "Portal unavailable",
                  message: e instanceof Error ? e.message : "Unable to open portal",
                });
                showToast({ kind: "error", message: "Unable to open Stripe portal." });
              } finally {
                setBusyPortal(false);
              }
            }}
            className="mt-1 inline-flex items-center justify-center rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busyPortal ? "Opening…" : portalCtaLabel}
          </button>
        </div>

        {!snapshot ? (
          <p className="mt-3 text-[11px] text-slate-500">
            Billing isn’t configured yet for this environment, or your account hasn’t been initialized.
          </p>
        ) : null}
      </section>
    </div>
  );
}