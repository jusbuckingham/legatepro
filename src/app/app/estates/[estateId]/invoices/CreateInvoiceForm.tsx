"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { safeJson } from "@/lib/utils";

type Props = {
  estateId: string;
};

type CreateInvoiceResponse =
  | { ok: true; invoice: { _id: string } }
  | { ok: false; error?: string }
  | { invoice?: { _id?: string }; error?: string };

function parseDateToIso(dateStr: string): string | undefined {
  const trimmed = dateStr.trim();
  if (!trimmed) return undefined;

  // Expect YYYY-MM-DD from <input type="date">.
  const match = /^\d{4}-\d{2}-\d{2}$/.exec(trimmed);
  if (!match) return undefined;

  const [y, m, d] = trimmed.split("-").map((part) => Number(part));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return undefined;

  // Create a stable ISO date at UTC midnight for the selected calendar day.
  const utc = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  if (Number.isNaN(utc.getTime())) return undefined;

  // Guard against overflow (e.g., 2026-02-31).
  if (
    utc.getUTCFullYear() !== y ||
    utc.getUTCMonth() !== m - 1 ||
    utc.getUTCDate() !== d
  ) {
    return undefined;
  }

  return utc.toISOString();
}

export default function CreateInvoiceForm({ estateId }: Props) {
  const router = useRouter();

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");

  const [status, setStatus] = useState<"idle" | "creating" | "created" | "error">("idle");
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

      const apiMessage = res.ok ? undefined : (await res.text().catch(() => ""))?.trim();

      const explicitError =
        data && typeof data === "object" && !Array.isArray(data) && typeof (data as { error?: unknown }).error === "string"
          ? ((data as { error?: string }).error || "").trim()
          : "";

      if (!res.ok) {
        setStatus("error");
        setError((explicitError || apiMessage || "Failed to create invoice.").trim());
        return;
      }

      if (data && typeof data === "object" && !Array.isArray(data) && "ok" in data && (data as { ok?: unknown }).ok === false) {
        setStatus("error");
        setError((explicitError || "Failed to create invoice.").trim());
        return;
      }

      const invoiceIdRaw =
        data && typeof data === "object" && !Array.isArray(data)
          ? (data as { invoice?: { _id?: unknown } }).invoice?._id
          : undefined;

      const invoiceId = typeof invoiceIdRaw === "string" ? invoiceIdRaw : invoiceIdRaw != null ? String(invoiceIdRaw) : null;

      setStatus("created");

      // Reset form for quick entry.
      setDescription("");
      setAmount("");
      setIssueDate("");
      setDueDate("");

      if (invoiceId) {
        router.push(`/app/estates/${estateIdEncoded}/invoices/${encodeURIComponent(invoiceId)}/edit`);
        router.refresh();
        return;
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
      <p className="sr-only" aria-live="polite">
        {status === "creating"
          ? "Creating invoice"
          : status === "created"
            ? "Invoice created"
            : status === "error"
              ? "Invoice creation failed"
              : ""}
      </p>

      {error ? (
        <div className="rounded-md border border-red-900/40 bg-red-950/40 px-3 py-2 text-xs text-red-200" role="alert" aria-live="assertive">
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
            inputMode="decimal"
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