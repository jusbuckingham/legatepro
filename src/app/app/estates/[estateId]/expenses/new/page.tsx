// src/app/app/estates/[estateId]/expenses/new/page.tsx

import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { connectToDatabase } from "@/lib/db";
import { Expense } from "@/models/Expense";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface PageProps {
  // Next 16: params is a Promise in server components
  params: Promise<{
    estateId: string;
  }>;
}

type ExpenseCategory =
  | "TAXES"
  | "INSURANCE"
  | "UTILITIES"
  | "REPAIRS"
  | "MORTGAGE"
  | "LEGAL_FEES"
  | "COURT_FEES"
  | "OTHER";

function normalizeCategory(raw: FormDataEntryValue | null): ExpenseCategory {
  if (!raw) return "OTHER";
  const v = raw.toString().trim().toLowerCase();

  if (v.includes("repair") || v.includes("maint")) return "REPAIRS";
  if (v.includes("tax")) return "TAXES";
  if (v.includes("insur")) return "INSURANCE";
  if (v.includes("utilit") || v.includes("water") || v.includes("gas") || v.includes("electric"))
    return "UTILITIES";
  if (v.includes("mortgage") || v.includes("loan")) return "MORTGAGE";
  if (v.includes("legal") || v.includes("attorney") || v.includes("lawyer"))
    return "LEGAL_FEES";

  // Keep COURT_FEES extremely strict: only match EXACT "court fee" or "court fees"
  if (v === "court fee" || v === "court fees") return "COURT_FEES";

  return "OTHER";
}

async function createExpense(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/api/auth/signin");
  }
  const ownerId = session.user.id;

  const estateId = formData.get("estateId");

  if (typeof estateId !== "string" || !estateId) {
    return;
  }

  const dateRaw = formData.get("date")?.toString();
  const rawCategory = formData.get("category");
  const category = normalizeCategory(rawCategory);

  const payee = formData.get("payee")?.toString().trim() || "";
  const description = formData.get("description")?.toString().trim() || "";
  const amountRaw = formData.get("amount")?.toString();
  const isReimbursable = formData.get("isReimbursable") === "on";

  const date = dateRaw ? new Date(dateRaw) : undefined;
  const amount = amountRaw ? Number(amountRaw) : undefined;

  // Require at least a description or an amount
  if (!description && (amount == null || Number.isNaN(amount))) {
    return;
  }

  await connectToDatabase();

  await Expense.create({
    ownerId,
    estateId,
    date: date && !Number.isNaN(date.getTime()) ? date : undefined,
    category,
    payee: payee || undefined,
    description: description || undefined,
    amount:
      amount != null && !Number.isNaN(amount)
        ? Number(amount.toFixed(2))
        : undefined,
    isReimbursable,
  });

  revalidatePath(`/app/estates/${estateId}/expenses`);
  redirect(`/app/estates/${estateId}/expenses`);
}

export default async function NewExpensePage({ params }: PageProps) {
  const { estateId } = await params; // ⬅️ key change

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
            Add expense
          </h1>
          <p className="text-sm text-slate-400">
            Log an expense related to this estate. It will show up in your
            ledger and reimbursement summary.
          </p>
        </div>
        <Link
          href={`/app/estates/${estateId}/expenses`}
          className="text-sm text-slate-300 underline-offset-2 hover:text-emerald-300 hover:underline"
        >
          Back to expenses
        </Link>
      </div>

      <form
        action={createExpense}
        className="max-w-2xl space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm"
      >
        <input type="hidden" name="estateId" value={estateId} />

        <div className="grid gap-3 md:grid-cols-[0.9fr,1fr,1fr]">
          <div className="space-y-1">
            <label
              htmlFor="date"
              className="text-xs font-medium text-slate-300"
            >
              Date
            </label>
            <input
              id="date"
              name="date"
              type="date"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-50 outline-none focus:border-emerald-400"
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor="category"
              className="text-xs font-medium text-slate-300"
            >
              Category
            </label>
            <input
              id="category"
              name="category"
              placeholder="Court fees, repairs, insurance..."
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-50 outline-none focus:border-emerald-400"
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor="payee"
              className="text-xs font-medium text-slate-300"
            >
              Payee
            </label>
            <input
              id="payee"
              name="payee"
              placeholder="Who was paid"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-50 outline-none focus:border-emerald-400"
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[1.4fr,0.6fr]">
          <div className="space-y-1">
            <label
              htmlFor="description"
              className="text-xs font-medium text-slate-300"
            >
              Description
            </label>
            <input
              id="description"
              name="description"
              placeholder="Short description for the ledger"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-50 outline-none focus:border-emerald-400"
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor="amount"
              className="text-xs font-medium text-slate-300"
            >
              Amount (USD)
            </label>
            <input
              id="amount"
              name="amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-50 outline-none focus:border-emerald-400"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              name="isReimbursable"
              className="h-3 w-3 rounded border-slate-600 bg-slate-950 text-emerald-500 focus:ring-emerald-500"
            />
            Reimbursable to PR
          </label>

          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-emerald-400"
          >
            Save expense
          </button>
        </div>
      </form>
    </div>
  );
}