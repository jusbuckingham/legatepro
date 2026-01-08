import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { auth } from "@/lib/auth";
import { connectToDatabase, serializeMongoDoc } from "@/lib/db";
import { Expense } from "@/models/Expense";
import { ExpenseEditForm } from "@/components/expenses/ExpenseEditForm";

type PageProps = {
  params: Promise<{
    estateId: string;
    expenseId: string;
  }>;
};

export const metadata: Metadata = {
  title: "Edit Expense | LegatePro",
};

const asString = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : v == null ? fallback : String(v);

const asNumber = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

const asBoolean = (v: unknown): boolean => Boolean(v);

const asDateOrNull = (v: unknown): Date | null => {
  if (v instanceof Date) return v;
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};

const normalizeExpenseStatus = (
  v: unknown,
):
  | "PENDING"
  | "APPROVED"
  | "PAID"
  | "REJECTED" => {
  const raw = asString(v, "PENDING").toUpperCase();
  if (raw === "APPROVED" || raw === "PAID" || raw === "REJECTED") return raw;
  return "PENDING";
};

export default async function GlobalExpenseEditPage({ params }: PageProps) {
  const { expenseId, estateId: estateIdParam } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    notFound();
  }

  await connectToDatabase();

  const expenseDoc = await Expense.findOne({
    _id: expenseId,
    ownerId: session.user.id,
    estateId: estateIdParam,
  })
    .lean()
    .exec();

  if (!expenseDoc) {
    notFound();
  }

  const raw = serializeMongoDoc(expenseDoc) as Record<string, unknown>;

  const estateId = asString(raw.estateId, "");
  const amountCents = asNumber(raw.amountCents, 0);

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
          description: asString(raw.description, ""),
          category: asString(raw.category, ""),
          status: normalizeExpenseStatus(raw.status),
          payee: asString(raw.payee, ""),
          notes: asString(raw.notes, ""),
          reimbursable: asBoolean(raw.reimbursable),
          incurredAt: asDateOrNull(raw.incurredAt),
          amountCents,
          receiptUrl: asString(raw.receiptUrl, ""),
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