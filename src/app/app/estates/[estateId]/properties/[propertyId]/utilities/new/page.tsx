"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { safeJson } from "@/lib/utils";

interface PageProps {
  params: {
    estateId: string;
    propertyId: string;
  };
}

const UTILITY_TYPES = [
  "electric",
  "gas",
  "water",
  "trash",
  "internet",
  "security",
  "other",
];

const STATUS_OPTIONS = ["active", "pending", "closed"];

interface UtilityFormState {
  provider: string;
  type: string;
  accountNumber: string;
  billingName: string;
  phone: string;
  email: string;
  onlinePortalUrl: string;
  status: string;
  isAutoPay: boolean;
  notes: string;
}

type ApiErrorBody =
  | { ok?: boolean; error?: unknown; message?: unknown }
  | Record<string, unknown>
  | null;

function getErrorFromApiBody(body: ApiErrorBody): string | null {
  if (!body || typeof body !== "object") return null;

  const maybeOk = (body as { ok?: unknown }).ok;
  const maybeError = (body as { error?: unknown }).error;
  const maybeMessage = (body as { message?: unknown }).message;

  if (maybeOk === false) {
    if (typeof maybeError === "string" && maybeError.trim()) return maybeError;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) return maybeMessage;
  }

  if (typeof maybeError === "string" && maybeError.trim()) return maybeError;
  if (typeof maybeMessage === "string" && maybeMessage.trim()) return maybeMessage;

  return null;
}

function normalizeType(value: string): string {
  const v = value.trim().toLowerCase();
  return v.length > 0 ? v : "other";
}

function normalizeStatus(value: string): string {
  const v = value.trim().toLowerCase();
  return STATUS_OPTIONS.includes(v) ? v : "active";
}

function safeRedirectPath(estateId: string, propertyId: string): string {
  return `/app/estates/${encodeURIComponent(estateId)}/properties/${encodeURIComponent(propertyId)}/utilities`;
}

export default function AddUtilityAccountPage({ params }: PageProps) {
  const { estateId, propertyId } = params;
  const router = useRouter();

  const utilitiesHref = useMemo(
    () => safeRedirectPath(estateId, propertyId),
    [estateId, propertyId],
  );

  const [form, setForm] = useState<UtilityFormState>({
    provider: "",
    type: "",
    accountNumber: "",
    billingName: "",
    phone: "",
    email: "",
    onlinePortalUrl: "",
    status: "active",
    isAutoPay: false,
    notes: "",
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateField<K extends keyof UtilityFormState>(
    key: K,
    value: UtilityFormState[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/utilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estateId,
          propertyId,
          provider: form.provider.trim(),
          type: normalizeType(form.type),
          accountNumber: form.accountNumber.trim(),
          billingName: form.billingName.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          onlinePortalUrl: form.onlinePortalUrl.trim(),
          status: normalizeStatus(form.status),
          isAutoPay: form.isAutoPay,
          notes: form.notes.trim(),
        }),
      });

      const body = (await safeJson(res)) as ApiErrorBody;
      const apiError = getErrorFromApiBody(body);

      if (!res.ok || apiError) {
        throw new Error(apiError || `Request failed (${res.status})`);
      }

      router.push(utilitiesHref);
      router.refresh();
    } catch (err) {
      console.error("[AddUtilityAccountPage] Unable to create utility account", err);
      const message =
        err instanceof Error && err.message.trim().length > 0
          ? err.message
          : "We couldn’t save this utility account. Please try again.";

      setError(message);
      setTimeout(() => setError(null), 8000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="space-y-3">
        <nav className="text-xs text-slate-500">
          <Link
            href="/app/estates"
            className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
          >
            Estates
          </Link>
          <span className="mx-1 text-slate-600">/</span>
          <Link
            href={`/app/estates/${encodeURIComponent(estateId)}`}
            className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
          >
            Estate
          </Link>
          <span className="mx-1 text-slate-600">/</span>
          <Link
            href={`/app/estates/${encodeURIComponent(estateId)}/properties`}
            className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
          >
            Properties
          </Link>
          <span className="mx-1 text-slate-600">/</span>
          <Link
            href={`/app/estates/${encodeURIComponent(estateId)}/properties/${encodeURIComponent(propertyId)}`}
            className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
          >
            Property
          </Link>
          <span className="mx-1 text-slate-600">/</span>
          <Link
            href={utilitiesHref}
            className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
          >
            Utilities
          </Link>
          <span className="mx-1 text-slate-600">/</span>
          <span className="text-rose-300">New</span>
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <Link
              href={utilitiesHref}
              className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200"
            >
              <span aria-hidden="true">←</span>
              Back to utilities
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
              Add utility account
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1 text-xs text-slate-300">
              Utility account
            </span>
            <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-100">
              New
            </span>
          </div>
        </div>

        <p className="text-sm text-slate-400">
          Track electric, gas, water, internet, and other services so you can show the court every bill that stayed current during probate.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-xl border border-slate-800 bg-slate-900/70 p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-200">Account details</p>
          <p className="text-xs text-slate-500">Fields marked * are required</p>
        </div>

        {/* Provider + type */}
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">
              Provider name <span className="text-rose-400">*</span>
            </label>
            <input
              required
              className="w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
              placeholder="DTE Energy, LADWP, Comcast…"
              value={form.provider}
              onChange={(e) => updateField("provider", e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">
              Type <span className="text-rose-400">*</span>
            </label>
            <select
              required
              className="w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
              value={form.type}
              onChange={(e) => updateField("type", e.target.value)}
            >
              <option value="">Select type…</option>
              {UTILITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* Account identity */}
        <section className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1 sm:col-span-1">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">
              Account number
            </label>
            <input
              className="w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm font-mono text-slate-100 placeholder:text-slate-500 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
              placeholder="Acct #"
              value={form.accountNumber}
              onChange={(e) => updateField("accountNumber", e.target.value)}
            />
          </div>

          <div className="space-y-1 sm:col-span-1">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">
              Billing name
            </label>
            <input
              className="w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
              placeholder="Name on the bill"
              value={form.billingName}
              onChange={(e) => updateField("billingName", e.target.value)}
            />
          </div>

          <div className="space-y-1 sm:col-span-1">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">
              Status
            </label>
            <select
              className="w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
              value={form.status}
              onChange={(e) => updateField("status", e.target.value)}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* Contact & portal */}
        <section className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">
              Phone
            </label>
            <input
              className="w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
              placeholder="Customer service phone"
              value={form.phone}
              onChange={(e) => updateField("phone", e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">
              Email
            </label>
            <input
              type="email"
              className="w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
              placeholder="Contact email"
              value={form.email}
              onChange={(e) => updateField("email", e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">
              Online portal URL
            </label>
            <input
              type="url"
              className="w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
              placeholder="https://…"
              value={form.onlinePortalUrl}
              onChange={(e) =>
                updateField("onlinePortalUrl", e.target.value)
              }
            />
          </div>
        </section>

        {/* Autopay + notes */}
        <section className="space-y-3">
          <label className="inline-flex items-center gap-2 text-xs text-slate-200">
            <input
              type="checkbox"
              className="h-3 w-3 rounded border-slate-600 bg-slate-950 text-rose-500 focus:ring-rose-500"
              checked={form.isAutoPay}
              onChange={(e) => updateField("isAutoPay", e.target.checked)}
            />
            <span>Autopay is enabled for this account</span>
          </label>

          <div className="space-y-1">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">
              Notes
            </label>
            <textarea
              rows={4}
              className="w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
              placeholder="Anything the next PR or attorney should know about this account…"
              value={form.notes}
              onChange={(e) => updateField("notes", e.target.value)}
            />
          </div>
        </section>

        {error ? (
          <div
            role="alert"
            className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100"
          >
            <p className="font-medium">Couldn’t save utility account</p>
            <p className="mt-1 text-xs text-rose-200">{error}</p>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3 pt-2">
          <Link
            href={utilitiesHref}
            className="text-sm text-slate-400 hover:text-slate-200"
          >
            Cancel
          </Link>

          <button
            type="submit"
            disabled={saving}
            aria-busy={saving}
            className="inline-flex items-center justify-center rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="inline-flex items-center gap-2">
              {saving ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-white/80" aria-hidden="true" />
                  Saving…
                </span>
              ) : (
                "Save utility account"
              )}
            </span>
          </button>
        </div>
      </form>
    </div>
  );
}