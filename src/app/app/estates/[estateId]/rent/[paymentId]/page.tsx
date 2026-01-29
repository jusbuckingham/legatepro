import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { requireEstateAccess, requireEstateEditAccess } from "@/lib/estateAccess";
import { RentPayment } from "@/models/RentPayment";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = {
  title: "Rent payment | LegatePro",
};

type PageProps = {
  params: Promise<{
    estateId: string;
    paymentId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type LeanRentPayment = {
  _id: string;
  ownerId?: string | null;
  estateId: string;
  propertyId?: string;
  tenantName?: string;
  periodMonth?: number;
  periodYear?: number;
  amount?: number;
  paymentDate?: string | Date;
  method?: string | null;
  reference?: string | null;
  notes?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

function safeCallbackUrl(path: string): string {
  return encodeURIComponent(path);
}

function humanizeError(code: string): { title: string; detail: string } {
  switch (code) {
    case "delete_failed":
      return {
        title: "Delete failed",
        detail: "We couldn’t remove that payment. Please try again.",
      };
    case "not_found":
      return {
        title: "Payment not found",
        detail: "That payment may have been removed already.",
      };
    default:
      return {
        title: "Something went wrong",
        detail: "We couldn’t complete that action. Please try again.",
      };
  }
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

function formatCurrency(value?: number): string {
  if (value == null || Number.isNaN(value)) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return String(value);
  }
}

function coerceDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "object") {
    const maybe = (value as { toString?: () => string }).toString?.();
    if (typeof maybe === "string") {
      const d = new Date(maybe);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  return null;
}

function formatDate(value: unknown): string {
  const d = coerceDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatPeriod(month?: number, year?: number): string {
  if (!month || !year) return "—";
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

export default async function RentPaymentDetailPage({ params, searchParams }: PageProps) {
  const { estateId, paymentId } = await params;

  if (!estateId || !paymentId) {
    notFound();
  }

  const sp = searchParams ? await searchParams : undefined;
  const forbidden = getStringParam(sp, "forbidden") === "1";
  const deleted = getStringParam(sp, "deleted") === "1";
  const errorCode = getStringParam(sp, "error");

  const session = await auth();
  if (!session?.user?.id) {
    const callbackUrl = safeCallbackUrl(`/app/estates/${estateId}/rent/${paymentId}`);
    redirect(`/login?callbackUrl=${callbackUrl}`);
  }

  let access: Awaited<ReturnType<typeof requireEstateAccess>>;
  try {
    access = await requireEstateAccess({ estateId, userId: session.user.id });
  } catch (e) {
    console.error("[RentPaymentDetailPage] requireEstateAccess failed", {
      estateId,
      userId: session.user.id,
      error: e instanceof Error ? e.message : String(e),
    });
    redirect("/app/estates?error=estate_access");
  }

  const canEdit = access.role !== "VIEWER";

  await connectToDatabase();

  const doc = await RentPayment.findOne({
    _id: paymentId,
    estateId,
    // NOTE: We intentionally do NOT filter by ownerId here for now,
    // because some existing records may not have ownerId set.
  }).lean<LeanRentPayment | null>();

  if (!doc) {
    notFound();
  }

  const payment: LeanRentPayment = {
    ...doc,
    _id: String(doc._id),
    estateId: String(doc.estateId),
    propertyId: doc.propertyId ? String(doc.propertyId) : undefined,
  };

  async function deletePayment() {
    "use server";

    const innerSession = await auth();
    if (!innerSession?.user?.id) {
      const cb = safeCallbackUrl(`/app/estates/${estateId}/rent/${paymentId}`);
      redirect(`/login?callbackUrl=${cb}`);
    }

    const editAccess = await requireEstateEditAccess({ estateId, userId: innerSession.user.id });
    if (editAccess.role === "VIEWER") {
      redirect(`/app/estates/${estateId}/rent/${paymentId}?forbidden=1`);
    }

    await connectToDatabase();

    // Some legacy records may not have ownerId set; allow delete when ownerId is
    // either the current user or missing/null.
    try {
      const result = await RentPayment.deleteOne({
        _id: paymentId,
        estateId,
        $or: [
          { ownerId: innerSession.user.id },
          { ownerId: { $exists: false } },
          { ownerId: null },
        ],
      });

      if (!result || ("deletedCount" in result && result.deletedCount === 0)) {
        redirect(`/app/estates/${estateId}/rent/${paymentId}?error=delete_failed`);
      }
    } catch (e) {
      console.error("[RentPaymentDetailPage] deletePayment failed", {
        estateId,
        paymentId,
        userId: innerSession.user.id,
        error: e instanceof Error ? e.message : String(e),
      });
      redirect(`/app/estates/${estateId}/rent/${paymentId}?error=delete_failed`);
    }

    revalidatePath(`/app/estates/${estateId}/rent`);
    revalidatePath(`/app/estates/${estateId}/rent/${paymentId}`);
    if (payment.propertyId) {
      revalidatePath(`/app/estates/${estateId}/properties/${payment.propertyId}`);
      revalidatePath(`/app/estates/${estateId}/properties/${payment.propertyId}/rent`);
    }

    redirect(`/app/estates/${estateId}/rent?deleted=1`);
  }

  const period = formatPeriod(payment.periodMonth, payment.periodYear);
  const amount = formatCurrency(payment.amount);
  const paymentDate = formatDate(payment.paymentDate);
  const createdAt = formatDate(payment.createdAt);
  const updatedAt = formatDate(payment.updatedAt);

  const tenantLabel = (payment.tenantName ?? "").trim() || "Unknown tenant";
  const methodLabel = (payment.method ?? "").trim() || "Not specified";
  const referenceLabel = (payment.reference ?? "").trim() || "—";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <nav className="text-xs text-slate-500">
        <Link
          href="/app/estates"
          className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
        >
          Estates
        </Link>
        <span className="mx-1 text-slate-600">/</span>
        <Link
          href={`/app/estates/${estateId}`}
          className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
        >
          Estate
        </Link>
        <span className="mx-1 text-slate-600">/</span>
        <Link
          href={`/app/estates/${estateId}/rent`}
          className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
        >
          Rent
        </Link>
        <span className="mx-1 text-slate-600">/</span>
        <span className="text-rose-300">Payment</span>
      </nav>

      {forbidden ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium">Action blocked</p>
              <p className="text-xs text-rose-200">
                You don’t have edit permissions for this estate. Request access from the owner to edit or delete rent
                payments.
              </p>
            </div>
            <Link
              href={`/app/estates/${estateId}?requestAccess=1`}
              className="mt-2 inline-flex items-center justify-center rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-100 hover:bg-rose-500/25 md:mt-0"
            >
              Request edit access
            </Link>
          </div>
        </div>
      ) : null}

      {deleted ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium">Payment removed</p>
              <p className="text-xs text-emerald-200">This rent payment was removed and your ledger was refreshed.</p>
            </div>
            <Link
              href={`/app/estates/${estateId}/rent`}
              className="mt-2 inline-flex items-center justify-center rounded-md border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-500/25 md:mt-0"
            >
              Back to rent
            </Link>
          </div>
        </div>
      ) : null}

      {errorCode ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium">{humanizeError(errorCode).title}</p>
              <p className="text-xs text-rose-200">{humanizeError(errorCode).detail}</p>
            </div>
            <Link
              href={`/app/estates/${estateId}/rent/${paymentId}`}
              className="mt-2 inline-flex items-center justify-center rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-100 hover:bg-rose-500/25 md:mt-0"
            >
              Refresh
            </Link>
          </div>
        </div>
      ) : null}

      {!canEdit ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium">Viewer access</p>
              <p className="text-xs text-amber-200">You can view rent payments, but you can’t edit or delete them.</p>
            </div>
            <Link
              href={`/app/estates/${estateId}?requestAccess=1`}
              className="mt-2 inline-flex items-center justify-center rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-500/25 md:mt-0"
            >
              Request edit access
            </Link>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col justify-between gap-3 border-b border-slate-800 pb-4 sm:flex-row sm:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Rent payment</span>
            {!canEdit ? (
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-200">
                Read-only
              </span>
            ) : null}
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-50">{tenantLabel}</h1>
          <p className="mt-1 text-sm text-slate-400">
            Period <span className="font-medium text-slate-100">{period}</span>
            <span className="mx-2 text-slate-600">•</span>
            Amount <span className="font-medium text-emerald-300">{amount}</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Use this detail view for receipts, audits, and final estate accounting.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Link
            href={`/app/estates/${estateId}/rent`}
            className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-1.5 font-medium text-slate-200 hover:border-rose-500/70 hover:text-rose-100"
          >
            ← Back to rent ledger
          </Link>

          {payment.propertyId ? (
            <Link
              href={`/app/estates/${estateId}/properties/${payment.propertyId}/rent`}
              className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-1.5 font-medium text-slate-200 hover:border-rose-500/70 hover:text-rose-100"
            >
              Property rent
            </Link>
          ) : null}

          {canEdit ? (
            <>
              <Link
                href={`/app/estates/${estateId}/rent/${paymentId}/edit`}
                className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-semibold text-slate-50 hover:bg-slate-800"
              >
                Edit payment
              </Link>
              <form action={deletePayment}>
                <button
                  type="submit"
                  className="inline-flex items-center rounded-lg border border-rose-900/60 bg-rose-950/60 px-3 py-1.5 font-semibold text-rose-200 hover:bg-rose-900/60 hover:text-rose-50"
                >
                  Delete
                </button>
              </form>
            </>
          ) : null}
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm">
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Payment</h2>

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Amount</span>
            <span className="font-semibold text-emerald-300">{amount}</span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Payment date</span>
            <span className="text-slate-100">{paymentDate}</span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Method</span>
            <span className="text-slate-100">{methodLabel}</span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Reference</span>
            <span className="text-slate-100">{referenceLabel}</span>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm">
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Metadata</h2>

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Period</span>
            <span className="text-slate-100">{period}</span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Created</span>
            <span className="text-slate-100">{createdAt}</span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Last updated</span>
            <span className="text-slate-100">{updatedAt}</span>
          </div>
        </div>
      </section>

      <section className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Internal notes</h2>
          <span className="text-[10px] uppercase tracking-wide text-slate-600">Private</span>
        </div>
        <p className="whitespace-pre-wrap text-sm text-slate-200">
          {payment.notes && payment.notes.trim().length > 0 ? payment.notes : "No notes recorded for this payment."}
        </p>
      </section>

      <div className="flex items-center justify-between border-t border-slate-900 pt-4">
        <Link href={`/app/estates/${estateId}/rent`} className="text-xs font-medium text-slate-400 hover:text-slate-100">
          ← Back to rent ledger
        </Link>

        {payment.propertyId ? (
          <Link
            href={`/app/estates/${estateId}/properties/${payment.propertyId}`}
            className="text-xs font-medium text-slate-400 hover:text-slate-100"
          >
            View property →
          </Link>
        ) : null}
      </div>
    </div>
  );
}