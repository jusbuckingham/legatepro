"use client";

import { useEffect, useMemo, useState, FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";

// Local, UI-focused types that don't depend on backend TS types
// We keep this flexible so we can work with whatever the API returns.

type InvoiceLineItem = {
  _id?: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  kind?: string; // e.g. "TIME" | "EXPENSE" | "MANUAL"
  sourceId?: string | null;
};

type TimeEntryForInvoice = {
  _id: string;
  date: string | Date;
  taskName?: string;
  notes?: string;
  hours: number;
  rate: number;
  amount: number;
};

type InvoiceApiResponse = {
  invoice?: {
    _id: string;
    estateId: string;
    number?: string;
    status?: string;
    notes?: string;
    lineItems?: InvoiceLineItem[];
    items?: InvoiceLineItem[]; // fallback in case model uses `items`
  };
};

const EMPTY_ITEM: InvoiceLineItem = {
  description: "",
  quantity: 1,
  rate: 0,
  amount: 0,
  kind: "MANUAL",
  sourceId: null,
};

export default function InvoiceEditPage() {
  const params = useParams<{ estateId: string; invoiceId: string }>();
  const router = useRouter();

  const estateId = params.estateId;
  const invoiceId = params.invoiceId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [invoiceNumber, setInvoiceNumber] = useState<string>("");
  const [status, setStatus] = useState<string>("DRAFT");
  const [notes, setNotes] = useState<string>("");
  const [items, setItems] = useState<InvoiceLineItem[]>([]);
  const [isTimeModalOpen, setIsTimeModalOpen] = useState(false);
  const [timeEntries, setTimeEntries] = useState<TimeEntryForInvoice[]>([]);
  const [timeLoading, setTimeLoading] = useState(false);
  const [timeError, setTimeError] = useState<string | null>(null);
  const [selectedTimeEntryIds, setSelectedTimeEntryIds] = useState<string[]>([]);

  // --- Fetch existing invoice on mount ---
  useEffect(() => {
    let isMounted = true;

    const fetchInvoice = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(
          `/api/estates/${estateId}/invoices/${invoiceId}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        if (!res.ok) {
          throw new Error(`Failed to load invoice (${res.status})`);
        }

        const data: InvoiceApiResponse = await res.json();
        const inv = data.invoice;

        if (!isMounted || !inv) return;

        setInvoiceNumber(inv.number ?? "");
        setStatus(inv.status ?? "DRAFT");
        setNotes(inv.notes ?? "");

        const rawItems = (inv.lineItems ?? inv.items ?? []) as InvoiceLineItem[];

        const normalized = rawItems.map((item) => {
          const quantity =
            typeof item.quantity === "number" && !Number.isNaN(item.quantity)
              ? item.quantity
              : 1;
          const rate =
            typeof item.rate === "number" && !Number.isNaN(item.rate)
              ? item.rate
              : 0;
          const amount = quantity * rate;

          return {
            ...item,
            quantity,
            rate,
            amount,
          };
        });

        setItems(normalized.length > 0 ? normalized : [EMPTY_ITEM]);
      } catch (err) {
        console.error("Error loading invoice", err);
        if (isMounted) {
          setError("Unable to load invoice. Please try again.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    if (estateId && invoiceId) {
      void fetchInvoice();
    }

    return () => {
      isMounted = false;
    };
  }, [estateId, invoiceId]);

  // --- Derived totals ---
  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + (item.amount || 0), 0),
    [items]
  );

  // If you later add tax / adjustments, we can extend this easily
  const total = subtotal;

  // --- Handlers for line-item editing ---

  type EditableInvoiceField = "description" | "quantity" | "rate";

  const updateItemField = (
    index: number,
    field: EditableInvoiceField,
    value: string
  ) => {
    setItems((prev) => {
      const next = [...prev];
      const current: InvoiceLineItem = { ...next[index] };

      if (field === "quantity") {
        const numeric = Number.parseFloat(value.replace(/[^0-9.\-]/g, ""));
        const safeNumber = Number.isFinite(numeric) ? numeric : 0;
        current.quantity = safeNumber;
      } else if (field === "rate") {
        const numeric = Number.parseFloat(value.replace(/[^0-9.\-]/g, ""));
        const safeNumber = Number.isFinite(numeric) ? numeric : 0;
        current.rate = safeNumber;
      } else if (field === "description") {
        current.description = value;
      }

      const quantity =
        typeof current.quantity === "number" && !Number.isNaN(current.quantity)
          ? current.quantity
          : 0;
      const rate =
        typeof current.rate === "number" && !Number.isNaN(current.rate)
          ? current.rate
          : 0;

      current.amount = quantity * rate;

      next[index] = current;
      return next;
    });
  };

  const addItem = () => {
    setItems((prev) => [...prev, { ...EMPTY_ITEM }]);
  };

  const removeItem = (index: number) => {
    setItems((prev) => {
      if (prev.length === 1) {
        // Always keep at least one row
        return [{ ...EMPTY_ITEM }];
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const openTimeModal = async () => {
    setTimeError(null);
    setIsTimeModalOpen(true);

    // If we've already loaded once, don't refetch
    if (timeEntries.length > 0) return;

    try {
      setTimeLoading(true);

      const res = await fetch(`/api/estates/${estateId}/time`, {
        method: "GET",
      });

      if (!res.ok) {
        throw new Error("Failed to load time entries");
      }

      const data = await res.json();

      const rawEntries: unknown =
        (data && (data.entries ?? data)) ?? [];

      const normalized = (Array.isArray(rawEntries)
        ? rawEntries
        : []) as TimeEntryForInvoice[];

      setTimeEntries(
        normalized.map((entry) => ({
          _id: entry._id,
          date: entry.date,
          taskName: entry.taskName,
          notes: entry.notes,
          hours: Number(entry.hours ?? 0),
          rate: Number(entry.rate ?? 0),
          amount:
            typeof entry.amount === "number"
              ? entry.amount
              : Number(entry.hours ?? 0) * Number(entry.rate ?? 0),
        }))
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load time entries";
      setTimeError(message);
    } finally {
      setTimeLoading(false);
    }
  };

  const toggleTimeSelection = (id: string) => {
    setSelectedTimeEntryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const addSelectedTimeEntriesToInvoice = () => {
    if (!timeEntries.length || !selectedTimeEntryIds.length) {
      setIsTimeModalOpen(false);
      return;
    }

    const selectedEntries = timeEntries.filter((entry) =>
      selectedTimeEntryIds.includes(entry._id)
    );

    if (!selectedEntries.length) {
      setIsTimeModalOpen(false);
      return;
    }

    setItems((prev) => [
      ...prev,
      ...selectedEntries.map((entry) => {
        const hours = Number(entry.hours ?? 0);
        const rate = Number(entry.rate ?? 0);
        const amount =
          typeof entry.amount === "number"
            ? entry.amount
            : hours * rate;

        return {
          id: crypto.randomUUID(),
          description: entry.taskName || entry.notes || "Time entry",
          quantity: hours,
          rate,
          amount,
          kind: "TIME",
          sourceId: entry._id,
        } as InvoiceLineItem;
      }),
    ]);

    setIsTimeModalOpen(false);
    setSelectedTimeEntryIds([]);
  };

  // --- Submit handler ---

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    try {
      setSaving(true);
      setError(null);

      const cleanedItems: InvoiceLineItem[] = items
        .filter(
          (item) => item.description.trim() !== "" || (item.amount ?? 0) !== 0
        )
        .map((item) => {
          const quantity =
            typeof item.quantity === "number" && !Number.isNaN(item.quantity)
              ? item.quantity
              : 0;
          const rate =
            typeof item.rate === "number" && !Number.isNaN(item.rate)
              ? item.rate
              : 0;

          return {
            ...item,
            kind: item.kind ?? "MANUAL",
            quantity,
            rate,
            amount: quantity * rate,
          };
        });

      const res = await fetch(
        `/api/estates/${estateId}/invoices/${invoiceId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            number: invoiceNumber || undefined,
            status,
            notes,
            lineItems: cleanedItems,
          }),
        }
      );

      if (!res.ok) {
        const text = await res.text();
        console.error("Failed to update invoice", res.status, text);
        throw new Error(
          `Failed to update invoice (status ${res.status}). ${
            text || ""
          }`.trim()
        );
      }

      router.push(`/app/estates/${estateId}/invoices/${invoiceId}`);
    } catch (err) {
      console.error("Error saving invoice", err);
      setError("Unable to save invoice. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-sm text-slate-300">Loading invoice…</div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-50">
            Edit Invoice
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Adjust line items, amounts, and details for this invoice.
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-xs px-3 py-1.5 rounded border border-slate-700 text-slate-300 hover:bg-slate-800/60"
        >
          Back
        </button>
      </div>

      {error && (
        <div className="rounded border border-red-500/40 bg-red-900/20 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Invoice meta */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-300">Invoice #</span>
            <input
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              className="rounded border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
              placeholder="Auto or manual"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-300">Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
            >
              <option value="DRAFT">Draft</option>
              <option value="SENT">Sent</option>
              <option value="PAID">Paid</option>
              <option value="VOID">Void</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm md:col-span-1">
            <span className="text-slate-300">Notes (internal / footer)</span>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
              placeholder="Optional notes"
            />
          </label>
        </div>

        {/* Line items table */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 shadow-sm overflow-hidden">
          <div className="border-b border-slate-800 px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-medium text-slate-100">
                Line Items
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Edit hours, rates, or add manual charges. You can also pull time entries directly into this invoice.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={addItem}
                className="text-xs px-3 py-1.5 rounded border border-slate-700 bg-slate-900/60 text-slate-100 hover:bg-slate-800"
              >
                + Add Line Item
              </button>
              <button
                type="button"
                onClick={openTimeModal}
                className="text-xs px-3 py-1.5 rounded bg-sky-600 text-white hover:bg-sky-500"
              >
                Add from time entries
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-900/60 border-b border-slate-800 text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">
                    Description
                  </th>
                  <th className="px-3 py-2 text-right font-medium w-24">
                    Qty
                  </th>
                  <th className="px-3 py-2 text-right font-medium w-28">
                    Rate
                  </th>
                  <th className="px-3 py-2 text-right font-medium w-28">
                    Amount
                  </th>
                  <th className="px-3 py-2 text-right font-medium w-24">
                    Type
                  </th>
                  <th className="px-3 py-2 text-right font-medium w-12" />
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr
                    key={item._id ?? `row-${index}`}
                    className="border-b border-slate-800/60 last:border-b-0"
                  >
                    <td className="px-4 py-2 align-top">
                      <input
                        value={item.description}
                        onChange={(e) =>
                          updateItemField(
                            index,
                            "description",
                            e.target.value
                          )
                        }
                        placeholder="Description"
                        className="w-full rounded border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-500"
                      />
                    </td>
                    <td className="px-3 py-2 align-top text-right">
                      <input
                        value={
                          Number.isFinite(item.quantity) ? item.quantity : ""
                        }
                        onChange={(e) =>
                          updateItemField(index, "quantity", e.target.value)
                        }
                        className="w-full rounded border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-right text-xs text-slate-100 outline-none focus:border-sky-500"
                        inputMode="decimal"
                      />
                    </td>
                    <td className="px-3 py-2 align-top text-right">
                      <input
                        value={Number.isFinite(item.rate) ? item.rate : ""}
                        onChange={(e) =>
                          updateItemField(index, "rate", e.target.value)
                        }
                        className="w-full rounded border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-right text-xs text-slate-100 outline-none focus:border-sky-500"
                        inputMode="decimal"
                      />
                    </td>
                    <td className="px-3 py-2 align-top text-right text-slate-100">
                      ${" "}
                      {Number.isFinite(item.amount)
                        ? item.amount.toFixed(2)
                        : "0.00"}
                    </td>
                    <td className="px-3 py-2 align-top text-right text-xs text-slate-400">
                      {item.kind ?? "MANUAL"}
                    </td>
                    <td className="px-3 py-2 align-top text-right">
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="text-[11px] px-2 py-1 rounded border border-slate-700 text-slate-300 hover:bg-slate-800/80"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-slate-800 px-4 py-3 flex items-center justify-end gap-8 text-sm">
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-4">
                <span className="text-slate-400 text-xs uppercase tracking-wide">
                  Subtotal
                </span>
                <span className="text-slate-50 font-medium">
                  ${" "}
                  {Number.isFinite(subtotal)
                    ? subtotal.toFixed(2)
                    : "0.00"}
                </span>
              </div>
              <div className="flex items-center gap-4 mt-1">
                <span className="text-slate-400 text-xs uppercase tracking-wide">
                  Total
                </span>
                <span className="text-slate-50 font-semibold">
                  ${" "}
                  {Number.isFinite(total) ? total.toFixed(2) : "0.00"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {isTimeModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="w-full max-w-4xl rounded-lg border border-slate-700 bg-slate-950 p-6 shadow-2xl">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-50">
                    Add time entries to invoice
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">
                    Select one or more time entries to convert into invoice line items.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsTimeModalOpen(false)}
                  className="inline-flex items-center rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700/50"
                >
                  Close
                </button>
              </div>

              {timeError && (
                <p className="mb-3 text-xs text-red-400">{timeError}</p>
              )}

              {timeLoading ? (
                <div className="py-8 text-center text-sm text-slate-300">
                  Loading time entries...
                </div>
              ) : timeEntries.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-300">
                  No time entries found for this estate.
                </div>
              ) : (
                <div className="max-h-80 overflow-auto rounded-md border border-slate-800">
                  <table className="min-w-full divide-y divide-slate-800 text-xs">
                    <thead className="bg-slate-900/70">
                      <tr>
                        <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400">
                          Select
                        </th>
                        <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400">
                          Date
                        </th>
                        <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400">
                          Description
                        </th>
                        <th className="px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wide text-slate-400">
                          Hours
                        </th>
                        <th className="px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wide text-slate-400">
                          Rate
                        </th>
                        <th className="px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wide text-slate-400">
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 bg-slate-950/60">
                      {timeEntries.map((entry) => {
                        const isSelected = selectedTimeEntryIds.includes(entry._id);
                        const dateObj =
                          typeof entry.date === "string"
                            ? new Date(entry.date)
                            : entry.date;
                        const dateLabel = Number.isNaN(dateObj.getTime())
                          ? ""
                          : dateObj.toLocaleDateString();

                        return (
                          <tr
                            key={entry._id}
                            className={
                              (isSelected ? "bg-slate-900/80 " : "") +
                              "hover:bg-slate-900/70"
                            }
                          >
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                className="h-3 w-3 rounded border-slate-600 bg-slate-900 text-sky-500"
                                checked={isSelected}
                                onChange={() => toggleTimeSelection(entry._id)}
                              />
                            </td>
                            <td className="px-3 py-2 text-[11px] text-slate-200">
                              {dateLabel}
                            </td>
                            <td className="px-3 py-2 text-[11px] text-slate-200">
                              {entry.taskName || entry.notes || "Time entry"}
                            </td>
                            <td className="px-3 py-2 text-right text-[11px] text-slate-200">
                              {Number(entry.hours ?? 0).toFixed(2)}
                            </td>
                            <td className="px-3 py-2 text-right text-[11px] text-slate-200">
                              ${Number(entry.rate ?? 0).toFixed(2)}
                            </td>
                            <td className="px-3 py-2 text-right text-[11px] text-slate-200">
                              $
                              {Number(
                                typeof entry.amount === "number"
                                  ? entry.amount
                                  : Number(entry.hours ?? 0) *
                                    Number(entry.rate ?? 0)
                              ).toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setIsTimeModalOpen(false)}
                  className="text-xs text-slate-300 hover:text-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={addSelectedTimeEntriesToInvoice}
                  className="inline-flex items-center rounded-md bg-sky-500 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-60"
                  disabled={!selectedTimeEntryIds.length}
                >
                  Add selected entries
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() =>
              router.push(`/app/estates/${estateId}/invoices/${invoiceId}`)
            }
            className="text-xs px-3 py-2 rounded border border-slate-700 text-slate-200 hover:bg-slate-800/60"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="text-xs px-4 py-2 rounded bg-sky-600 text-white font-medium hover:bg-sky-500 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save Invoice"}
          </button>
        </div>
      </form>
    </div>
  );
}