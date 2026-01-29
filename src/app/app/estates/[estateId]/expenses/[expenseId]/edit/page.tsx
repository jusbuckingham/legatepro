import Link from "next/link";
import { redirect, notFound } from "next/navigation";

import PageHeader from "@/components/layout/PageHeader";

import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { requireEstateEditAccess } from "@/lib/estateAccess";
import { Expense } from "@/models/Expense";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PageProps = {
  params: Promise<{
    estateId: string;
    expenseId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

interface ExpenseLean {
  _id: { toString(): string } | string;
  estateId: string;
  description?: string;
  category?: string;
  status?: string;
  payee?: string;
  notes?: string;
  reimbursable?: boolean;
  incurredAt?: Date | string;
  amountCents?: number;
  receiptUrl?: string;
}

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

function asString(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (v == null) return fallback;
  return String(v);
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function parseMoneyToCents(value: unknown): number {
  const s = asString(value, "").trim();
  if (!s) return 0;
  // Accept "$1,234.56" / "1234.56" / "1234"; strip everything except digits, dot, minus
  const cleaned = s.replace(/[^0-9.-]/g, "");
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function parseDateInput(value: unknown): string {
  // Prefer yyyy-mm-dd for <input type="date" />
  const s = asString(value, "").trim();
  if (!s) return "";
  // If already yyyy-mm-dd, keep it
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeExternalUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const u = new URL(trimmed);
    if (u.protocol === "http:" || u.protocol === "https:") return u.toString();
    return "";
  } catch {
    return "";
  }
}

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  TAXES: "Taxes",
  UTILITIES: "Utilities",
  INSURANCE: "Insurance",
  MAINTENANCE: "Maintenance",
  REPAIRS: "Repairs",
  CLEANING: "Cleaning",
  LEGAL: "Legal",
  COURT: "Court",
  TRAVEL: "Travel",
  SUPPLIES: "Supplies",
  CONTRACTOR: "Contractor",
  STORAGE: "Storage",
  OTHER: "Other",
};

function normalizeExpenseStatus(v: unknown): "PENDING" | "APPROVED" | "PAID" | "REJECTED" {
  const raw = asString(v, "PENDING").toUpperCase();
  if (raw === "APPROVED" || raw === "PAID" || raw === "REJECTED") return raw;
  return "PENDING";
}

export default async function EstateExpenseEditPage({ params, searchParams }: PageProps) {
  const { estateId, expenseId } = await params;

  const sp = searchParams ? await searchParams : undefined;
  const forbiddenFlag = getStringParam(sp, "forbidden") === "1";
  const notFoundFlag = getStringParam(sp, "notFound") === "1";

  const session = await auth();
  if (!session?.user?.id) {
    redirect(
      `/login?callbackUrl=${safeCallbackUrl(`/app/estates/${estateId}/expenses/${expenseId}/edit`)}`,
    );
  }

  await connectToDatabase();

  const access = await requireEstateEditAccess({ estateId, userId: session.user.id });
  const role = access.role;

  if (!role) {
    notFound();
  }

  if (role === "VIEWER") {
    redirect(`/app/estates/${estateId}/expenses?forbidden=1`);
  }

  const expense = await Expense.findOne({
    _id: expenseId,
    estateId,
  })
    .lean<ExpenseLean | null>()
    .exec();

  if (!expense) {
    redirect(`/app/estates/${estateId}/expenses?notFound=1`);
  }

  const amountCents = asNumber(expense.amountCents, 0);

  return (
    <div className="space-y-8 p-6">
      <PageHeader
        eyebrow={
          <nav className="text-xs text-slate-500">
            <Link href="/app/estates" className="text-slate-400 hover:text-slate-200 hover:underline">
              Estates
            </Link>
            <span className="mx-1 text-slate-600">/</span>
            <Link
              href={`/app/estates/${estateId}`}
              className="text-slate-400 hover:text-slate-200 hover:underline"
            >
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
            <span className="truncate text-rose-200">Edit</span>
          </nav>
        }
        title="Edit expense"
        description="Update this expense’s details, status, and receipt link. Changes flow into the estate ledger and reimbursement summaries."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-200">
              {role}
            </span>
            <Link
              href={`/app/estates/${estateId}/expenses/${expenseId}`}
              className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/60"
            >
              View
            </Link>
            <Link
              href={`/app/estates/${estateId}/expenses`}
              className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/60"
            >
              Back
            </Link>
          </div>
        }
      />

      {forbiddenFlag ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          <div className="font-medium">Action blocked</div>
          <div className="mt-1 text-xs text-rose-200">
            You don’t have edit permissions for this estate. Ask the estate owner to grant EDITOR access.
          </div>
        </div>
      ) : null}

      {notFoundFlag ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <div className="font-medium">Expense not found</div>
          <div className="mt-1 text-xs text-amber-200">
            This expense may have been removed or you may not have access.
          </div>
        </div>
      ) : null}

      {getStringParam(sp, "missing") === "1" ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <div className="font-medium">Missing details</div>
          <div className="mt-1 text-xs text-amber-200">Add at least a description or a positive amount to save.</div>
        </div>
      ) : null}

      <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4 sm:p-6">
        <form
          action={async (formData) => {
            "use server";

            const session = await auth();
            if (!session?.user?.id) {
              redirect(
                `/login?callbackUrl=${safeCallbackUrl(
                  `/app/estates/${estateId}/expenses/${expenseId}/edit`,
                )}`,
              );
            }

            await connectToDatabase();

            const access = await requireEstateEditAccess({ estateId, userId: session.user.id });
            if (access.role === "VIEWER") {
              redirect(`/app/estates/${estateId}/expenses?forbidden=1`);
            }

            const description = asString(formData.get("description"), "").trim();
            const category = asString(formData.get("category"), "OTHER").trim() || "OTHER";
            const status = normalizeExpenseStatus(formData.get("status"));
            const payee = asString(formData.get("payee"), "").trim();
            const notes = asString(formData.get("notes"), "").trim();
            const reimbursable = formData.get("reimbursable") === "on";
            const incurredAtRaw = asString(formData.get("incurredAt"), "");
            const incurredAt = parseDateInput(incurredAtRaw);
            const amountCentsNext = parseMoneyToCents(formData.get("amount"));
            const receiptUrl = normalizeExternalUrl(asString(formData.get("receiptUrl"), ""));

            if (!description && amountCentsNext <= 0) {
              redirect(`/app/estates/${estateId}/expenses/${expenseId}/edit?missing=1`);
            }

            const updated = await Expense.findOneAndUpdate(
              { _id: expenseId, estateId },
              {
                description,
                category,
                status,
                payee,
                notes,
                reimbursable,
                // Store as Date if provided; otherwise unset
                ...(incurredAt ? { incurredAt: new Date(incurredAt) } : { $unset: { incurredAt: 1 } }),
                amountCents: amountCentsNext,
                receiptUrl,
              },
              { new: true, runValidators: true },
            ).exec();

            if (!updated) {
              redirect(`/app/estates/${estateId}/expenses?notFound=1`);
            }

            revalidatePath(`/app/estates/${estateId}`);
            revalidatePath(`/app/estates/${estateId}/expenses`);
            revalidatePath(`/app/estates/${estateId}/expenses/${expenseId}`);

            redirect(`/app/estates/${estateId}/expenses/${expenseId}?updated=1`);
          }}
          className="space-y-6"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="description" className="text-xs font-medium text-slate-200">
                Description
              </label>
              <input
                id="description"
                name="description"
                defaultValue={asString(expense.description, "")}
                placeholder="e.g., Plumbing repair invoice"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-0 ring-emerald-500/0 transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="amount" className="text-xs font-medium text-slate-200">
                Amount
              </label>
              <input
                id="amount"
                name="amount"
                inputMode="decimal"
                defaultValue={amountCents ? (amountCents / 100).toFixed(2) : ""}
                placeholder="$0.00"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-0 ring-emerald-500/0 transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="category" className="text-xs font-medium text-slate-200">
                Category
              </label>
              <select
                id="category"
                name="category"
                defaultValue={asString(expense.category, "OTHER") || "OTHER"}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-0 ring-emerald-500/0 transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
              >
                {!Object.prototype.hasOwnProperty.call(EXPENSE_CATEGORY_LABELS, asString(expense.category, "OTHER")) ? (
                  <option value={asString(expense.category, "OTHER")}>{asString(expense.category, "OTHER")}</option>
                ) : null}
                {Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="incurredAt" className="text-xs font-medium text-slate-200">
                Date
              </label>
              <input
                id="incurredAt"
                name="incurredAt"
                type="date"
                defaultValue={parseDateInput(expense.incurredAt)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-0 ring-emerald-500/0 transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
              />
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
                defaultValue={asString(expense.payee, "")}
                placeholder="e.g., ABC Plumbing"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-0 ring-emerald-500/0 transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="status" className="text-xs font-medium text-slate-200">
                Status
              </label>
              <select
                id="status"
                name="status"
                defaultValue={normalizeExpenseStatus(expense.status)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-0 ring-emerald-500/0 transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
              >
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="PAID">Paid</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="receiptUrl" className="text-xs font-medium text-slate-200">
              Receipt URL
            </label>
            <input
              id="receiptUrl"
              name="receiptUrl"
              placeholder="https://..."
              defaultValue={asString(expense.receiptUrl, "")}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-0 ring-emerald-500/0 transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
            />
            <p className="text-[11px] text-slate-500">We only accept http(s) links. Leave blank to remove.</p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="notes" className="text-xs font-medium text-slate-200">
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={4}
              defaultValue={asString(expense.notes, "")}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-0 ring-emerald-500/0 transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-200">
              <input
                type="checkbox"
                name="reimbursable"
                defaultChecked={Boolean(expense.reimbursable)}
                className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500/40"
              />
              Reimbursable (to PR)
            </label>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link
                href={`/app/estates/${estateId}/expenses/${expenseId}`}
                className="inline-flex items-center rounded-lg border border-slate-800 px-4 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500/70 hover:text-slate-100"
              >
                Cancel
              </Link>
              <button
                type="submit"
                className="inline-flex items-center rounded-lg border border-emerald-500/60 bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-emerald-50 shadow-sm shadow-black/40 hover:bg-emerald-500"
              >
                Save changes
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-500">
            Tip: Use consistent categories and payee names so reimbursements and accounting exports stay clean.
          </p>
        </form>

        <div className="flex flex-col gap-2 border-t border-slate-800 pt-4 text-xs sm:flex-row sm:items-center sm:justify-between">
          <Link
            href={`/app/estates/${estateId}/expenses`}
            className="text-slate-400 hover:text-slate-200 underline-offset-2 hover:underline"
          >
            Back to expenses
          </Link>
          <span className="text-slate-500">
            Expense ID: <span className="font-mono text-[11px] text-slate-400">{expenseId}</span>
          </span>
        </div>
      </section>
    </div>
  );
}