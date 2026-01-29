// src/app/app/estates/[estateId]/expenses/new/page.tsx

import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import PageHeader from "@/components/layout/PageHeader";

import { connectToDatabase } from "@/lib/db";
import { auth } from "@/lib/auth";
import { requireEstateEditAccess } from "@/lib/estateAccess";
import { Expense } from "@/models/Expense";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface PageProps {
  // Next 16: params is a Promise in server components
  params: Promise<{ estateId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
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

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  TAXES: "Taxes",
  INSURANCE: "Insurance",
  UTILITIES: "Utilities",
  REPAIRS: "Repairs / maintenance",
  MORTGAGE: "Mortgage / loan",
  LEGAL_FEES: "Legal fees",
  COURT_FEES: "Court fees",
  OTHER: "Other",
};

function getStringParam(
  sp: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string {
  const raw = sp?.[key];
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw[0] ?? "";
  return "";
}

function safeCallbackUrl(path: string): string {
  return encodeURIComponent(path);
}

function normalizeCategory(raw: FormDataEntryValue | null): ExpenseCategory {
  if (!raw) return "OTHER";
  const v = raw.toString().trim().toLowerCase();

  // Prefer exact enum values if they arrive from a <select>
  const upper = v.toUpperCase();
  if (
    upper === "TAXES" ||
    upper === "INSURANCE" ||
    upper === "UTILITIES" ||
    upper === "REPAIRS" ||
    upper === "MORTGAGE" ||
    upper === "LEGAL_FEES" ||
    upper === "COURT_FEES" ||
    upper === "OTHER"
  ) {
    return upper as ExpenseCategory;
  }

  // Fallback to fuzzy matching for freeform input
  if (v.includes("repair") || v.includes("maint")) return "REPAIRS";
  if (v.includes("tax")) return "TAXES";
  if (v.includes("insur")) return "INSURANCE";
  if (v.includes("utilit") || v.includes("water") || v.includes("gas") || v.includes("electric")) {
    return "UTILITIES";
  }
  if (v.includes("mortgage") || v.includes("loan")) return "MORTGAGE";
  if (v.includes("legal") || v.includes("attorney") || v.includes("lawyer")) return "LEGAL_FEES";
  if (v === "court fee" || v === "court fees") return "COURT_FEES";

  return "OTHER";
}

function parseAmount(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/[$,\s]/g, "").trim();
  if (!cleaned) return undefined;
  const n = Number(cleaned);
  if (Number.isNaN(n) || !Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100) / 100;
}

async function createExpense(formData: FormData): Promise<void> {
  "use server";

  const estateId = formData.get("estateId");
  if (typeof estateId !== "string" || !estateId) return;

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${safeCallbackUrl(`/app/estates/${estateId}/expenses/new`)}`);
  }

  const userId = session.user.id;
  const dateRaw = formData.get("date")?.toString();
  const category = normalizeCategory(formData.get("category"));
  const payee = formData.get("payee")?.toString().trim() || "";
  const description = formData.get("description")?.toString().trim() || "";
  const amount = parseAmount(formData.get("amount")?.toString() ?? null);
  const isReimbursable = formData.get("isReimbursable") === "on";

  const date = dateRaw ? new Date(dateRaw) : undefined;
  const dateIsValid = date && !Number.isNaN(date.getTime());

  // Require at least description OR amount
  if (!description && amount == null) {
    redirect(`/app/estates/${estateId}/expenses/new?missing=1`);
  }

  await connectToDatabase();

  const access = await requireEstateEditAccess({ estateId, userId });
  if (!access?.role || access.role === "VIEWER") {
    redirect(`/app/estates/${estateId}/expenses/new?forbidden=1`);
  }

  await Expense.create({
    ownerId: userId,
    estateId,
    date: dateIsValid ? date : undefined,
    category,
    payee: payee || undefined,
    description: description || undefined,
    amount,
    isReimbursable,
  });

  revalidatePath(`/app/estates/${estateId}`);
  revalidatePath(`/app/estates/${estateId}/expenses`);

  redirect(`/app/estates/${estateId}/expenses?created=1`);
}

export default async function NewExpensePage({ params, searchParams }: PageProps) {
  const { estateId } = await params;
  const sp = searchParams ? await searchParams : undefined;

  const forbiddenFlag = getStringParam(sp, "forbidden") === "1";
  const missingFlag = getStringParam(sp, "missing") === "1";

  return (
    <div className="space-y-8 p-6">
      <PageHeader
        eyebrow={
          <nav className="text-xs text-slate-500">
            <Link href="/app/estates" className="text-slate-400 hover:text-slate-200 hover:underline">
              Estates
            </Link>
            <span className="mx-1 text-slate-600">/</span>
            <Link href={`/app/estates/${estateId}`} className="text-slate-400 hover:text-slate-200 hover:underline">
              Overview
            </Link>
            <span className="mx-1 text-slate-600">/</span>
            <Link
              href={`/app/estates/${estateId}/expenses`}
              className="text-slate-400 hover:text-slate-200 hover:underline"
            >
              Expenses
            </Link>
            <span className="mx-1 text-slate-600">/</span>
            <span className="truncate text-rose-200">New</span>
          </nav>
        }
        title="Add expense"
        description="Log an expense related to this estate. It will show up in your ledger and reimbursement summary."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link
              href={`/app/estates/${estateId}/expenses`}
              className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/60"
            >
              Back to expenses
            </Link>
          </div>
        }
      />

      {forbiddenFlag ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 text-sm text-rose-100">
          <p className="font-semibold">Action blocked</p>
          <p className="mt-0.5 text-xs text-rose-200/90">This action requires EDITOR access for the estate.</p>
        </div>
      ) : null}

      {missingFlag ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/40 p-3 text-sm text-amber-100">
          <p className="font-semibold">Missing required info</p>
          <p className="mt-0.5 text-xs text-amber-200/90">Add at least a description or an amount, then try again.</p>
        </div>
      ) : null}

      <form action={createExpense} className="max-w-2xl space-y-6 rounded-xl border border-slate-800 bg-slate-950/40 p-4 sm:p-6">
        <input type="hidden" name="estateId" value={estateId} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="date" className="text-xs font-medium text-slate-200">
              Date
            </label>
            <input
              id="date"
              name="date"
              type="date"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-0 ring-emerald-500/0 transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
            />
            <p className="text-[11px] text-slate-500">Leave blank if the exact date is unknown.</p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="category" className="text-xs font-medium text-slate-200">
              Category
            </label>
            <select
              id="category"
              name="category"
              defaultValue="OTHER"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-0 ring-emerald-500/0 transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
            >
              {(Object.keys(CATEGORY_LABELS) as ExpenseCategory[]).map((key) => (
                <option key={key} value={key}>
                  {CATEGORY_LABELS[key]}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500">Pick the closest match. You can refine later.</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="payee" className="text-xs font-medium text-slate-200">
              Payee
            </label>
            <input
              id="payee"
              name="payee"
              placeholder="Who was paid"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-0 ring-emerald-500/0 transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="amount" className="text-xs font-medium text-slate-200">
              Amount (USD)
            </label>
            <input
              id="amount"
              name="amount"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-0 ring-emerald-500/0 transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
            />
            <p className="text-[11px] text-slate-500">You can paste values like $1,234.56.</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="description" className="text-xs font-medium text-slate-200">
            Description
          </label>
          <input
            id="description"
            name="description"
            placeholder="Short description for the ledger"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-0 ring-emerald-500/0 transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
          />
          <p className="text-[11px] text-slate-500">Example: “Furnace repair (invoice #1029)”</p>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-200">
            <input
              type="checkbox"
              name="isReimbursable"
              className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500/40"
            />
            Reimbursable to PR
          </label>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link
              href={`/app/estates/${estateId}/expenses`}
              className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 px-4 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-900/60"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
            >
              Save expense
            </button>
          </div>
        </div>
      </form>

      <div className="max-w-2xl rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-xs text-slate-300">
        <p className="font-semibold text-slate-100">Quick tips</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-300">
          <li>Keep descriptions specific so the final estate accounting is painless.</li>
          <li>If the expense is reimbursable, be consistent: only mark items actually paid by the PR.</li>
          <li>Upload/attach receipts as documents when possible.</li>
        </ul>
      </div>
    </div>
  );
}