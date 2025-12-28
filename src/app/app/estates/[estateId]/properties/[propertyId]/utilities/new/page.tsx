"use client";

import { useState, FormEvent } from "react";
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

export default function AddUtilityAccountPage({ params }: PageProps) {
  const { estateId, propertyId } = params;
  const router = useRouter();

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
          type: form.type || "other",
          accountNumber: form.accountNumber.trim(),
          billingName: form.billingName.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          onlinePortalUrl: form.onlinePortalUrl.trim(),
          status: form.status,
          isAutoPay: form.isAutoPay,
          notes: form.notes.trim(),
        }),
      });

      const body = (await safeJson(res)) as ApiErrorBody;
      const apiError = getErrorFromApiBody(body);

      if (!res.ok || apiError) {
        throw new Error(apiError || `Request failed (${res.status})`);
      }

      router.push(
        `/app/estates/${estateId}/properties/${propertyId}/utilities`
      );
      router.refresh();
    } catch (err) {
      console.error("Unable to create utility account:", err);
      setError(
        err instanceof Error ? err.message : "Unable to create utility account"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <Link
              href={`/app/estates/${estateId}/properties/${propertyId}/utilities`}
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
              Property utilities
            </span>
          </div>
        </div>

        <p className="text-sm text-slate-400">
          Capture electric, gas, water, internet, and other services so you can
          show the court every bill that was kept current during probate.
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
              Type
            </label>
            <select
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

        {error && (
          <p className="text-sm text-rose-300" role="alert">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-3 pt-2">
          <Link
            href={`/app/estates/${estateId}/properties/${propertyId}/utilities`}
            className="text-sm text-slate-400 hover:text-slate-200"
          >
            Cancel
          </Link>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save utility account"}
          </button>
        </div>
      </form>
    </div>
  );
}