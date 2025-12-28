'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getApiErrorMessage, safeJson } from '@/lib/utils';

type Props = {
  estateId: string;
};

export default function CreateInvoiceForm({ estateId }: Props) {
  const router = useRouter();

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<string>('');
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const amountNumber = Number(amount);
      if (!Number.isFinite(amountNumber) || amountNumber < 0) {
        throw new Error('Please enter a valid amount');
      }

      const res = await fetch(`/api/estates/${estateId}/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          amount: amountNumber,
          issueDate: new Date(issueDate).toISOString(),
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        }),
      });

      const data = (await safeJson(res)) as
        | { ok?: boolean; error?: string; message?: string; invoice?: { _id?: string } }
        | null;

      if (!res.ok || data?.ok === false) {
        const msg =
          typeof data?.error === 'string'
            ? data.error
            : typeof data?.message === 'string'
            ? data.message
            : await getApiErrorMessage(res);

        throw new Error(msg || 'Failed to create invoice');
      }

      setSuccess('Invoice created');
      setDescription('');
      setAmount('');
      setIssueDate('');
      setDueDate('');

      router.refresh();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || 'Something went wrong');
      } else {
        setError('Something went wrong');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-md border border-gray-200 bg-white p-4 shadow-sm"
    >
      <h2 className="text-lg font-semibold">Create Invoice</h2>

      {error && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">
          {success}
        </p>
      )}

      <div className="space-y-1">
        <label className="block text-sm font-medium">Description</label>
        <textarea
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium">Amount</label>
        <input
          type="number"
          min="0"
          step="0.01"
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <label className="block text-sm font-medium">Issue Date</label>
          <input
            type="date"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium">Due Date (optional)</label>
          <input
            type="date"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {isSubmitting ? 'Creating…' : 'Create Invoice'}
      </button>
    </form>
  );
}