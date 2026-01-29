// src/app/app/estates/[estateId]/expenses/[expenseId]/page.tsx

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import PageHeader from "@/components/layout/PageHeader";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { requireEstateAccess, requireEstateEditAccess } from "@/lib/estateAccess";
import { Expense } from "@/models/Expense";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type EstateRole = "OWNER" | "EDITOR" | "VIEWER";

interface PageProps {
  params: Promise<{
    estateId: string;
    expenseId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

// Shape returned from Mongoose `.lean()`
interface ExpenseLean {
  _id: { toString(): string } | unknown;
  estateId: unknown;
  date?: string | Date;
  category?: string;
  payee?: string;
  description?: string;
  amount?: number;
  isReimbursable?: boolean;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

function isEstateRole(value: unknown): value is EstateRole {
  return value === "OWNER" || value === "EDITOR" || value === "VIEWER";
}

function getRoleFromAccess(access: unknown): EstateRole {
  if (!access || typeof access !== "object") return "VIEWER";
  const role = (access as Record<string, unknown>).role;
  return isEstateRole(role) ? role : "VIEWER";
}

function roleAtLeast(role: EstateRole, minRole: EstateRole): boolean {
  const order: Record<EstateRole, number> = { OWNER: 3, EDITOR: 2, VIEWER: 1 };
  return order[role] >= order[minRole];
}

function getParam(sp: Record<string, string | string[] | undefined> | undefined, key: string): string {
  const raw = sp?.[key];
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw[0] ?? "";
  return "";
}

function formatDisplayDate(value?: string | Date): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function formatDateTime(value?: string | Date): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function formatCurrency(amount?: number): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

async function loadExpense(estateId: string, expenseId: string): Promise<ExpenseLean | null> {
  await connectToDatabase();

  const doc = await Expense.findOne({
    _id: expenseId,
    estateId,
  })
    .lean<ExpenseLean | null>()
    .exec();

  return doc;
}

/**
 * Server action: delete this expense.
 * Requires EDITOR access. Uses a confirmation checkbox to avoid accidents.
 */
async function deleteExpense(formData: FormData): Promise<void> {
  "use server";

  const estateId = formData.get("estateId")?.toString();
  const expenseId = formData.get("expenseId")?.toString();
  const confirm = formData.get("confirmDelete")?.toString();

  if (!estateId || !expenseId) return;

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/app/estates/${estateId}/expenses/${expenseId}`);
  }

  const editAccess = await requireEstateEditAccess({ estateId, userId: session.user.id });
  const role = getRoleFromAccess(editAccess);
  if (!roleAtLeast(role, "EDITOR")) {
    redirect(`/app/estates/${estateId}/expenses/${expenseId}?forbidden=1`);
  }

  if (confirm !== "on") {
    redirect(`/app/estates/${estateId}/expenses/${expenseId}?confirm=1`);
  }

  await connectToDatabase();

  await Expense.findOneAndDelete({
    _id: expenseId,
    estateId,
  }).exec();

  revalidatePath(`/app/estates/${estateId}/expenses`);
  revalidatePath(`/app/estates/${estateId}`);
  redirect(`/app/estates/${estateId}/expenses?deleted=1`);
}

export default async function ExpenseDetailPage({ params, searchParams }: PageProps) {
  const { estateId, expenseId } = await params;

  const sp = searchParams ? await searchParams : undefined;
  const forbiddenRaw = getParam(sp, "forbidden");
  const confirmRaw = getParam(sp, "confirm");

  const forbidden = forbiddenRaw === "1" || forbiddenRaw.toLowerCase() === "true";
  const confirmNeeded = confirmRaw === "1" || confirmRaw.toLowerCase() === "true";

  if (!estateId || !expenseId) notFound();

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/app/estates/${estateId}/expenses/${expenseId}`);
  }

  let role: EstateRole = "VIEWER";
  try {
    const access = await requireEstateAccess({ estateId, userId: session.user.id });
    role = getRoleFromAccess(access);
  } catch {
    // Avoid leaking estate existence.
    notFound();
  }

  // If we redirected due to forbidden delete attempt, treat as read-only even if user is normally an editor.
  const isReadOnly = forbidden;
  const canEdit = roleAtLeast(role, "EDITOR") && !isReadOnly;

  const requestAccessHref = `/app/estates/${estateId}/collaborators?${
    new URLSearchParams({
      request: "EDITOR",
      from: "expense",
      expenseId,
    }).toString()
  }`;

  const doc = await loadExpense(estateId, expenseId);
  if (!doc) notFound();

  const docId = (doc._id as { toString?: () => string })?.toString?.() ?? String(doc._id);

  const dateDisplay = formatDisplayDate(doc.date);
  const category = (doc.category ?? "Uncategorized").trim() || "Uncategorized";
  const payee = (doc.payee ?? "").trim() || "—";
  const description = (doc.description ?? "").trim() || "—";
  const amountDisplay = formatCurrency(doc.amount);
  const reimbursable = Boolean(doc.isReimbursable);

  const categoryHref = (() => {
    const value = category.trim();
    if (!value || value === "Uncategorized") return "";
    return `/app/estates/${estateId}/expenses?${new URLSearchParams({ category: value }).toString()}`;
  })();

  const createdAtText = formatDateTime(doc.createdAt);
  const updatedAtText = formatDateTime(doc.updatedAt);

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
            <span className="truncate text-rose-200">{category !== "Uncategorized" ? category : "Expense"}</span>
          </nav>
        }
        title="Expense details"
        description="Review how this expense appears in your estate ledger and reimbursement summary."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-200">
              {role}
            </span>

            {!canEdit && (
              <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-950/50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-100">
                View-only
              </span>
            )}

            <Link
              href={`/app/estates/${estateId}/expenses`}
              className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/60"
            >
              Back
            </Link>

            {categoryHref ? (
              <Link
                href={categoryHref}
                className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/60"
              >
                Category index
              </Link>
            ) : null}

            {canEdit ? (
              <Link
                href={`/app/estates/${estateId}/expenses/${expenseId}/edit`}
                className="inline-flex items-center justify-center rounded-md border border-rose-500/60 bg-rose-500/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-rose-100 hover:bg-rose-500/20"
              >
                Edit
              </Link>
            ) : (
              <Link
                href={requestAccessHref}
                className="inline-flex items-center justify-center rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-100 hover:bg-amber-500/20"
              >
                Request access
              </Link>
            )}
          </div>
        }
      />

      {/* Notices */}
      <div className="space-y-3">
        {confirmNeeded && canEdit && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-950/40 p-3 text-sm text-amber-100">
            <p className="font-semibold">Confirm delete to continue</p>
            <p className="mt-0.5 text-xs text-amber-200/90">
              Please check the confirmation box in the Danger zone before deleting this expense.
            </p>
          </div>
        )}

        {!canEdit && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-950/40 p-3 text-sm text-amber-100">
            <p className="font-semibold">{forbidden ? "You don’t have permission to do that" : "You can view, but not edit"}</p>
            <p className="mt-0.5 text-xs text-amber-200/90">
              {forbidden
                ? "This action requires EDITOR access."
                : `Your role is ${role}. Ask an OWNER to grant EDITOR access if you need to make changes.`}
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Link
                href={requestAccessHref}
                className="inline-flex items-center justify-center rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-100 hover:bg-amber-500/20"
              >
                Request editor access
              </Link>
              <p className="text-[11px] text-amber-200/80">Tip: If you’re the OWNER, invite yourself from Collaborators.</p>
            </div>
          </div>
        )}
      </div>

      {/* Details */}
      <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Date</p>
            <p className="mt-1 text-sm font-medium text-slate-50">{dateDisplay}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Category</p>
                <p className="mt-1 text-sm font-medium text-slate-50">{category}</p>
              </div>
              {categoryHref ? (
                <Link
                  href={categoryHref}
                  className="mt-0.5 text-[11px] font-semibold text-slate-400 hover:text-slate-200 underline-offset-2 hover:underline"
                >
                  View all
                </Link>
              ) : null}
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Amount</p>
            <p className="mt-1 text-sm font-semibold text-emerald-200">{amountDisplay}</p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Payee</p>
            <p className="mt-1 text-sm font-medium text-slate-50">{payee}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Reimbursable</p>
            <p className="mt-1 text-sm font-medium text-slate-50">{reimbursable ? "Yes (reimbursable to PR)" : "No"}</p>
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Description</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-200">{description}</p>
        </div>
        <details className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
          <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-slate-300">
            Raw record
          </summary>
          <pre className="mt-3 max-h-80 overflow-auto rounded-md border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-200">
            {JSON.stringify(
              {
                ...doc,
                _id: docId,
              },
              null,
              2
            )}
          </pre>
        </details>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Record</p>
            <p className="mt-1 text-sm font-medium text-slate-50">{docId}</p>
            <p className="mt-0.5 text-xs text-slate-400">Created: {createdAtText}</p>
            <p className="mt-0.5 text-xs text-slate-400">Updated: {updatedAtText}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Next steps</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link
                href={`/app/estates/${estateId}/expenses`}
                className="inline-flex items-center justify-center rounded-md border border-slate-700 bg-slate-950/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/60"
              >
                Back to index
              </Link>
              {canEdit ? (
                <Link
                  href={`/app/estates/${estateId}/expenses/${expenseId}/edit`}
                  className="inline-flex items-center justify-center rounded-md bg-rose-500 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-950 hover:bg-rose-400"
                >
                  Edit expense
                </Link>
              ) : (
                <Link
                  href={requestAccessHref}
                  className="inline-flex items-center justify-center rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-100 hover:bg-amber-500/20"
                >
                  Request access
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Danger zone */}
      {canEdit ? (
        <section className="space-y-3 rounded-xl border border-rose-500/20 bg-rose-950/20 p-4 shadow-sm">
          <div>
            <h2 className="text-sm font-semibold text-rose-100">Danger zone</h2>
            <p className="mt-1 text-xs text-rose-200/80">Deleting removes this expense from the estate ledger.</p>
          </div>

          <form action={deleteExpense} className="space-y-3">
            <input type="hidden" name="estateId" value={estateId} />
            <input type="hidden" name="expenseId" value={expenseId} />

            <label className="flex items-start gap-2 text-xs text-rose-100">
              <input
                type="checkbox"
                name="confirmDelete"
                className="mt-0.5 h-4 w-4 rounded border-rose-500/40 bg-slate-950 text-rose-400 focus:ring-rose-400"
              />
              <span>I understand this will permanently delete this expense entry.</span>
            </label>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-md border border-rose-500/60 bg-rose-500/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-rose-100 hover:bg-rose-500/20"
              >
                Delete expense
              </button>

              <p className="text-[11px] text-rose-200/70">Tip: use Edit if you only need to correct details.</p>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}