"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { getApiErrorMessage, safeJson } from "@/lib/utils";

type InvoiceStatus = "draft" | "sent" | "paid" | "void" | (string & {});

type Props = {
  invoiceId: string;
  initialStatus: string;
  /** When true (default), show a confirmation before setting PAID or VOID */
  confirmFinalize?: boolean;
  /** When true, hide the Finalize (Paid/Void) controls */
  hideFinalize?: boolean;
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  void: "Void",
};

function normalizeStatus(value: string): InvoiceStatus {
  return (value || "draft").toLowerCase();
}

function getStatusLabel(value: InvoiceStatus): string {
  return STATUS_LABELS[String(value)] ?? String(value);
}

type OkResponse = { ok: true };

type ErrorResponse = {
  ok?: false;
  error?: string;
};

function getSuccessMessage(nextStatus: InvoiceStatus): string {
  switch (String(nextStatus)) {
    case "paid":
      return "Invoice marked as paid. (Locked)";
    case "void":
      return "Invoice voided. (Locked)";
    case "sent":
      return "Invoice marked as sent.";
    case "draft":
      return "Invoice reverted to draft.";
    default:
      return "Invoice status updated.";
  }
}

export default function InvoiceStatusButtons({
  invoiceId,
  initialStatus,
  confirmFinalize = true,
  hideFinalize = false,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [status, setStatus] = useState<InvoiceStatus>(
    normalizeStatus(initialStatus)
  );
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackType, setFeedbackType] = useState<
    "success" | "error" | null
  >(null);

  const isLocked = useMemo(
    () => status === "paid" || status === "void",
    [status]
  );

  const canInteract = !(isSaving || isPending);

  const updateStatus = useCallback(
    async (nextStatus: InvoiceStatus) => {
      if (!canInteract) return;

      const previousStatus = status;
      setStatus(nextStatus);
      setIsSaving(true);
      setFeedback(null);
      setFeedbackType(null);

      try {
        const res = await fetch(
          `/api/invoices/${encodeURIComponent(invoiceId)}/status`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: nextStatus }),
          }
        );

        const data = (await safeJson(res)) as OkResponse | ErrorResponse | null;

        if (!res.ok || data?.ok === false) {
          const apiMessage = await Promise.resolve(getApiErrorMessage(res));
          const message =
            (data && "error" in data ? data.error : undefined) ||
            apiMessage ||
            "Could not update invoice.";

          setStatus(previousStatus);
          setFeedback(message);
          setFeedbackType("error");
          return;
        }

        setFeedback(getSuccessMessage(nextStatus));
        setFeedbackType("success");

        startTransition(() => {
          router.refresh();
        });
      } catch (err) {
        console.error(err);
        setStatus(previousStatus);
        setFeedback("Network error while updating status.");
        setFeedbackType("error");
      } finally {
        setIsSaving(false);
      }
    },
    [canInteract, invoiceId, router, startTransition, status]
  );

  const label = getStatusLabel(status);

  // Terminal statuses should not be editable.
  if (isLocked) {
    return (
      <div className="flex items-center gap-2">
        <span
          title={`This invoice is locked because it is ${label.toLowerCase()}.`}
          className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase border ${
            status === "paid"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
              : "border-slate-500/40 bg-slate-500/10 text-slate-200"
          }`}
        >
          {label}
        </span>
        {feedback && (
          <p
            className={`text-[11px] ${
              feedbackType === "error" ? "text-red-400" : "text-emerald-400"
            }`}
            role={feedbackType === "error" ? "alert" : "status"}
            aria-live={feedbackType === "error" ? "assertive" : "polite"}
          >
            {feedback}
          </p>
        )}
      </div>
    );
  }

  const primaryActions: Array<{
    key: "draft" | "sent";
    label: string;
    title: string;
  }> =
    status === "draft"
      ? [{ key: "sent", label: "Mark as Sent", title: "Mark invoice as sent" }]
      : status === "sent"
      ? [{
          key: "draft",
          label: "Revert to Draft",
          title: "Move back to draft",
        }]
      : [{ key: "draft", label: "Set Draft", title: "Move back to draft" }];

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full border border-slate-800 bg-slate-900/70 px-2.5 py-1 text-xs font-medium capitalize text-slate-100">
          {label}
        </span>

        <div className="flex items-center gap-2">
          {primaryActions.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => void updateStatus(a.key)}
              disabled={!canInteract}
              title={a.title}
              className="inline-flex items-center gap-1 text-xs font-medium text-rose-300 hover:text-rose-200 hover:underline disabled:opacity-60"
            >
              {(isSaving || isPending) && (
                <span
                  className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent"
                  aria-hidden="true"
                />
              )}
              <span>{a.label}</span>
            </button>
          ))}

          {!hideFinalize && (
            <details className="group">
              <summary className="cursor-pointer select-none text-xs font-medium text-slate-300 hover:text-slate-100 hover:underline">
                Finalize
              </summary>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!canInteract}
                  className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold uppercase text-emerald-200 hover:bg-emerald-500/15 disabled:opacity-60"
                  title="Mark paid (locks editing)"
                  onClick={() => {
                    if (confirmFinalize) {
                      const ok = window.confirm(
                        "Mark this invoice as PAID? This will lock further edits."
                      );
                      if (!ok) return;
                    }
                    void updateStatus("paid");
                  }}
                >
                  Paid
                </button>

                <button
                  type="button"
                  disabled={!canInteract}
                  className="rounded-md border border-slate-500/40 bg-slate-500/10 px-2 py-1 text-[11px] font-semibold uppercase text-slate-200 hover:bg-slate-500/15 disabled:opacity-60"
                  title="Void (locks editing)"
                  onClick={() => {
                    if (confirmFinalize) {
                      const ok = window.confirm(
                        "VOID this invoice? This will lock further edits."
                      );
                      if (!ok) return;
                    }
                    void updateStatus("void");
                  }}
                >
                  Void
                </button>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Paid/Void are terminal statuses and will lock further edits.
              </p>
            </details>
          )}
        </div>
      </div>

      {feedback && (
        <p
          className={`text-[11px] ${
            feedbackType === "error" ? "text-red-400" : "text-emerald-400"
          }`}
          role={feedbackType === "error" ? "alert" : "status"}
          aria-live={feedbackType === "error" ? "assertive" : "polite"}
        >
          {feedback}
        </p>
      )}
    </div>
  );
}