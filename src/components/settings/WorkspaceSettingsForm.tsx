"use client";

import { useCallback, useState } from "react";
import type { FormEvent } from "react";

import { getApiErrorMessage } from "@/lib/utils";

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

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

  const trimOnBlur = useCallback(
    (value: string, setter: (next: string) => void) => {
      const trimmed = value.trim();
      if (trimmed !== value) setter(trimmed);
    },
    [],
  );

  const trimUpperOnBlur = useCallback(
    (value: string, setter: (next: string) => void) => {
      const next = value.trim().toUpperCase();
      if (next !== value) setter(next);
    },
    [],
  );

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
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify(payload),
      });

      const data = (await res.json().catch(() => null)) as ApiResponse | null;

      if (!res.ok || !data?.ok) {
        const apiMessage = await getApiErrorMessage(res);
        const msg = (typeof data?.error === "string" ? data.error : "") || apiMessage;
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
      aria-describedby="workspace-settings-feedback"
      className="space-y-8 rounded-lg border border-slate-800 bg-slate-900/60 p-4"
    >
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-100">Firm branding</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="firmName" className="text-xs font-medium text-slate-300">
              Firm name
            </label>
            <input
              id="firmName"
              type="text"
              value={firmName}
              disabled={isSaving}
              onChange={(e) => {
                resetFeedback();
                setFirmName(e.target.value);
              }}
              onBlur={() => trimOnBlur(firmName, setFirmName)}
              className={cx(
                "w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
              )}
              placeholder="Kofa Legal"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="firmAddressLine1" className="text-xs font-medium text-slate-300">
              Address line 1
            </label>
            <input
              id="firmAddressLine1"
              autoComplete="address-line1"
              type="text"
              value={firmAddressLine1}
              disabled={isSaving}
              onChange={(e) => {
                resetFeedback();
                setFirmAddressLine1(e.target.value);
              }}
              onBlur={() => trimOnBlur(firmAddressLine1, setFirmAddressLine1)}
              className={cx(
                "w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
              )}
              placeholder="123 Main St"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="firmAddressLine2" className="text-xs font-medium text-slate-300">
              Address line 2
            </label>
            <input
              id="firmAddressLine2"
              autoComplete="address-line2"
              type="text"
              value={firmAddressLine2}
              disabled={isSaving}
              onChange={(e) => {
                resetFeedback();
                setFirmAddressLine2(e.target.value);
              }}
              onBlur={() => trimOnBlur(firmAddressLine2, setFirmAddressLine2)}
              className={cx(
                "w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
              )}
              placeholder="Suite 400"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="firmCity" className="text-xs font-medium text-slate-300">City</label>
            <input
              id="firmCity"
              autoComplete="address-level2"
              type="text"
              value={firmCity}
              disabled={isSaving}
              onChange={(e) => {
                resetFeedback();
                setFirmCity(e.target.value);
              }}
              onBlur={() => trimOnBlur(firmCity, setFirmCity)}
              className={cx(
                "w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
              )}
              placeholder="Los Angeles"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="firmState" className="text-xs font-medium text-slate-300">
              State / Province
            </label>
            <input
              id="firmState"
              autoComplete="address-level1"
              type="text"
              value={firmState}
              disabled={isSaving}
              onChange={(e) => {
                resetFeedback();
                setFirmState(e.target.value);
              }}
              onBlur={() => trimOnBlur(firmState, setFirmState)}
              className={cx(
                "w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
              )}
              placeholder="CA"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="firmPostalCode" className="text-xs font-medium text-slate-300">
              Postal code
            </label>
            <input
              id="firmPostalCode"
              autoComplete="postal-code"
              type="text"
              value={firmPostalCode}
              disabled={isSaving}
              onChange={(e) => {
                resetFeedback();
                setFirmPostalCode(e.target.value);
              }}
              onBlur={() => trimOnBlur(firmPostalCode, setFirmPostalCode)}
              className={cx(
                "w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
              )}
              placeholder="90001"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="firmCountry" className="text-xs font-medium text-slate-300">Country</label>
            <input
              id="firmCountry"
              autoComplete="country-name"
              type="text"
              value={firmCountry}
              disabled={isSaving}
              onChange={(e) => {
                resetFeedback();
                setFirmCountry(e.target.value);
              }}
              onBlur={() => trimOnBlur(firmCountry, setFirmCountry)}
              className={cx(
                "w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
              )}
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
            <label htmlFor="defaultHourlyRate" className="text-xs font-medium text-slate-300">
              Default hourly rate (USD)
            </label>
            <input
              id="defaultHourlyRate"
              inputMode="decimal"
              autoComplete="off"
              type="number"
              min={0}
              step="0.01"
              value={defaultHourlyRate}
              disabled={isSaving}
              onChange={(e) => {
                resetFeedback();
                setDefaultHourlyRate(e.target.value);
              }}
              onBlur={() => trimOnBlur(defaultHourlyRate, setDefaultHourlyRate)}
              className={cx(
                "w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
              )}
              placeholder="250"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="defaultInvoiceTerms" className="text-xs font-medium text-slate-300">
              Default invoice terms
            </label>
            <select
              id="defaultInvoiceTerms"
              value={defaultInvoiceTerms}
              disabled={isSaving}
              onChange={(e) => {
                resetFeedback();
                setDefaultInvoiceTerms(e.target.value);
              }}
              className={cx(
                "w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
              )}
            >
              {invoiceTermsOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="defaultCurrency" className="text-xs font-medium text-slate-300">
              Currency
            </label>
            <input
              id="defaultCurrency"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              maxLength={3}
              type="text"
              value={defaultCurrency}
              disabled={isSaving}
              aria-describedby="currency-help"
              onChange={(e) => {
                resetFeedback();
                setDefaultCurrency(e.target.value);
              }}
              onBlur={() => trimUpperOnBlur(defaultCurrency, setDefaultCurrency)}
              className={cx(
                "w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
              )}
              placeholder="USD"
            />
            <p id="currency-help" className="text-[11px] text-slate-500">
              3-letter ISO code (e.g., USD, EUR).
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-slate-500">
          <div id="workspace-settings-feedback" aria-live="polite" className="text-xs">
            {status === "saved" && (
              <span role="status" aria-live="polite" className="text-emerald-400">
                Settings saved successfully.
              </span>
            )}
            {status === "error" && errorMessage && (
              <span role="alert" aria-live="assertive" className="text-red-400">
                {errorMessage}
              </span>
            )}
          </div>
        </div>
        <button
          type="submit"
          disabled={isSaving}
          className={cx(
            "inline-flex items-center rounded-md border border-sky-600 bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
          )}
        >
          {isSaving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}