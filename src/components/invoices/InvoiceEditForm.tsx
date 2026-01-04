"use client";

import { useMemo, useState } from "react";
import type { FormEventHandler } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getApiErrorMessage } from "@/lib/utils";

type InvoiceStatus = "DRAFT" | "SENT" | "UNPAID" | "PARTIAL" | "PAID" | "VOID";

type InvoiceEditLineItem = {
  id?: string;
  label: string;
  type: "FEE" | "COST" | "EXPENSE" | "TIME";
  quantity?: number | null;
  rateCents?: number | null;
  amountCents?: number | null;
  /**
   * UX-only flag: if true, we will not overwrite amountCents when quantity/rate changes.
   * Never send this to the API.
   */
  _isAmountManual?: boolean;
};

type InvoiceEditFormProps = {
  invoiceId: string;
  estateId: string;
  initialStatus: InvoiceStatus;
  initialIssueDate?: string | null;
  initialDueDate?: string | null;
  initialNotes?: string | null;
  initialCurrency?: string | null;
  initialLineItems: InvoiceEditLineItem[];
};

function formatCentsToDollarsDisplay(cents: number | null | undefined): string {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "";
  return (cents / 100).toFixed(2);
}

function parseDollarsToCents(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Allow common user input: "$1,234.56" or "1 234.56".
  const cleaned = trimmed.replace(/[^0-9.-]/g, "");
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return null;

  // Clamp negatives to 0 for safety.
  return Math.max(0, Math.round(parsed * 100));
}

function formatDateForInput(value?: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}


function clampNonNegativeNumber(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value;
}

function deriveAmountCents(quantity: number | null | undefined, rateCents: number | null | undefined): number | null {
  if (typeof quantity !== "number" || !Number.isFinite(quantity)) return null;
  if (typeof rateCents !== "number" || !Number.isFinite(rateCents)) return null;
  return Math.round(clampNonNegativeNumber(quantity) * clampNonNegativeNumber(rateCents));
}


export function InvoiceEditForm({
  invoiceId,
  estateId,
  initialStatus,
  initialIssueDate,
  initialDueDate,
  initialNotes,
  initialCurrency,
  initialLineItems,
}: InvoiceEditFormProps) {
  const router = useRouter();

  const [status, setStatus] = useState<InvoiceStatus>(initialStatus);
  const [issueDate, setIssueDate] = useState<string>(formatDateForInput(initialIssueDate));
  const [dueDate, setDueDate] = useState<string>(formatDateForInput(initialDueDate));
  const [notes, setNotes] = useState<string>(initialNotes ?? "");
  const [currency, setCurrency] = useState<string>(initialCurrency ?? "USD");
  const [lineItems, setLineItems] = useState<InvoiceEditLineItem[]>(
    initialLineItems.length > 0
      ? initialLineItems
      : [
          {
            label: "",
            type: "FEE",
            quantity: 1,
            rateCents: null,
            amountCents: null,
          },
        ],
  );

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [currencyError, setCurrencyError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);

  const resetFieldErrors = (): void => {
    if (currencyError) setCurrencyError(null);
    if (dateError) setDateError(null);
  };

  const clearSaveError = (): void => {
    if (saveError) setSaveError(null);
    resetFieldErrors();
  };

  const fireToast = (detail: { type: "success" | "error"; message: string }): void => {
    if (typeof window === "undefined") return;
    // Best-effort: ToastHost in this repo listens to a window event.
    // If no listener is present, this is a harmless no-op.
    window.dispatchEvent(new CustomEvent("toast", { detail }));
  };

  const subtotalCents = useMemo(() => {
    return lineItems.reduce((acc, item) => {
      const amount = typeof item.amountCents === "number" ? item.amountCents : 0;
      return acc + (Number.isFinite(amount) ? amount : 0);
    }, 0);
  }, [lineItems]);

  const subtotalDisplay = useMemo(() => formatCentsToDollarsDisplay(subtotalCents), [subtotalCents]);


  const handleLineItemChange = <K extends keyof InvoiceEditLineItem>(
    index: number,
    field: K,
    value: InvoiceEditLineItem[K],
  ) => {
    setLineItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      const updated = next[index];
      const qty = typeof updated.quantity === "number" ? updated.quantity : null;
      const rate = typeof updated.rateCents === "number" ? updated.rateCents : null;

      // If the user hasn't manually set the amount, derive it from quantity + rate.
      if ((field === "quantity" || field === "rateCents") && updated._isAmountManual !== true) {
        const derived = deriveAmountCents(qty, rate);
        if (derived !== null) {
          next[index] = { ...updated, amountCents: derived };
        }
      }
      return next;
    });
  };

  const handleLineItemAmountChange = (index: number, value: string) => {
    const cents = parseDollarsToCents(value);
    // Mark manual if user typed anything (including clearing to blank).
    setLineItems((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      next[index] = {
        ...current,
        amountCents: cents,
        _isAmountManual: true,
      };
      return next;
    });
  };

  const handleLineItemAutoCalc = (index: number) => {
    clearSaveError();
    setLineItems((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;

      const qty = typeof current.quantity === "number" ? current.quantity : null;
      const rate = typeof current.rateCents === "number" ? current.rateCents : null;
      const derived = deriveAmountCents(qty, rate);
      if (derived === null) return prev;

      next[index] = {
        ...current,
        amountCents: derived,
        _isAmountManual: false,
      };
      return next;
    });
  };

  const handleLineItemRateChange = (index: number, value: string) => {
    const cents = parseDollarsToCents(value);
    handleLineItemChange(index, "rateCents", cents);
  };

  const addLineItem = () => {
    clearSaveError();
    setLineItems((prev) => [
      ...prev,
      {
        label: "",
        type: "FEE",
        quantity: 1,
        rateCents: null,
        amountCents: null,
        _isAmountManual: false,
      },
    ]);
  };

  const removeLineItem = (index: number) => {
    clearSaveError();
    setLineItems((prev) => {
      if (prev.length === 1) {
        // Keep at least one row so the form is not empty
        return [
          {
            label: "",
            type: "FEE",
            quantity: 1,
            rateCents: null,
            amountCents: null,
            _isAmountManual: false,
          },
        ];
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const hasAtLeastOneMeaningfulLine = useMemo(() => {
    return lineItems.some((li) => {
      const labelOk = li.label.trim().length > 0;
      const amt = typeof li.amountCents === "number" ? li.amountCents : 0;
      return labelOk || amt > 0;
    });
  }, [lineItems]);

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    if (isSaving) return;

    // Reset field-level feedback on each submit attempt.
    resetFieldErrors();

    const trimmedCurrency = currency.trim().toUpperCase();
    if (trimmedCurrency.length !== 3) {
      const message = "Currency must be a 3-letter ISO code (e.g., USD).";
      setCurrencyError(message);
      setSaveError(message);
      fireToast({ type: "error", message });
      return;
    }

    // Basic guard: if both dates exist, due date should not be before issue date.
    if (issueDate && dueDate && dueDate < issueDate) {
      const message = "Due date cannot be before issue date.";
      setDateError(message);
      setSaveError(message);
      fireToast({ type: "error", message });
      return;
    }

    if (!hasAtLeastOneMeaningfulLine) {
      const message = "Add at least one line item (label or amount) before saving.";
      setSaveError(message);
      fireToast({ type: "error", message });
      return;
    }

    setSaveError(null);
    setIsSaving(true);

    try {
      const normalizedLineItems = lineItems
        .map((item) => {
          const quantityRaw = typeof item.quantity === "number" && Number.isFinite(item.quantity) ? item.quantity : 0;
          const rateRaw = typeof item.rateCents === "number" && Number.isFinite(item.rateCents) ? item.rateCents : 0;
          const amountRaw = typeof item.amountCents === "number" && Number.isFinite(item.amountCents) ? item.amountCents : 0;

          const quantity = clampNonNegativeNumber(quantityRaw);
          const rateCents = clampNonNegativeNumber(rateRaw);
          const amountCents = clampNonNegativeNumber(amountRaw);

          return {
            id: item.id,
            label: item.label.trim(),
            type: item.type,
            quantity,
            rateCents,
            amountCents,
          };
        })
        // Don’t send blank rows (keeps API clean and avoids accidentally saving empty items)
        .filter((li) => li.label.trim().length > 0 || li.amountCents > 0);

      if (normalizedLineItems.length === 0) {
        const message = "Add at least one line item (label or amount) before saving.";
        setSaveError(message);
        fireToast({ type: "error", message });
        return;
      }

      const response: Response = await fetch(`/api/invoices/${invoiceId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status,
          issueDate: issueDate || undefined,
          dueDate: dueDate || undefined,
          notes: notes.trim() || undefined,
          currency: trimmedCurrency,
          lineItems: normalizedLineItems,
        }),
      });

      // Prefer JSON contract ({ ok:true, ... } / { ok:false, error }) and fall back to readable text.
      const responseForError = response.clone();

      type ApiResponse = { ok?: boolean; error?: string };
      const data = (await response.json().catch(() => null)) as ApiResponse | null;

      // Standard contract: all handlers respond with { ok: true, ... } or { ok:false, error }
      if (!response.ok || data?.ok !== true) {
        const apiMessage = await Promise.resolve(getApiErrorMessage(responseForError));
        const message = data?.error || apiMessage || "Failed to save invoice.";
        setSaveError(message);
        fireToast({ type: "error", message });
        return;
      }

      // Redirect back to invoice detail page inside the app
      fireToast({ type: "success", message: "Invoice saved." });
      router.push(
        `/app/estates/${encodeURIComponent(estateId)}/invoices/${encodeURIComponent(invoiceId)}?saved=1`
      );
      router.refresh();
    } catch (err) {
      console.error(err);
      const message = "Unexpected error while saving invoice.";
      setSaveError(message);
      fireToast({ type: "error", message });
    } finally {
      setIsSaving(false);
    }
  };

  const canSubmit = !isSaving && hasAtLeastOneMeaningfulLine;

  return (
    <form
      onSubmit={handleSubmit}
      aria-busy={isSaving}
      className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/70 p-4"
    >
      {saveError && (
        <div
          role="alert"
          aria-live="assertive"
          className="flex items-start justify-between gap-3 rounded-md border border-red-500/60 bg-red-900/30 px-3 py-2 text-xs text-red-100"
        >
          <span>{saveError}</span>
          <button
            type="button"
            onClick={clearSaveError}
            className="shrink-0 rounded-md border border-red-400/40 bg-red-950/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-red-100 hover:bg-red-950/35"
            aria-label="Dismiss error"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="status" className="text-xs font-medium text-slate-300">
            Status
          </label>
          <select
            id="status"
            value={status}
            onChange={(event) => {
              clearSaveError();
              setStatus(event.target.value as InvoiceStatus);
            }}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
            disabled={isSaving}
          >
            <option value="DRAFT">Draft</option>
            <option value="SENT">Sent</option>
            <option value="UNPAID">Unpaid</option>
            <option value="PARTIAL">Partial</option>
            <option value="PAID">Paid</option>
            <option value="VOID">Void</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="issueDate" className="text-xs font-medium text-slate-300">
            Issue date
          </label>
          <input
            id="issueDate"
            type="date"
            value={issueDate}
            onChange={(event) => {
              clearSaveError();
              if (dateError) setDateError(null);
              setIssueDate(event.target.value);
            }}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
            disabled={isSaving}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="dueDate" className="text-xs font-medium text-slate-300">
            Due date
          </label>
          <input
            id="dueDate"
            type="date"
            value={dueDate}
            onChange={(event) => {
              clearSaveError();
              if (dateError) setDateError(null);
              setDueDate(event.target.value);
            }}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
            disabled={isSaving}
          />
          <p className="mt-1 text-[11px] text-slate-500">
            If left blank, your workspace invoice terms (for example, NET 30) will be applied automatically where
            possible.
          </p>
          {dateError && (
            <p className="text-[11px] text-red-300" role="alert">
              {dateError}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="currency" className="text-xs font-medium text-slate-300">
          Currency
        </label>
        <input
          id="currency"
          type="text"
          value={currency}
          onChange={(event) => {
            clearSaveError();
            if (currencyError) setCurrencyError(null);
            setCurrency(event.target.value.toUpperCase().slice(0, 3));
          }}
          className="max-w-[120px] rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
          disabled={isSaving}
          inputMode="text"
          autoComplete="off"
          maxLength={3}
          aria-invalid={currencyError ? true : undefined}
        />
        <p className="text-[11px] text-slate-500">Typically USD, but you can set another currency if needed.</p>
        {currencyError && (
          <p className="text-[11px] text-red-300" role="alert">
            {currencyError}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Line items</h2>
          <button
            type="button"
            onClick={addLineItem}
            className="inline-flex items-center rounded-md border border-slate-700 px-2 py-1 text-[11px] font-medium text-slate-100 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSaving}
          >
            + Add line item
          </button>
        </div>

        <div className="space-y-2">
          {lineItems.map((item, index) => (
            <div
              key={item.id ?? index}
              className="flex flex-col gap-2 rounded-md border border-slate-800 bg-slate-900/60 p-3"
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 space-y-1">
                  <label
                    htmlFor={`line-${index}-label`}
                    className="text-[11px] font-medium text-slate-300"
                  >
                    Label
                  </label>
                  <input
                    id={`line-${index}-label`}
                    type="text"
                    value={item.label}
                    onChange={(event) => {
                      clearSaveError();
                      handleLineItemChange(index, "label", event.target.value);
                    }}
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    placeholder="For example, probate hearing preparation, rent collection, filing fee"
                    disabled={isSaving}
                  />
                </div>

                <div className="w-32 space-y-1">
                  <label
                    htmlFor={`line-${index}-type`}
                    className="text-[11px] font-medium text-slate-300"
                  >
                    Type
                  </label>
                  <select
                    id={`line-${index}-type`}
                    value={item.type}
                    onChange={(event) => {
                      clearSaveError();
                      handleLineItemChange(index, "type", event.target.value as InvoiceEditLineItem["type"]);
                    }}
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    disabled={isSaving}
                  >
                    <option value="FEE">Fee</option>
                    <option value="TIME">Time</option>
                    <option value="EXPENSE">Expense</option>
                    <option value="COST">Cost</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-3">
                <div className="space-y-1">
                  <label
                    htmlFor={`line-${index}-quantity`}
                    className="text-[11px] font-medium text-slate-300"
                  >
                    Quantity
                  </label>
                  <input
                    id={`line-${index}-quantity`}
                    type="number"
                    min="0"
                    step="0.25"
                    value={typeof item.quantity === "number" ? item.quantity : ""}
                    onChange={(event) => {
                      clearSaveError();
                      handleLineItemChange(
                        index,
                        "quantity",
                        event.target.value === "" ? null : Number.parseFloat(event.target.value),
                      );
                    }}
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    placeholder="For example, 1, 2.5, 10"
                    disabled={isSaving}
                    inputMode="decimal"
                  />
                  <p className="text-[10px] text-slate-500">Hours, units, or quantity depending on the item type.</p>
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor={`line-${index}-rate`}
                    className="text-[11px] font-medium text-slate-300"
                  >
                    Rate
                  </label>
                  <input
                    id={`line-${index}-rate`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={formatCentsToDollarsDisplay(item.rateCents)}
                    onChange={(event) => {
                      clearSaveError();
                      handleLineItemRateChange(index, event.target.value);
                    }}
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    placeholder="For example, 250.00"
                    disabled={isSaving}
                    inputMode="decimal"
                  />
                  <p className="text-[10px] text-slate-500">
                    Optional. If set along with quantity, the amount can be derived automatically.
                  </p>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor={`line-${index}-amount`}
                      className="text-[11px] font-medium text-slate-300"
                    >
                      Amount
                    </label>
                    {item._isAmountManual === true &&
                    typeof item.quantity === "number" &&
                    typeof item.rateCents === "number" ? (
                      <button
                        type="button"
                        onClick={() => handleLineItemAutoCalc(index)}
                        disabled={isSaving}
                        className="text-[10px] font-semibold text-slate-300 hover:text-slate-100 disabled:opacity-60"
                        title="Recalculate amount from quantity × rate"
                      >
                        Auto-calc
                      </button>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      id={`line-${index}-amount`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={formatCentsToDollarsDisplay(item.amountCents)}
                      onChange={(event) => {
                        clearSaveError();
                        handleLineItemAmountChange(index, event.target.value);
                      }}
                      className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      placeholder="For example, 500.00"
                      disabled={isSaving}
                      inputMode="decimal"
                    />
                    <button
                      type="button"
                      onClick={() => removeLineItem(index)}
                      className="inline-flex items-center rounded-md border border-red-700 px-2 py-1 text-[11px] text-red-200 hover:bg-red-900/40 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isSaving || lineItems.length <= 1}
                    >
                      Remove
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500">Total for this line item, in {currency}.</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-slate-800 pt-3 text-sm">
          <span className="text-xs uppercase tracking-wide text-slate-400">Subtotal</span>
          <span className="font-semibold text-slate-100">
            {currency.trim().toUpperCase()} {subtotalDisplay || "0.00"}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="notes" className="text-xs font-medium text-slate-300">
          Memo / description
        </label>
        <textarea
          id="notes"
          rows={4}
          value={notes}
          onChange={(event) => {
            clearSaveError();
            setNotes(event.target.value);
          }}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
          placeholder="Describe the work performed, services rendered, or the purpose of this invoice."
          disabled={isSaving}
        />
        <p className="text-[11px] text-slate-500">
          This appears on the invoice and helps you quickly recognize what was billed.
        </p>
      </div>

      <div className="flex flex-col-reverse items-stretch justify-between gap-2 pt-2 sm:flex-row sm:items-center">
        <Link
          href={`/app/estates/${encodeURIComponent(estateId)}/invoices/${encodeURIComponent(invoiceId)}`}
          className="inline-flex items-center justify-center rounded-md border border-slate-700 bg-slate-950/40 px-4 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-900/50"
        >
          Cancel
        </Link>

        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center justify-center rounded-md bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
          aria-busy={isSaving}
        >
          {isSaving ? "Saving…" : canSubmit ? "Save invoice" : "Add a line item to save"}
        </button>
      </div>
    </form>
  );
}
