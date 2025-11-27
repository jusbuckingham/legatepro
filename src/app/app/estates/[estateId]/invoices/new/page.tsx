"use client";

import { useState, FormEvent } from "react";
import { useRouter, useParams } from "next/navigation";

type RouteParams = {
  estateId: string;
};

export default function NewInvoicePage() {
  const router = useRouter();
  const params = useParams<RouteParams>();
  const estateId = params?.estateId;

  const [number, setNumber] = useState("");
  const [issueDate, setIssueDate] = useState(() => {
    const today = new Date();
    return today.toISOString().slice(0, 10); // yyyy-mm-dd
  });
  const [dueDate, setDueDate] = useState("");
  const [taxRate, setTaxRate] = useState("0");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!estateId || typeof estateId !== "string") {
      setError("Missing estate ID in URL.");
      return;
    }

    const taxRateNumber = Number.isFinite(Number(taxRate))
      ? Number(taxRate)
      : 0;

    setIsSubmitting(true);
    try {
      const response = await fetch(
        `/api/estates/${estateId}/invoices`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            number: number.trim() || undefined,
            issueDate,
            dueDate: dueDate || undefined,
            taxRate: taxRateNumber,
            notes: notes.trim() || undefined,
            // We'll add real line items (time + expenses) later
            lineItems: [],
          }),
        }
      );

      if (!response.ok) {
        let message = "Failed to create invoice.";
        try {
          const data = (await response.json()) as {
            error?: string;
            message?: string;
          };
          if (data.error) message = data.error;
          if (data.message) message = data.message;
        } catch {
          // ignore JSON parse errors, keep generic message
        }
        throw new Error(message);
      }

      const data = (await response.json()) as {
        invoiceId?: string;
        _id?: string;
        id?: string;
      };

      const createdId = data.invoiceId || data._id || data.id;
      if (!createdId) {
        throw new Error("Invoice created but no ID returned from server.");
      }

      router.push(
        `/app/estates/${estateId}/invoices/${createdId}`
      );
    } catch (err) {
      console.error("Error creating invoice", err);
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while creating the invoice."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (!estateId || typeof estateId !== "string") {
      router.push("/app/estates");
      return;
    }
    router.push(`/app/estates/${estateId}/invoices`);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-400">
              Billing &amp; Invoices
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-50">
              New Invoice
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Create an invoice for this estate. You can attach time and
              expenses after saving.
            </p>
          </div>
        </header>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg shadow-slate-950/40">
          {error && (
            <div className="mb-4 rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-6"
          >
            <div className="grid gap-4 md:grid-cols-3">
              <div className="md:col-span-1">
                <label className="block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                  Invoice Number
                </label>
                <input
                  type="text"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 outline-none ring-emerald-500/0 transition focus:border-emerald-400/80 focus:ring-2 focus:ring-emerald-500/40"
                  placeholder="Leave blank to auto-generate"
                />
              </div>

              <div>
                <label className="block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                  Issue Date
                </label>
                <input
                  type="date"
                  required
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 outline-none ring-emerald-500/0 transition focus:border-emerald-400/80 focus:ring-2 focus:ring-emerald-500/40"
                />
              </div>

              <div>
                <label className="block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                  Due Date
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 outline-none ring-emerald-500/0 transition focus:border-emerald-400/80 focus:ring-2 focus:ring-emerald-500/40"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="md:col-span-1">
                <label className="block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                  Tax Rate (%)
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 outline-none ring-emerald-500/0 transition focus:border-emerald-400/80 focus:ring-2 focus:ring-emerald-500/40"
                  placeholder="0.00"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Applied to the subtotal of time and expenses.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                Notes / Memo
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 outline-none ring-emerald-500/0 transition focus:border-emerald-400/80 focus:ring-2 focus:ring-emerald-500/40"
                placeholder="Optional notes for the court, beneficiaries, or your own records."
              />
            </div>

            <div className="mt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800/70"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/40 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting ? "Creating…" : "Create Invoice"}
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}