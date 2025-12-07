'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  invoiceId: string;
  initialStatus: string;
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  paid: 'Paid',
  sent: 'Sent',
  void: 'Void',
};

export default function InvoiceStatusButtons({
  invoiceId,
  initialStatus,
}: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackType, setFeedbackType] = useState<'success' | 'error' | null>(
    null,
  );

  const toggleStatus = async () => {
    if (isSaving) return;

    const previousStatus = status;
    const nextStatus = status === 'paid' ? 'draft' : 'paid';

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

      if (!res.ok) {
        setStatus(previousStatus);
        setFeedback('Could not update invoice status.');
        setFeedbackType('error');
        return;
      }

      setFeedback(
        nextStatus === 'paid'
          ? 'Invoice marked as paid.'
          : 'Invoice reverted to draft.',
      );
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

  const label = STATUS_LABELS[status] ?? status;

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium capitalize">
        {label}
      </span>
      <button
        type="button"
        onClick={toggleStatus}
        disabled={isSaving || isPending}
        className="flex items-center gap-1 text-xs text-blue-600 hover:underline disabled:opacity-60"
      >
        {(isSaving || isPending) && (
          <span
            className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent"
            aria-hidden="true"
          />
        )}
        <span>
          {status === 'paid' ? 'Mark as Draft' : 'Mark as Paid'}
        </span>
      </button>
      {feedback && (
        <p
          className={`mt-1 text-[11px] ${
            feedbackType === 'error' ? 'text-red-600' : 'text-green-600'
          }`}
        >
          {feedback}
        </p>
      )}
    </div>
  );
}