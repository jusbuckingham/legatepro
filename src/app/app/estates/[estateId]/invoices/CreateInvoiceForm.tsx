"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { getApiErrorMessage, safeJson } from "@/lib/utils";

type Props = {
  estateId: string;
};

type CreateInvoiceResponse =
  | { ok: true; invoice?: { _id?: string } }
  | { ok: false; error?: string }
  | { invoice?: { _id?: string } };


function parseDateToIso(dateStr: string): string | undefined {
  const trimmed = dateStr.trim();
  if (!trimmed) return undefined;

  // Interpret date inputs as a calendar date (not local-time midnight) to avoid timezone drift.
  const d = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function getErrorStringFromResponse(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const maybe = data as { error?: unknown };
  return typeof maybe.error === "string" && maybe.error.trim().length > 0
    ? maybe.error
    : undefined;
}

export default function CreateInvoiceForm({ estateId }: Props) {
  const router = useRouter();

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");

  const [status, setStatus] = useState<"idle" | "creating" | "created" | "error">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);

  const isSubmitting = status === "creating";

  const resetFeedback = (): void => {
    if (status !== "idle") setStatus("idle");
    if (error) setError(null);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (isSubmitting) return;

    resetFeedback();
    setStatus("creating");

    const desc = description.trim();
    if (!desc) {
      setStatus("error");
      setError("Description is required.");
      return;
    }

    const amountNumber = Number.parseFloat(amount);
    if (!Number.isFinite(amountNumber) || amountNumber < 0) {
      setStatus("error");
      setError("Please enter a valid amount.");
      return;
    }

    const issueDateIso = parseDateToIso(issueDate);
    if (!issueDateIso) {
      setStatus("error");
      setError("Please choose a valid issue date.");
      return;
    }

    const dueDateIso = parseDateToIso(dueDate);

    const estateIdEncoded = encodeURIComponent(estateId);
    const amountCents = Math.round(amountNumber * 100);

    try {
      const res = await fetch(`/api/estates/${estateIdEncoded}/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: desc,
          // Prefer cents to avoid float rounding issues; keep `amount` for backwards compatibility if your API expects it.
          amountCents,
          amount: amountNumber,
          issueDate: issueDateIso,
          dueDate: dueDateIso,
        }),
      });

      const data = (await safeJson(res)) as CreateInvoiceResponse | null;

      if (!res.ok || (data && !Array.isArray(data) && "ok" in data && data.ok === false)) {
        const apiMessage = await Promise.resolve(getApiErrorMessage(res));
        const message = getErrorStringFromResponse(data) || apiMessage || "Failed to create invoice.";

        setStatus("error");
        setError(message);
        return;
      }

      const invoiceId =
        data &&
        typeof data === "object" &&
        "invoice" in data &&
        (data as { invoice?: { _id?: unknown } }).invoice &&
        typeof (data as { invoice?: { _id?: unknown } }).invoice?._id !== "undefined"
          ? String((data as { invoice?: { _id?: unknown } }).invoice?._id)
          : null;

      setStatus("created");

      // Reset form for quick entry.
      setDescription("");
      setAmount("");
      setIssueDate("");
      setDueDate("");

      if (invoiceId) {
        router.push(`/app/estates/${estateIdEncoded}/invoices/${encodeURIComponent(invoiceId)}/edit`);
      }

      router.refresh();
    } catch (err) {
      console.error(err);
      setStatus("error");
      setError("Network error while creating invoice.");
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      aria-busy={isSubmitting}
      className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/60 p-4"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Create invoice</h2>
          <p className="mt-1 text-xs text-slate-400">
            Create a draft invoice and then add/edit line items.
          </p>
        </div>
        {status === "created" ? (
          <span className="rounded-md bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-300">
            Created
          </span>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-md border border-red-900/40 bg-red-950/40 px-3 py-2 text-xs text-red-200" role="alert">
          {error}
        </div>
      ) : null}

      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-300">Description</label>
        <textarea
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-rose-500"
          rows={3}
          value={description}
          onChange={(e) => {
            resetFeedback();
            setDescription(e.target.value);
          }}
          placeholder="Estate filing fee, repair invoice, legal services…"
          required
          disabled={isSubmitting}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1 md:col-span-1">
          <label className="text-xs font-medium text-slate-300">Amount</label>
          <input
            type="number"
            min="0"
            step="0.01"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-rose-500"
            value={amount}
            onChange={(e) => {
              resetFeedback();
              setAmount(e.target.value);
            }}
            placeholder="0.00"
            required
            disabled={isSubmitting}
          />
          <p className="text-[11px] text-slate-500">Stored as cents to avoid rounding issues.</p>
        </div>

        <div className="space-y-1 md:col-span-1">
          <label className="text-xs font-medium text-slate-300">Issue date</label>
          <input
            type="date"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-rose-500"
            value={issueDate}
            onChange={(e) => {
              resetFeedback();
              setIssueDate(e.target.value);
            }}
            required
            disabled={isSubmitting}
          />
        </div>

        <div className="space-y-1 md:col-span-1">
          <label className="text-xs font-medium text-slate-300">Due date (optional)</label>
          <input
            type="date"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-rose-500"
            value={dueDate}
            onChange={(e) => {
              resetFeedback();
              setDueDate(e.target.value);
            }}
            disabled={isSubmitting}
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center justify-center rounded-md bg-rose-500 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Creating…" : "Create invoice"}
        </button>
      </div>
    </form>
  );
}