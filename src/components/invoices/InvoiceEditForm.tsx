"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export type InvoiceStatus =
  | "DRAFT"
  | "SENT"
  | "UNPAID"
  | "PARTIAL"
  | "PAID"
  | "VOID";

const STATUS_OPTIONS: InvoiceStatus[] = [
  "DRAFT",
  "SENT",
  "UNPAID",
  "PARTIAL",
  "PAID",
  "VOID",
];

export type RawLineItem = {
  _id?: string;
  label?: string;
  description?: string;
  type?: string;
  quantity?: number;
  rateCents?: number;
  amountCents?: number;
};

type InvoiceEditFormProps = {
  invoiceId: string;
  estateId: string;
  initialStatus: InvoiceStatus;
  initialNotes: string | null;
  initialCurrency: string;
  initialLineItems: RawLineItem[];
};

type EditLineItem = {
  id: string; // local key
  mongoId?: string;
  label: string;
  type: "HOURLY" | "FLAT_FEE" | "EXPENSE" | "OTHER";
  quantity: number;
  rate: number; // dollars
};

function centsToDollars(cents: number | null | undefined): number {
  if (typeof cents !== "number" || Number.isNaN(cents)) return 0;
  return cents / 100;
}

function dollarsToCents(dollars: number): number {
  if (!Number.isFinite(dollars) || dollars <= 0) return 0;
  return Math.round(dollars * 100);
}

function formatMoney(cents: number, currency: string): string {
  const dollars = centsToDollars(cents);
  return `${currency} ${dollars.toFixed(2)}`;
}

export default function InvoiceEditForm({
  invoiceId,
  estateId,
  initialStatus,
  initialNotes,
  initialCurrency,
  initialLineItems,
}: InvoiceEditFormProps) {
  const router = useRouter();

  const [status, setStatus] = useState<InvoiceStatus>(initialStatus);
  const [notes, setNotes] = useState<string>(initialNotes ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [items, setItems] = useState<EditLineItem[]>(() => {
    if (!Array.isArray(initialLineItems) || initialLineItems.length === 0) {
      return [
        {
          id: "new-0",
          label: "",
          type: "HOURLY",
          quantity: 1,
          rate: 0,
        },
      ];
    }

    return initialLineItems.map((item, index) => {
      const quantity =
        typeof item.quantity === "number" && item.quantity > 0
          ? item.quantity
          : 1;

      let rate = 0;
      if (typeof item.rateCents === "number" && item.rateCents > 0) {
        rate = centsToDollars(item.rateCents);
      } else if (
        typeof item.amountCents === "number" &&
        item.amountCents > 0 &&
        quantity > 0
      ) {
        rate = centsToDollars(item.amountCents) / quantity;
      }

      let normalizedType: EditLineItem["type"] = "OTHER";
      if (
        item.type === "HOURLY" ||
        item.type === "FLAT_FEE" ||
        item.type === "EXPENSE"
      ) {
        normalizedType = item.type;
      }

      return {
        id: String(item._id ?? `local-${index}`),
        mongoId: item._id ? String(item._id) : undefined,
        label: (item.label ?? item.description ?? "").toString(),
        type: normalizedType,
        quantity,
        rate,
      };
    });
  });

  const subtotalCents = useMemo(() => {
    return items.reduce((sum, item) => {
      const qty =
        Number.isFinite(item.quantity) && item.quantity > 0
          ? item.quantity
          : 0;
      const rateDollars =
        Number.isFinite(item.rate) && item.rate > 0 ? item.rate : 0;
      const lineCents = dollarsToCents(rateDollars * qty);
      return sum + lineCents;
    }, 0);
  }, [items]);

  const handleItemChange = (
    id: string,
    field: keyof EditLineItem,
    value: string,
  ) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;

        if (field === "quantity") {
          const asNumber = Number.parseFloat(value);
          return {
            ...item,
            quantity:
              Number.isFinite(asNumber) && asNumber > 0 ? asNumber : 0,
          };
        }

        if (field === "rate") {
          const asNumber = Number.parseFloat(value);
          return {
            ...item,
            rate:
              Number.isFinite(asNumber) && asNumber >= 0 ? asNumber : 0,
          };
        }

        if (field === "type") {
          const nextType: EditLineItem["type"] =
            value === "HOURLY" ||
            value === "FLAT_FEE" ||
            value === "EXPENSE" ||
            value === "OTHER"
              ? (value as EditLineItem["type"])
              : "OTHER";
          return { ...item, type: nextType };
        }

        if (field === "label") {
          return { ...item, label: value };
        }

        return item;
      }),
    );
  };

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `new-${prev.length}`,
        label: "",
        type: "HOURLY",
        quantity: 1,
        rate: 0,
      },
    ]);
  };

  const handleRemoveItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      const cleanedItems = items
        .map((item) => {
          const qty =
            Number.isFinite(item.quantity) && item.quantity > 0
              ? item.quantity
              : 0;
          const rateDollars =
            Number.isFinite(item.rate) && item.rate > 0 ? item.rate : 0;
          const amountCents = dollarsToCents(rateDollars * qty);

          if (!item.label.trim() || qty <= 0 || amountCents <= 0) {
            return null;
          }

          return {
            _id: item.mongoId,
            label: item.label.trim(),
            type: item.type,
            quantity: qty,
            // send both rate and amount in cents so the backend can compute safely
            rate: dollarsToCents(rateDollars),
            amountCents,
          };
        })
        .filter(Boolean);

      const payload = {
        status,
        notes: notes.trim().length > 0 ? notes.trim() : undefined,
        lineItems: cleanedItems,
      };

      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const msg = data?.error || "Failed to update invoice.";
        throw new Error(msg);
      }

      router.push(`/app/estates/${estateId}/invoices/${invoiceId}`);
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Unexpected error updating invoice.";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">
            Edit invoice details
          </h2>
          <p className="text-xs text-slate-400">
            Adjust line items, status, and memo. Totals are recalculated
            automatically.
          </p>
        </div>

        <div className="flex flex-col gap-1 text-right">
          <span className="text-[11px] uppercase tracking-wide text-slate-500">
            Subtotal
          </span>
          <span className="text-sm font-semibold text-slate-100">
            {formatMoney(subtotalCents, initialCurrency || "USD")}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-300" htmlFor="status">
          Status
        </label>
        <select
          id="status"
          value={status}
          onChange={(e) => setStatus(e.target.value as InvoiceStatus)}
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-300" htmlFor="notes">
          Memo / description
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
          placeholder="Describe the work performed, services rendered, or the purpose of this invoice."
        />
        <p className="text-[11px] text-slate-500">
          This memo appears on the invoice and helps you quickly recognize what
          was billed.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/70 p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Line items
          </h3>
          <button
            type="button"
            onClick={handleAddItem}
            className="inline-flex items-center rounded-md bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-100 hover:bg-slate-700"
          >
            + Add line item
          </button>
        </div>

        {/* header row (desktop) */}
        <div className="hidden grid-cols-12 gap-2 border-b border-slate-800 pb-2 text-[11px] text-slate-500 md:grid">
          <div className="col-span-5">Label</div>
          <div className="col-span-2">Type</div>
          <div className="col-span-2 text-right">Qty</div>
          <div className="col-span-2 text-right">
            Rate ({initialCurrency || "USD"})
          </div>
          <div className="col-span-1 text-right">Remove</div>
        </div>

        <div className="space-y-2">
          {items.map((item) => {
            const lineCents = dollarsToCents(item.rate * item.quantity);
            return (
              <div
                key={item.id}
                className="grid grid-cols-1 gap-2 rounded-md border border-slate-800 bg-slate-900/60 p-2 text-sm md:grid-cols-12 md:items-center"
              >
                <div className="md:col-span-5">
                  <label className="mb-1 block text-[11px] text-slate-500 md:hidden">
                    Label
                  </label>
                  <input
                    value={item.label}
                    onChange={(e) =>
                      handleItemChange(item.id, "label", e.target.value)
                    }
                    placeholder="e.g. Drafting petition, client call"
                    className="w-full rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-[11px] text-slate-500 md:hidden">
                    Type
                  </label>
                  <select
                    value={item.type}
                    onChange={(e) =>
                      handleItemChange(item.id, "type", e.target.value)
                    }
                    className="w-full rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  >
                    <option value="HOURLY">Hourly</option>
                    <option value="FLAT_FEE">Flat fee</option>
                    <option value="EXPENSE">Expense</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-[11px] text-slate-500 md:hidden">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.25}
                    value={Number.isFinite(item.quantity) ? item.quantity : ""}
                    onChange={(e) =>
                      handleItemChange(item.id, "quantity", e.target.value)
                    }
                    className="w-full rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1 text-right text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-[11px] text-slate-500 md:hidden">
                    Rate ({initialCurrency || "USD"})
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={Number.isFinite(item.rate) ? item.rate : ""}
                    onChange={(e) =>
                      handleItemChange(item.id, "rate", e.target.value)
                    }
                    className="w-full rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1 text-right text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Line total:{" "}
                    {formatMoney(lineCents, initialCurrency || "USD")}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-2 md:col-span-1 md:flex-col md:items-end">
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(item.id)}
                    className="mt-1 inline-flex items-center rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}

          {items.length === 0 && (
            <p className="text-xs text-slate-500">
              No line items yet. Click &quot;+ Add line item&quot; to start building this
              invoice.
            </p>
          )}
        </div>

        <div className="flex items-center justify-end border-t border-slate-800 pt-3 text-sm">
          <div className="space-y-0.5 text-right">
            <div className="flex items-center justify-between gap-6 text-xs text-slate-400">
              <span>Subtotal</span>
              <span className="font-mono text-slate-100">
                {formatMoney(subtotalCents, initialCurrency || "USD")}
              </span>
            </div>
          </div>
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex items-center rounded-md bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-60"
        >
          {isSaving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}