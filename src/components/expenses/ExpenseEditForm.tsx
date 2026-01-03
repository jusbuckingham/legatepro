"use client";

import { useState } from "react";
import type { FormEventHandler } from "react";
import { useRouter } from "next/navigation";

import { getApiErrorMessage } from "@/lib/utils";

type ApiResponse = {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
};

type ExpenseEditFormProps = {
  estateId: string;
  expenseId: string;
  initialExpense: {
    description?: string;
    category?: string;
    status?: string;
    payee?: string;
    notes?: string;
    reimbursable?: boolean;
    incurredAt?: string | Date | null;
    amountCents?: number;
    receiptUrl?: string;
  };
};

function formatDateInput(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function ExpenseEditForm({
  estateId,
  expenseId,
  initialExpense,
}: ExpenseEditFormProps) {
  const router = useRouter();

  const estateIdEncoded = encodeURIComponent(estateId);
  const expenseIdEncoded = encodeURIComponent(expenseId);

  const [description, setDescription] = useState(
    initialExpense.description ?? "",
  );
  const [category, setCategory] = useState(initialExpense.category ?? "");
  const [status, setStatus] = useState(initialExpense.status ?? "PENDING");
  const [payee, setPayee] = useState(initialExpense.payee ?? "");
  const [notes, setNotes] = useState(initialExpense.notes ?? "");
  const [reimbursable, setReimbursable] = useState(
    Boolean(initialExpense.reimbursable),
  );
  const [incurredAt, setIncurredAt] = useState(
    formatDateInput(initialExpense.incurredAt),
  );
  const [receiptUrl, setReceiptUrl] = useState(initialExpense.receiptUrl ?? "");

  const [amountDollars, setAmountDollars] = useState<string>(() => {
    const cents = initialExpense.amountCents ?? 0;
    if (!cents) return "";
    return (cents / 100).toFixed(2);
  });

  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const resetFeedback = (): void => {
    if (errorMsg) setErrorMsg(null);
    if (successMsg) setSuccessMsg(null);
  };

  const handleBlurTrim = (value: string, setter: (next: string) => void): void => {
    const trimmed = value.trim();
    if (trimmed !== value) setter(trimmed);
  };

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    if (isSaving) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    const trimmedDescription = description.trim();
    if (!trimmedDescription) {
      setErrorMsg("Description is required.");
      return;
    }

    const trimmedReceiptUrl = receiptUrl.trim();
    if (trimmedReceiptUrl.length > 0 && !isValidHttpUrl(trimmedReceiptUrl)) {
      setErrorMsg("Receipt link must be a valid http(s) URL.");
      return;
    }

    let parsedAmountCents: number | undefined;
    const cleanedAmount = amountDollars.trim();

    if (cleanedAmount !== amountDollars) {
      setAmountDollars(cleanedAmount);
    }

    if (cleanedAmount) {
      const cleaned = cleanedAmount.replace(/[,$]/g, "");
      const asNumber = Number.parseFloat(cleaned);
      if (!Number.isFinite(asNumber) || asNumber < 0) {
        setErrorMsg("Please enter a valid amount.");
        return;
      }
      parsedAmountCents = Math.round(asNumber * 100);
    }

    setIsSaving(true);

    let incurredAtIso: string | null = null;
    if (incurredAt) {
      const d = new Date(incurredAt);
      if (Number.isNaN(d.getTime())) {
        setErrorMsg("Please enter a valid date.");
        setIsSaving(false);
        return;
      }
      incurredAtIso = d.toISOString();
    }

    const trimmedCategory = category.trim();
    const trimmedStatus = status.trim();
    const trimmedPayee = payee.trim();
    const trimmedNotes = notes.trim();

    const payload = {
      description: trimmedDescription,
      category: trimmedCategory.length > 0 ? trimmedCategory : undefined,
      status: trimmedStatus.length > 0 ? trimmedStatus : undefined,
      payee: trimmedPayee.length > 0 ? trimmedPayee : undefined,
      notes: trimmedNotes.length > 0 ? trimmedNotes : undefined,
      reimbursable,
      incurredAt: incurredAtIso,
      amountCents: parsedAmountCents,
      receiptUrl: trimmedReceiptUrl.length > 0 ? trimmedReceiptUrl : undefined,
    };

    try {
      const res = await fetch(`/api/expenses/${expenseIdEncoded}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      // Prefer JSON contract ({ ok:true, ... } / { ok:false, error }) but fall back to readable text.
      const resForError = res.clone();
      const contentType = res.headers.get("content-type") || "";

      const data: ApiResponse | null = contentType.includes("application/json")
        ? ((await res.json().catch(() => null)) as ApiResponse | null)
        : null;

      if (!res.ok || data?.ok !== true) {
        const apiMessage = data?.error;
        const fallbackMessage = await Promise.resolve(getApiErrorMessage(resForError));
        const msg = apiMessage || fallbackMessage || "Failed to save expense. Please try again.";
        setErrorMsg(msg);
        return;
      }

      setSuccessMsg("Expense saved.");

      // On success, go back to estate expenses list
      router.push(`/app/estates/${estateIdEncoded}/expenses`);
      router.refresh();
    } catch {
      setErrorMsg("Unexpected error while saving. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/70 p-4"
      aria-busy={isSaving}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="description"
            className="text-xs font-medium text-slate-300"
          >
            Description
          </label>
          <input
            id="description"
            required
            value={description}
            onChange={(e) => {
              resetFeedback();
              setDescription(e.target.value);
            }}
            onBlur={() => handleBlurTrim(description, setDescription)}
            disabled={isSaving}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
            placeholder="e.g. Filing fee, appraisal, travel"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="category"
            className="text-xs font-medium text-slate-300"
          >
            Category
          </label>
          <input
            id="category"
            value={category}
            onChange={(e) => {
              resetFeedback();
              setCategory(e.target.value);
            }}
            onBlur={() => handleBlurTrim(category, setCategory)}
            disabled={isSaving}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
            placeholder="Court costs, travel, professional services..."
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="amount"
            className="text-xs font-medium text-slate-300"
          >
            Amount (in dollars)
          </label>
          <input
            id="amount"
            type="number"
            min="0"
            step="0.01"
            value={amountDollars}
            onChange={(e) => {
              resetFeedback();
              setAmountDollars(e.target.value);
            }}
            onBlur={() => handleBlurTrim(amountDollars, setAmountDollars)}
            disabled={isSaving}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
            placeholder="e.g. 125.00"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="incurredAt"
            className="text-xs font-medium text-slate-300"
          >
            Date
          </label>
          <input
            id="incurredAt"
            type="date"
            value={incurredAt}
            onChange={(e) => {
              resetFeedback();
              setIncurredAt(e.target.value);
            }}
            disabled={isSaving}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="status"
            className="text-xs font-medium text-slate-300"
          >
            Status
          </label>
          <select
            id="status"
            value={status}
            onChange={(e) => {
              resetFeedback();
              setStatus(e.target.value);
            }}
            disabled={isSaving}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option value="PENDING">Pending</option>
            <option value="PAID">Paid</option>
            <option value="REIMBURSED">Reimbursed</option>
            <option value="VOID">Void</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="payee"
            className="text-xs font-medium text-slate-300"
          >
            Payee
          </label>
          <input
            id="payee"
            value={payee}
            onChange={(e) => {
              resetFeedback();
              setPayee(e.target.value);
            }}
            onBlur={() => handleBlurTrim(payee, setPayee)}
            disabled={isSaving}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
            placeholder="Who was paid (or will be paid)?"
          />
        </div>

        <label className="mt-5 flex items-center gap-2 text-xs text-slate-300">
          <input
            type="checkbox"
            checked={reimbursable}
            onChange={(e) => {
              resetFeedback();
              setReimbursable(e.target.checked);
            }}
            disabled={isSaving}
            className="h-3 w-3 rounded border-slate-600 bg-slate-900 text-sky-500 focus:ring-sky-500"
          />
          Mark as reimbursable to the personal representative
        </label>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="receiptUrl"
          className="text-xs font-medium text-slate-300"
        >
          Receipt link (URL)
        </label>
        <input
          id="receiptUrl"
          value={receiptUrl}
          onChange={(e) => {
            resetFeedback();
            setReceiptUrl(e.target.value);
          }}
          onBlur={() => handleBlurTrim(receiptUrl, setReceiptUrl)}
          disabled={isSaving}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
          placeholder="Link to a PDF or image of the receipt"
        />
        {(() => {
          const url = receiptUrl.trim();
          if (!url) return null;
          if (!isValidHttpUrl(url)) return null;

          return (
            <div className="mt-1">
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-medium text-sky-300 hover:text-sky-200"
              >
                Open receipt ↗
              </a>
            </div>
          );
        })()}
        <p className="text-[11px] text-slate-500">
          For now, paste a link to a stored receipt (e.g., Google Drive,
          Dropbox). We can wire direct file uploads later.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="notes"
          className="text-xs font-medium text-slate-300"
        >
          Internal notes
        </label>
        <textarea
          id="notes"
          rows={3}
          value={notes}
          onChange={(e) => {
            resetFeedback();
            setNotes(e.target.value);
          }}
          onBlur={() => handleBlurTrim(notes, setNotes)}
          disabled={isSaving}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
          placeholder="Anything you want to remember about this expense."
        />
      </div>

      {errorMsg && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-md border border-red-500/30 bg-red-950/30 px-3 py-2 text-xs text-red-200"
        >
          <span className="font-semibold">Couldn’t save.</span> {errorMsg}
        </div>
      )}

      {successMsg && !errorMsg && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-md border border-emerald-500/30 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-200"
        >
          {successMsg}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          disabled={isSaving}
          className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSaving}
          aria-disabled={isSaving}
          className="inline-flex items-center rounded-md bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-60"
        >
          {isSaving ? "Saving…" : "Save expense"}
        </button>
      </div>
    </form>
  );
}