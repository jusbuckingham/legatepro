'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'void' | string;

type Props = {
  invoiceId: string;
  initialStatus: string;
  /** When true (default), show a confirmation before setting PAID or VOID */
  confirmFinalize?: boolean;
  /** When true, hide the Finalize (Paid/Void) controls */
  hideFinalize?: boolean;
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  paid: 'Paid',
  void: 'Void',
};

function normalizeStatus(s: string): InvoiceStatus {
  const v = (s || 'draft').toLowerCase();
  return v;
}

export default function InvoiceStatusButtons({
  invoiceId,
  initialStatus,
  confirmFinalize = true,
  hideFinalize = false,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [status, setStatus] = useState<InvoiceStatus>(normalizeStatus(initialStatus));
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackType, setFeedbackType] = useState<'success' | 'error' | null>(null);

  const isLocked = useMemo(() => status === 'paid' || status === 'void', [status]);

  const updateStatus = async (nextStatus: InvoiceStatus) => {
    if (isSaving) return;

    const previousStatus = status;
    setStatus(nextStatus);
    setIsSaving(true);
    setFeedback(null);
    setFeedbackType(null);

    try {
      const res = await fetch(`/api/invoices/${invoiceId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });

      const data = await safeJson<{ ok?: boolean; error?: string }>(res);

      if (!res.ok || data?.ok === false) {
        setStatus(previousStatus);
        setFeedback(data?.error || 'Could not update invoice.');
        setFeedbackType('error');
        return;
      }

      const msg =
        nextStatus === 'paid'
          ? 'Invoice marked as paid. (Locked)'
          : nextStatus === 'void'
            ? 'Invoice voided. (Locked)'
            : nextStatus === 'sent'
              ? 'Invoice marked as sent.'
              : 'Invoice reverted to draft.';

      setFeedback(msg);
      setFeedbackType('success');

      startTransition(() => {
        router.refresh();
      });
    } catch {
      setStatus(previousStatus);
      setFeedback('Network error while updating status.');
      setFeedbackType('error');
    } finally {
      setIsSaving(false);
    }
  };

  const label = STATUS_LABELS[String(status)] ?? String(status);

  // Terminal statuses should not be editable.
  if (isLocked) {
    return (
      <div className="flex items-center gap-2">
        <span
          title={`This invoice is locked because it is ${label.toLowerCase()}.`}
          className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase border ${
            status === 'paid'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
              : 'border-slate-500/40 bg-slate-500/10 text-slate-200'
          }`}
        >
          {label}
        </span>
        {feedback && (
          <p
            className={`text-[11px] ${
              feedbackType === 'error' ? 'text-red-600' : 'text-green-600'
            }`}
          >
            {feedback}
          </p>
        )}
      </div>
    );
  }

  const canInteract = !(isSaving || isPending);

  const primaryActions: Array<{ key: 'draft' | 'sent'; label: string; title: string }> =
    status === 'draft'
      ? [{ key: 'sent', label: 'Mark as Sent', title: 'Mark invoice as sent' }]
      : status === 'sent'
        ? [{ key: 'draft', label: 'Revert to Draft', title: 'Move back to draft' }]
        : [{ key: 'draft', label: 'Set Draft', title: 'Move back to draft' }];

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium capitalize">
          {label}
        </span>

        <div className="flex items-center gap-2">
          {primaryActions.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => updateStatus(a.key)}
              disabled={!canInteract}
              title={a.title}
              className="flex items-center gap-1 text-xs text-blue-600 hover:underline disabled:opacity-60"
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
              <summary className="cursor-pointer select-none text-xs text-slate-600 hover:underline">
                Finalize
              </summary>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!canInteract}
                  className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold uppercase text-emerald-700 hover:bg-emerald-500/15 disabled:opacity-60"
                  title="Mark paid (locks editing)"
                  onClick={() => {
                    if (confirmFinalize) {
                      const ok = window.confirm(
                        'Mark this invoice as PAID? This will lock further edits.',
                      );
                      if (!ok) return;
                    }
                    void updateStatus('paid');
                  }}
                >
                  Paid
                </button>

                <button
                  type="button"
                  disabled={!canInteract}
                  className="rounded-md border border-slate-500/40 bg-slate-500/10 px-2 py-1 text-[11px] font-semibold uppercase text-slate-700 hover:bg-slate-500/15 disabled:opacity-60"
                  title="Void (locks editing)"
                  onClick={() => {
                    if (confirmFinalize) {
                      const ok = window.confirm(
                        'VOID this invoice? This will lock further edits.',
                      );
                      if (!ok) return;
                    }
                    void updateStatus('void');
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
            feedbackType === 'error' ? 'text-red-600' : 'text-green-600'
          }`}
        >
          {feedback}
        </p>
      )}
    </div>
  );
}