"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import { getApiErrorMessage } from "@/lib/utils";

const invoiceTermsOptions: { value: string; label: string }[] = [
  { value: "DUE_ON_RECEIPT", label: "Due on receipt" },
  { value: "NET_15", label: "Net 15" },
  { value: "NET_30", label: "Net 30" },
  { value: "NET_45", label: "Net 45" },
  { value: "NET_60", label: "Net 60" },
];

type ApiResponse = { ok: boolean; error?: string };

type WorkspaceSettingsFormProps = {
  initial: {
    firmName: string;
    firmAddressLine1: string;
    firmAddressLine2: string;
    firmCity: string;
    firmState: string;
    firmPostalCode: string;
    firmCountry: string;
    defaultHourlyRateCents: number | null;
    defaultInvoiceTerms: string;
    defaultCurrency: string;
  };
};

export function WorkspaceSettingsForm({ initial }: WorkspaceSettingsFormProps) {
  const [firmName, setFirmName] = useState(initial.firmName);
  const [firmAddressLine1, setFirmAddressLine1] = useState(
    initial.firmAddressLine1,
  );
  const [firmAddressLine2, setFirmAddressLine2] = useState(
    initial.firmAddressLine2,
  );
  const [firmCity, setFirmCity] = useState(initial.firmCity);
  const [firmState, setFirmState] = useState(initial.firmState);
  const [firmPostalCode, setFirmPostalCode] = useState(
    initial.firmPostalCode,
  );
  const [firmCountry, setFirmCountry] = useState(initial.firmCountry);

  const [defaultHourlyRate, setDefaultHourlyRate] = useState(
    initial.defaultHourlyRateCents != null
      ? (initial.defaultHourlyRateCents / 100).toString()
      : "",
  );
  const [defaultInvoiceTerms, setDefaultInvoiceTerms] = useState(
    initial.defaultInvoiceTerms || "NET_30",
  );
  const [defaultCurrency, setDefaultCurrency] = useState(
    initial.defaultCurrency || "USD",
  );

  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isSaving = status === "saving";

  const resetFeedback = (): void => {
    if (status !== "idle") setStatus("idle");
    if (errorMessage) setErrorMessage(null);
  };

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setStatus("saving");
    setErrorMessage(null);

    const trimmedCurrency = defaultCurrency.trim().toUpperCase();
    if (trimmedCurrency.length !== 3) {
      setStatus("error");
      setErrorMessage("Currency must be a 3-letter ISO code (e.g., USD).");
      return;
    }

    const rateNumber =
      defaultHourlyRate.trim().length > 0
        ? Number.parseFloat(defaultHourlyRate)
        : null;

    if (rateNumber != null && !Number.isFinite(rateNumber)) {
      setStatus("error");
      setErrorMessage("Hourly rate must be a valid number.");
      return;
    }

    const payload = {
      firmName: firmName.trim() || null,
      firmAddressLine1: firmAddressLine1.trim() || null,
      firmAddressLine2: firmAddressLine2.trim() || null,
      firmCity: firmCity.trim() || null,
      firmState: firmState.trim() || null,
      firmPostalCode: firmPostalCode.trim() || null,
      firmCountry: firmCountry.trim() || null,
      defaultHourlyRateCents:
        rateNumber != null && Number.isFinite(rateNumber)
          ? Math.round(rateNumber * 100)
          : null,
      defaultInvoiceTerms,
      defaultCurrency: trimmedCurrency,
    };

    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await res.json().catch(() => null)) as ApiResponse | null;

      if (!res.ok || !data?.ok) {
        const apiMessage = await Promise.resolve(getApiErrorMessage(res));
        const msg = data?.error || apiMessage;
        setStatus("error");
        setErrorMessage(msg || "Failed to save settings.");
        return;
      }

      setStatus("saved");
    } catch {
      setStatus("error");
      setErrorMessage("Network error while saving settings.");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-busy={isSaving}
      className="space-y-8 rounded-lg border border-slate-800 bg-slate-900/60 p-4"
    >
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-100">Firm branding</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-300">
              Firm name
            </label>
            <input
              type="text"
              value={firmName}
              disabled={isSaving}
              onChange={(e) => {
                resetFeedback();
                setFirmName(e.target.value);
              }}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500"
              placeholder="Kofa Legal"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-300">
              Address line 1
            </label>
            <input
              type="text"
              value={firmAddressLine1}
              disabled={isSaving}
              onChange={(e) => {
                resetFeedback();
                setFirmAddressLine1(e.target.value);
              }}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500"
              placeholder="123 Main St"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-300">
              Address line 2
            </label>
            <input
              type="text"
              value={firmAddressLine2}
              disabled={isSaving}
              onChange={(e) => {
                resetFeedback();
                setFirmAddressLine2(e.target.value);
              }}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500"
              placeholder="Suite 400"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-300">City</label>
            <input
              type="text"
              value={firmCity}
              disabled={isSaving}
              onChange={(e) => {
                resetFeedback();
                setFirmCity(e.target.value);
              }}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500"
              placeholder="Los Angeles"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-300">
              State / Province
            </label>
            <input
              type="text"
              value={firmState}
              disabled={isSaving}
              onChange={(e) => {
                resetFeedback();
                setFirmState(e.target.value);
              }}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500"
              placeholder="CA"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-300">
              Postal code
            </label>
            <input
              type="text"
              value={firmPostalCode}
              disabled={isSaving}
              onChange={(e) => {
                resetFeedback();
                setFirmPostalCode(e.target.value);
              }}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500"
              placeholder="90001"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-300">Country</label>
            <input
              type="text"
              value={firmCountry}
              disabled={isSaving}
              onChange={(e) => {
                resetFeedback();
                setFirmCountry(e.target.value);
              }}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500"
              placeholder="United States"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-100">
          Billing defaults
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-300">
              Default hourly rate (USD)
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={defaultHourlyRate}
              disabled={isSaving}
              onChange={(e) => {
                resetFeedback();
                setDefaultHourlyRate(e.target.value);
              }}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500"
              placeholder="250"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-300">
              Default invoice terms
            </label>
            <select
              value={defaultInvoiceTerms}
              disabled={isSaving}
              onChange={(e) => {
                resetFeedback();
                setDefaultInvoiceTerms(e.target.value);
              }}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500"
            >
              {invoiceTermsOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-300">
              Currency
            </label>
            <input
              type="text"
              value={defaultCurrency}
              disabled={isSaving}
              onChange={(e) => {
                resetFeedback();
                setDefaultCurrency(e.target.value.toUpperCase());
              }}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500"
              placeholder="USD"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-slate-500">
          <div role="status" aria-live="polite" className="text-xs">
            {status === "saved" && (
              <span className="text-emerald-400">
                Settings saved successfully.
              </span>
            )}
            {status === "error" && errorMessage && (
              <span role="alert" className="text-red-400">
                {errorMessage}
              </span>
            )}
          </div>
        </div>
        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex items-center rounded-md border border-sky-600 bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}