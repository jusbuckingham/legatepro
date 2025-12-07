"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

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

export function ExpenseEditForm({
  estateId,
  expenseId,
  initialExpense,
}: ExpenseEditFormProps) {
  const router = useRouter();

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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    setErrorMsg(null);

    let parsedAmountCents: number | undefined;
    const cleanedAmount = amountDollars.trim();

    if (cleanedAmount) {
      const cleaned = cleanedAmount.replace(/[,$]/g, "");
      const asNumber = Number.parseFloat(cleaned);
      if (!Number.isFinite(asNumber) || asNumber < 0) {
        setErrorMsg("Please enter a valid amount.");
        setIsSaving(false);
        return;
      }
      parsedAmountCents = Math.round(asNumber * 100);
    }

    const payload = {
      description: description.trim(),
      category: category.trim(),
      status: status.trim(),
      payee: payee.trim(),
      notes: notes.trim(),
      reimbursable,
      incurredAt: incurredAt ? new Date(incurredAt).toISOString() : null,
      amountCents: parsedAmountCents,
      receiptUrl: receiptUrl.trim(),
    };

    try {
      const res = await fetch(`/api/expenses/${expenseId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setErrorMsg(
          data?.error ?? "Failed to save expense. Please try again.",
        );
        setIsSaving(false);
        return;
      }

      // On success, go back to estate expenses list
      router.push(`/app/estates/${estateId}/expenses`);
      router.refresh();
    } catch (err) {
      console.error("Error saving expense", err);
      setErrorMsg("Unexpected error while saving. Please try again.");
      setIsSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/70 p-4"
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
            value={description}
            onChange={(e) => setDescription(e.target.value)}
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
            onChange={(e) => setCategory(e.target.value)}
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
            onChange={(e) => setAmountDollars(e.target.value)}
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
            onChange={(e) => setIncurredAt(e.target.value)}
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
            onChange={(e) => setStatus(e.target.value)}
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
            onChange={(e) => setPayee(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
            placeholder="Who was paid (or will be paid)?"
          />
        </div>

        <label className="mt-5 flex items-center gap-2 text-xs text-slate-300">
          <input
            type="checkbox"
            checked={reimbursable}
            onChange={(e) => setReimbursable(e.target.checked)}
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
          onChange={(e) => setReceiptUrl(e.target.value)}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
          placeholder="Link to a PDF or image of the receipt"
        />
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
          onChange={(e) => setNotes(e.target.value)}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
          placeholder="Anything you want to remember about this expense."
        />
      </div>

      {errorMsg && (
        <p className="text-xs text-red-400" role="alert">
          {errorMsg}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex items-center rounded-md bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-60"
        >
          {isSaving ? "Saving…" : "Save expense"}
        </button>
      </div>
    </form>
  );
}