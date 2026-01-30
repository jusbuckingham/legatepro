"use client";

import { useState } from "react";
import type { FormEventHandler } from "react";
import { useRouter } from "next/navigation";


import { getApiErrorMessage } from "@/lib/utils";

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

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

type FieldKey = "description" | "amount" | "incurredAt" | "receiptUrl";

type FieldErrors = Partial<Record<FieldKey, string>>;

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
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const resetFeedback = (): void => {
    if (errorMsg) setErrorMsg(null);
    if (Object.keys(fieldErrors).length > 0) setFieldErrors({});
  };

  const handleBlurTrim = (
    value: string,
    setter: (next: string) => void,
  ): void => {
    const trimmed = value.trim();
    if (trimmed !== value) setter(trimmed);
  };

  function setFieldError(key: FieldKey, message: string): void {
    setFieldErrors((prev) => ({ ...prev, [key]: message }));
  }

  function clearFieldError(key: FieldKey): void {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function parseAmountToCents(
    input: string,
  ): { cents?: number; error?: string } {
    const raw = input.trim();
    if (!raw) return {};

    // Remove currency symbols/commas/spaces
    const cleaned = raw.replace(/[^0-9.\-]/g, "");
    const asNumber = Number.parseFloat(cleaned);

    if (!Number.isFinite(asNumber)) return { error: "Please enter a valid amount." };
    if (asNumber < 0) return { error: "Amount cannot be negative." };

    return { cents: Math.round(asNumber * 100) };
  }

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    if (isSaving) return;
    setErrorMsg(null);
    setFieldErrors({});

    const trimmedDescription = description.trim();
    if (!trimmedDescription) {
      setFieldError("description", "Description is required.");
      setErrorMsg("Fix the highlighted fields.");
      return;
    }

    const trimmedReceiptUrl = receiptUrl.trim();
    if (trimmedReceiptUrl.length > 0 && !isValidHttpUrl(trimmedReceiptUrl)) {
      setFieldError("receiptUrl", "Receipt link must be a valid http(s) URL.");
      setErrorMsg("Fix the highlighted fields.");
      return;
    }

    const cleanedAmount = amountDollars.trim();

    if (cleanedAmount !== amountDollars) {
      setAmountDollars(cleanedAmount);
    }

    const parsed = parseAmountToCents(cleanedAmount);
    if (parsed.error) {
      setFieldError("amount", parsed.error);
      setErrorMsg("Fix the highlighted fields.");
      return;
    }

    const parsedAmountCents = parsed.cents;

    let incurredAtIso: string | null = null;
    if (incurredAt) {
      const d = new Date(incurredAt);
      if (Number.isNaN(d.getTime())) {
        setFieldError("incurredAt", "Please enter a valid date.");
        setErrorMsg("Fix the highlighted fields.");
        return;
      }
      incurredAtIso = d.toISOString();
    }

    setIsSaving(true);

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
        credentials: "include",
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
        const apiMessage = typeof data?.error === "string" ? data.error : "";
        const fallbackMessage = await getApiErrorMessage(resForError);
        const msg = apiMessage || fallbackMessage || "Failed to save expense. Please try again.";
        setErrorMsg(msg);
        return;
      }


      // On success, go back to estate expenses list
      router.push(`/app/estates/${estateIdEncoded}/expenses`);
      router.refresh();
    } catch {
      setErrorMsg("Unexpected error while saving. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const isSubmitDisabled = isSaving || Object.keys(fieldErrors).length > 0;

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
              clearFieldError("description");
              setDescription(e.target.value);
            }}
            onBlur={() => handleBlurTrim(description, setDescription)}
            disabled={isSaving}
            aria-invalid={Boolean(fieldErrors.description)}
            maxLength={200}
            autoFocus
            className={cx(
              "rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1",
              fieldErrors.description ? "focus:ring-red-500" : "focus:ring-sky-500",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
            )}
            placeholder="e.g. Filing fee, appraisal, travel"
          />
          {fieldErrors.description ? (
            <p className="text-[11px] text-red-300">{fieldErrors.description}</p>
          ) : null}
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
            maxLength={80}
            className={cx(
              "rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
            )}
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
              clearFieldError("amount");
              setAmountDollars(e.target.value);
            }}
            onBlur={() => handleBlurTrim(amountDollars, setAmountDollars)}
            disabled={isSaving}
            aria-invalid={Boolean(fieldErrors.amount)}
            className={cx(
              "rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1",
              fieldErrors.amount ? "focus:ring-red-500" : "focus:ring-sky-500",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
            )}
            placeholder="e.g. 125.00"
          />
          {fieldErrors.amount ? (
            <p className="text-[11px] text-red-300">{fieldErrors.amount}</p>
          ) : null}
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
              clearFieldError("incurredAt");
              setIncurredAt(e.target.value);
            }}
            disabled={isSaving}
            aria-invalid={Boolean(fieldErrors.incurredAt)}
            className={cx(
              "rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1",
              fieldErrors.incurredAt ? "focus:ring-red-500" : "focus:ring-sky-500",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
            )}
          />
          {fieldErrors.incurredAt ? (
            <p className="text-[11px] text-red-300">{fieldErrors.incurredAt}</p>
          ) : null}
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
            className={cx(
              "rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
            )}
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
            maxLength={120}
            className={cx(
              "rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
            )}
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
            className={cx(
              "h-3 w-3 rounded border-slate-600 bg-slate-900 text-sky-500 focus:ring-sky-500",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
            )}
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
            clearFieldError("receiptUrl");
            setReceiptUrl(e.target.value);
          }}
          onBlur={() => handleBlurTrim(receiptUrl, setReceiptUrl)}
          disabled={isSaving}
          aria-invalid={Boolean(fieldErrors.receiptUrl)}
          maxLength={500}
          spellCheck={false}
          className={cx(
            "rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1",
            fieldErrors.receiptUrl ? "focus:ring-red-500" : "focus:ring-sky-500",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
          )}
          placeholder="Link to a PDF or image of the receipt"
        />
        {fieldErrors.receiptUrl ? (
          <p className="text-[11px] text-red-300">{fieldErrors.receiptUrl}</p>
        ) : null}
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
                className={cx(
                  "text-[11px] font-medium text-sky-300 hover:text-sky-200",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
                )}
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
          maxLength={2000}
          className={cx(
            "rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
          )}
          placeholder="Anything you want to remember about this expense."
        />
      </div>

      {errorMsg && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-md border border-red-500/30 bg-red-950/30 px-3 py-2 text-xs text-red-200"
        >
          <span className="font-semibold">Couldn’t save.</span> {errorMsg || "Please try again."}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          disabled={isSaving}
          aria-disabled={isSaving}
          className={cx(
            "rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200",
            "hover:bg-slate-800 disabled:opacity-60",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200/20 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
          )}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitDisabled}
          aria-disabled={isSubmitDisabled}
          className={cx(
            "inline-flex items-center rounded-md bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white",
            "hover:bg-sky-500 disabled:opacity-60",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
          )}
        >
          {isSaving ? "Saving…" : "Save expense"}
        </button>
      </div>
    </form>
  );
}