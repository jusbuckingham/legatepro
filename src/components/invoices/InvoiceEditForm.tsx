"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "VOID";

type InvoiceLineItemType = "TIME" | "EXPENSE" | "ADJUSTMENT";

type LineItem = {
  id?: string;
  type: InvoiceLineItemType;
  label: string;
  quantity: number;
  rate: number;
  amount: number;
};

type InvoiceEditFormProps = {
  invoiceId: string;
  estateId: string;
  initialStatus: InvoiceStatus;
  initialIssueDate: string;
  initialDueDate: string;
  initialNotes: string;
  initialLineItems: LineItem[];
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

export function InvoiceEditForm({
  invoiceId,
  estateId,
  initialStatus,
  initialIssueDate,
  initialDueDate,
  initialNotes,
  initialLineItems,
}: InvoiceEditFormProps) {
  const router = useRouter();

  const [status, setStatus] = useState<InvoiceStatus>(initialStatus);
  const [issueDate, setIssueDate] = useState(initialIssueDate);
  const [dueDate, setDueDate] = useState(initialDueDate);
  const [notes, setNotes] = useState(initialNotes);
  const [lineItems, setLineItems] = useState<LineItem[]>(
    initialLineItems.length > 0
      ? initialLineItems
      : [
          {
            id: "li-1",
            type: "ADJUSTMENT",
            label: "",
            quantity: 1,
            rate: 0,
            amount: 0,
          },
        ],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateLineItem = (
    index: number,
    patch: Partial<Pick<LineItem, "type" | "label" | "quantity" | "rate">>,
  ) => {
    setLineItems((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;

      const updated: LineItem = {
        ...current,
        ...patch,
      };

      const quantity = patch.quantity ?? current.quantity;
      const rate = patch.rate ?? current.rate;

      const safeQuantity = Number.isFinite(quantity) ? quantity : 0;
      const safeRate = Number.isFinite(rate) ? rate : 0;

      updated.amount = safeQuantity * safeRate;

      next[index] = updated;
      return next;
    });
  };

  const addLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      {
        id: `li-${prev.length + 1}`,
        type: "ADJUSTMENT",
        label: "",
        quantity: 1,
        rate: 0,
        amount: 0,
      },
    ]);
  };

  const removeLineItem = (index: number) => {
    setLineItems((prev) => {
      if (prev.length === 1) return prev;
      const next = [...prev];
      next.splice(index, 1);
      return next;
    });
  };

  const total = lineItems.reduce((sum, li) => sum + (li.amount || 0), 0);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setSaving(true);
    setError(null);

    try {
      const payload = {
        estateId,
        status,
        issueDate,
        dueDate,
        notes,
        lineItems: lineItems.map((li) => ({
          type: li.type,
          label: li.label,
          quantity: li.quantity,
          rate: li.rate,
          amount: li.amount,
        })),
      };

      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message =
          typeof data.error === "string"
            ? data.error
            : "Failed to save invoice changes.";
        setError(message);
        setSaving(false);
        return;
      }

      router.push(`/app/estates/${estateId}/invoices/${invoiceId}`);
    } catch (err) {
      console.error(err);
      setError("Something went wrong while saving. Please try again.");
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-lg border border-slate-800 bg-slate-900/60 p-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-50">
            Edit invoice
          </h1>
          <p className="text-xs text-slate-400">
            Update dates, status, and line items. Totals will be recalculated
            automatically.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() =>
              router.push(`/app/estates/${estateId}/invoices/${invoiceId}`)
            }
            className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-sky-500 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-400">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Status
          </label>
          <select
            value={status}
            onChange={(e) =>
              setStatus(e.target.value.toUpperCase() as InvoiceStatus)
            }
            className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option value="DRAFT">Draft</option>
            <option value="SENT">Sent</option>
            <option value="PAID">Paid</option>
            <option value="VOID">Void</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Issue date
          </label>
          <input
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Due date
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">
          Notes / memo
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">
            Line items
          </h2>
          <button
            type="button"
            onClick={addLineItem}
            className="text-xs text-sky-400 hover:text-sky-300"
          >
            + Add line item
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2 pr-3 font-medium">Type</th>
                <th className="py-2 pr-3 font-medium">Description</th>
                <th className="py-2 pr-3 font-medium">Qty</th>
                <th className="py-2 pr-3 font-medium">Rate</th>
                <th className="py-2 pr-3 font-medium text-right">Amount</th>
                <th className="py-2 pl-3 font-medium text-right" />
              </tr>
            </thead>
            <tbody>
              {lineItems.map((li, index) => (
                <tr
                  key={li.id ?? `li-${index}`}
                  className="border-b border-slate-900 last:border-0"
                >
                  <td className="py-2 pr-3 align-top">
                    <select
                      value={li.type}
                      onChange={(e) =>
                        updateLineItem(index, {
                          type: e.target
                            .value as InvoiceLineItemType,
                        })
                      }
                      className="w-full rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    >
                      <option value="TIME">Time</option>
                      <option value="EXPENSE">Expense</option>
                      <option value="ADJUSTMENT">Adjustment</option>
                    </select>
                  </td>
                  <td className="py-2 pr-3 align-top">
                    <input
                      type="text"
                      value={li.label}
                      onChange={(e) =>
                        updateLineItem(index, { label: e.target.value })
                      }
                      placeholder="Description"
                      className="w-full rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </td>
                  <td className="py-2 pr-3 align-top">
                    <input
                      type="number"
                      value={li.quantity}
                      min={0}
                      step={0.25}
                      onChange={(e) =>
                        updateLineItem(index, {
                          quantity: Number(e.target.value) || 0,
                        })
                      }
                      className="w-20 rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </td>
                  <td className="py-2 pr-3 align-top">
                    <input
                      type="number"
                      value={li.rate}
                      min={0}
                      step={0.01}
                      onChange={(e) =>
                        updateLineItem(index, {
                          rate: Number(e.target.value) || 0,
                        })
                      }
                      className="w-24 rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </td>
                  <td className="py-2 pr-3 align-top text-right text-slate-100">
                    {formatCurrency(li.amount)}
                  </td>
                  <td className="py-2 pl-3 align-top text-right">
                    <button
                      type="button"
                      onClick={() => removeLineItem(index)}
                      className="text-[11px] text-slate-400 hover:text-red-400"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-end border-t border-slate-800 pt-3">
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">
              Total
            </p>
            <p className="text-base font-semibold text-slate-50">
              {formatCurrency(total)}
            </p>
          </div>
        </div>
      </div>
    </form>
  );
}