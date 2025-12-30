"use client";

import React, { useEffect, useMemo, useState } from "react";
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
  if (typeof cents !== "number" || Number.isNaN(cents)) return "";
  return (cents / 100).toFixed(2);
}

function parseDollarsToCents(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const cleaned = trimmed.replace(/[,$]/g, "");
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100);
}

function formatDateForInput(value?: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

function clampNonNegativeNumber(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value;
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

  const subtotalCents = useMemo(() => {
    return lineItems.reduce((acc, item) => {
      const amount = typeof item.amountCents === "number" ? item.amountCents : 0;
      return acc + (Number.isFinite(amount) ? amount : 0);
    }, 0);
  }, [lineItems]);

  const subtotalDisplay = useMemo(() => formatCentsToDollarsDisplay(subtotalCents), [subtotalCents]);

  useEffect(() => {
    // Clear any prior banner only when the user changes inputs.
    // Using the functional form avoids clearing immediately after an error is set.
    setSaveError((prev) => (prev ? null : prev));
  }, [status, issueDate, dueDate, notes, currency, lineItems]);

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
      const amt = typeof updated.amountCents === "number" ? updated.amountCents : null;

      // If quantity+rate are set and amount isn't, derive it.
      if (
        (field === "quantity" || field === "rateCents") &&
        qty !== null &&
        rate !== null &&
        (amt === null || Number.isNaN(amt))
      ) {
        const derived = Math.round(clampNonNegativeNumber(qty) * clampNonNegativeNumber(rate));
        next[index] = { ...updated, amountCents: derived };
      }
      return next;
    });
  };

  const handleLineItemAmountChange = (index: number, value: string) => {
    const cents = parseDollarsToCents(value);
    handleLineItemChange(index, "amountCents", cents);
  };

  const handleLineItemRateChange = (index: number, value: string) => {
    const cents = parseDollarsToCents(value);
    handleLineItemChange(index, "rateCents", cents);
  };

  const addLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      {
        label: "",
        type: "FEE",
        quantity: 1,
        rateCents: null,
        amountCents: null,
      },
    ]);
  };

  const removeLineItem = (index: number) => {
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
          },
        ];
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const hasAtLeastOneMeaningfulLine = lineItems.some((li) => {
    const labelOk = li.label.trim().length > 0;
    const amt = typeof li.amountCents === "number" ? li.amountCents : 0;
    return labelOk || amt > 0;
  });

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    if (isSaving) return;

    if (!hasAtLeastOneMeaningfulLine) {
      setSaveError("Add at least one line item (label or amount) before saving.");
      return;
    }

    setSaveError(null);
    setIsSaving(true);

    try {
      const normalizedLineItems = lineItems.map((item) => ({
        id: item.id,
        label: item.label,
        type: item.type,
        quantity: typeof item.quantity === "number" && Number.isFinite(item.quantity) ? item.quantity : 0,
        rateCents: typeof item.rateCents === "number" && Number.isFinite(item.rateCents) ? item.rateCents : 0,
        amountCents: typeof item.amountCents === "number" && Number.isFinite(item.amountCents) ? item.amountCents : 0,
      }));

      const response: Response = await fetch(`/api/invoices/${invoiceId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status,
          issueDate: issueDate || undefined,
          dueDate: dueDate || undefined,
          notes: notes || undefined,
          currency: currency || undefined,
          lineItems: normalizedLineItems,
        }),
      });

      // Prefer JSON contract ({ ok:true, ... } / { ok:false, error }) but fall back to readable text.
      const responseForError = response.clone();
      const contentType = response.headers.get("content-type") || "";

      const json: { ok?: boolean; error?: string } | null = contentType.includes("application/json")
        ? ((await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null)
        : null;

      // Standard contract: all handlers respond with { ok: true, ... } or { ok:false, error }
      if (!response.ok || json?.ok === false) {
        const apiMessage = await Promise.resolve(getApiErrorMessage(responseForError));
        const message = json?.error || apiMessage || "Request failed.";
        setSaveError(message);
        return;
      }

      // Some successful routes may return a non-JSON body; treat that as unexpected.
      if (!json) {
        setSaveError("Unexpected response from server.");
        return;
      }

      if (json.ok !== true) {
        setSaveError(json.error || "Request failed.");
        return;
      }

      // Redirect back to invoice detail page inside the app
      router.push(`/app/estates/${estateId}/invoices/${invoiceId}`);
      router.refresh();
    } catch (err) {
      console.error(err);
      setSaveError("Unexpected error while saving invoice.");
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
          aria-live="polite"
          className="rounded-md border border-red-500/60 bg-red-900/30 px-3 py-2 text-xs text-red-100"
        >
          {saveError}
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
            onChange={(event) => setStatus(event.target.value as InvoiceStatus)}
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
            onChange={(event) => setIssueDate(event.target.value)}
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
            onChange={(event) => setDueDate(event.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
            disabled={isSaving}
          />
          <p className="mt-1 text-[11px] text-slate-500">
            If left blank, your workspace invoice terms (for example, NET 30) will be applied automatically where
            possible.
          </p>
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
          onChange={(event) => setCurrency(event.target.value.toUpperCase().slice(0, 3))}
          className="max-w-[120px] rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
          disabled={isSaving}
        />
        <p className="text-[11px] text-slate-500">Typically USD, but you can set another currency if needed.</p>
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
                  <label className="text-[11px] font-medium text-slate-300">Label</label>
                  <input
                    type="text"
                    value={item.label}
                    onChange={(event) => handleLineItemChange(index, "label", event.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    placeholder="For example, probate hearing preparation, rent collection, filing fee"
                    disabled={isSaving}
                  />
                </div>

                <div className="w-32 space-y-1">
                  <label className="text-[11px] font-medium text-slate-300">Type</label>
                  <select
                    value={item.type}
                    onChange={(event) =>
                      handleLineItemChange(index, "type", event.target.value as InvoiceEditLineItem["type"])
                    }
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
                  <label className="text-[11px] font-medium text-slate-300">Quantity</label>
                  <input
                    type="number"
                    min="0"
                    step="0.25"
                    value={typeof item.quantity === "number" ? item.quantity : item.quantity === null ? "" : ""}
                    onChange={(event) =>
                      handleLineItemChange(
                        index,
                        "quantity",
                        event.target.value === "" ? null : Number.parseFloat(event.target.value),
                      )
                    }
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    placeholder="For example, 1, 2.5, 10"
                    disabled={isSaving}
                  />
                  <p className="text-[10px] text-slate-500">Hours, units, or quantity depending on the item type.</p>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-300">Rate</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formatCentsToDollarsDisplay(item.rateCents)}
                    onChange={(event) => handleLineItemRateChange(index, event.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    placeholder="For example, 250.00"
                    disabled={isSaving}
                  />
                  <p className="text-[10px] text-slate-500">
                    Optional. If set along with quantity, the amount can be derived automatically.
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-300">Amount</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formatCentsToDollarsDisplay(item.amountCents)}
                      onChange={(event) => handleLineItemAmountChange(index, event.target.value)}
                      className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      placeholder="For example, 500.00"
                      disabled={isSaving}
                    />
                    <button
                      type="button"
                      onClick={() => removeLineItem(index)}
                      className="inline-flex items-center rounded-md border border-red-700 px-2 py-1 text-[11px] text-red-200 hover:bg-red-900/40 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isSaving}
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
            {currency} {subtotalDisplay || "0.00"}
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
          onChange={(event) => setNotes(event.target.value)}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
          placeholder="Describe the work performed, services rendered, or the purpose of this invoice."
          disabled={isSaving}
        />
        <p className="text-[11px] text-slate-500">
          This appears on the invoice and helps you quickly recognize what was billed.
        </p>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center rounded-md bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
          aria-busy={isSaving}
        >
          {isSaving ? "Saving…" : "Save invoice"}
        </button>
      </div>
    </form>
  );
}

export default InvoiceEditForm;