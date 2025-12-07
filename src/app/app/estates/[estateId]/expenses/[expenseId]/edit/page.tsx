import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Expense } from "@/models/Expense";
import { ExpenseEditForm } from "@/components/expenses/ExpenseEditForm";

type PageProps = {
  params: Promise<{
    expenseId: string;
  }>;
};

export const metadata: Metadata = {
  title: "Edit Expense | LegatePro",
};

export default async function GlobalExpenseEditPage({ params }: PageProps) {
  const { expenseId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    notFound();
  }

  await connectToDatabase();

  const expenseDoc = await Expense.findOne({
    _id: expenseId,
    ownerId: session.user.id,
  })
    .lean()
    .exec();

  if (!expenseDoc) {
    notFound();
  }

  // Narrow the lean() result into a shape with the fields we care about
  const raw = expenseDoc as unknown as {
    estateId?: unknown;
    amountCents?: number;
    status?: string;
    reimbursable?: boolean;
    incurredAt?: Date | null;
    receiptUrl?: string;
    description?: string;
    category?: string;
    payee?: string;
    notes?: string;
  };

  const estateId =
    typeof raw.estateId === "string"
      ? raw.estateId
      : String((raw.estateId as unknown) ?? "");

  const amountCents =
    typeof raw.amountCents === "number" ? raw.amountCents : 0;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-slate-500">
          Expenses
        </p>
        <h1 className="text-2xl font-semibold text-slate-100">
          Edit expense
        </h1>
        <p className="text-sm text-slate-400">
          Update this expense&apos;s details, status, and receipt link. Changes
          will automatically flow into your estate and billing summaries.
        </p>
      </header>

      <ExpenseEditForm
        estateId={estateId}
        expenseId={expenseId}
        initialExpense={{
          description: raw.description ?? "",
          category: raw.category ?? "",
          status: (raw.status as
            | "PENDING"
            | "APPROVED"
            | "PAID"
            | "REJECTED"
            | undefined) ?? "PENDING",
          payee: raw.payee ?? "",
          notes: raw.notes ?? "",
          reimbursable: Boolean(raw.reimbursable),
          incurredAt: raw.incurredAt ?? null,
          amountCents,
          receiptUrl: raw.receiptUrl ?? "",
        }}
      />

      <footer className="flex justify-between pt-2 text-xs text-slate-500">
        {estateId ? (
          <Link
            href={`/app/estates/${estateId}/expenses`}
            className="hover:text-slate-300"
          >
            ← Back to estate expenses
          </Link>
        ) : (
          <Link href="/app/estates" className="hover:text-slate-300">
            ← Back to estates
          </Link>
        )}
        <span>
          Expense ID:{" "}
          <span className="font-mono text-slate-400">{expenseId}</span>
        </span>
      </footer>
    </div>
  );
}