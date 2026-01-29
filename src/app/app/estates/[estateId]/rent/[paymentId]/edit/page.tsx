// src/app/app/estates/[estateId]/rent/[paymentId]/edit/page.tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { requireEstateAccess, requireEstateEditAccess } from "@/lib/estateAccess";
import { RentPayment } from "@/models/RentPayment";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = {
  title: "Edit rent payment | LegatePro",
};

type PageProps = {
  params: Promise<{
    estateId: string;
    paymentId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type EstateRole = "OWNER" | "EDITOR" | "VIEWER";

function firstParam(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? "" : "";
}

function safeCallbackUrl(path: string): string {
  return encodeURIComponent(path);
}

function coerceInt(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(String(value ?? ""));
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function coerceNumber(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(String(value ?? ""));
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function parseDateInput(value: unknown): Date | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toDateInputValue(date?: Date): string {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function formatDateTime(value: Date): string {
  try {
    return value.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return value.toISOString();
  }
}

function roleLabel(role: EstateRole): string {
  if (role === "OWNER") return "Owner";
  if (role === "EDITOR") return "Editor";
  return "Viewer";
}

function canEditRole(role: EstateRole): boolean {
  return role === "OWNER" || role === "EDITOR";
}

type RentPaymentLeanFromDb = {
  _id: { toString(): string };
  estateId: { toString(): string };
  propertyId?: { toString(): string };
  tenantName: string;
  unit?: string;
  periodMonth: number;
  periodYear: number;
  amount: number;
  paymentDate: Date;
  method?: string;
  reference?: string;
  status?: string;
  receivedAt?: Date;
  periodStart?: Date;
  periodEnd?: Date;
  memo?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
};

type LeanRentPayment = {
  _id: string;
  estateId: string;
  propertyId?: string;

  tenantName: string;
  unit?: string;

  periodMonth: number;
  periodYear: number;

  amount: number;
  paymentDate: string; // YYYY-MM-DD

  method?: string;
  reference?: string;
  status?: string;

  receivedAt?: string; // YYYY-MM-DD
  periodStart?: string; // YYYY-MM-DD
  periodEnd?: string; // YYYY-MM-DD

  memo?: string;
  notes?: string;

  createdAt: string;
  updatedAt: string;
};

export default async function EditRentPaymentPage({ params, searchParams }: PageProps) {
  const { estateId, paymentId } = await params;

  const sp = searchParams ? await searchParams : undefined;
  const forbiddenFlag = firstParam(sp?.forbidden) === "1";
  const errorCode = firstParam(sp?.error);

  const session = await auth();
  if (!session?.user?.id) {
    const cb = `/app/estates/${estateId}/rent/${paymentId}/edit`;
    redirect(`/login?callbackUrl=${safeCallbackUrl(cb)}`);
  }

  // Access: page-level (lets us show role chip + read-only guard UI)
  const access = await requireEstateAccess({ estateId, userId: session.user.id });
  const role: EstateRole = (access?.role as EstateRole) ?? "VIEWER";
  const editEnabled = canEditRole(role);

  // Hard edit guard: if you can't edit, keep it deterministic and bounce with a banner.
  if (!editEnabled) {
    redirect(`/app/estates/${estateId}/rent/${paymentId}?forbidden=1`);
  }

  await connectToDatabase();

  const doc = await RentPayment.findOne({
    _id: paymentId,
    estateId,
  }).lean<RentPaymentLeanFromDb | null>();

  if (!doc) {
    notFound();
  }

  const payment: LeanRentPayment = {
    _id: doc._id.toString(),
    estateId: doc.estateId.toString(),
    propertyId: doc.propertyId ? doc.propertyId.toString() : undefined,

    tenantName: doc.tenantName,
    unit: doc.unit,

    periodMonth: doc.periodMonth,
    periodYear: doc.periodYear,

    amount: doc.amount,
    paymentDate: toDateInputValue(doc.paymentDate),

    method: doc.method,
    reference: doc.reference,
    status: doc.status,

    receivedAt: doc.receivedAt ? toDateInputValue(doc.receivedAt) : undefined,
    periodStart: doc.periodStart ? toDateInputValue(doc.periodStart) : undefined,
    periodEnd: doc.periodEnd ? toDateInputValue(doc.periodEnd) : undefined,

    memo: doc.memo,
    notes: doc.notes,

    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };

  async function updateRentPayment(formData: FormData) {
    "use server";

    const innerSession = await auth();
    if (!innerSession?.user?.id) {
      redirect("/login");
    }

    // Re-check edit access on mutation (never trust just the UI)
    const editAccess = await requireEstateEditAccess({
      estateId,
      userId: innerSession.user.id,
    });

    if (editAccess.role === "VIEWER") {
      redirect(`/app/estates/${estateId}/rent/${paymentId}/edit?forbidden=1`);
    }

    await connectToDatabase();

    const tenantName = String(formData.get("tenantName") ?? "").trim();
    const unitRaw = String(formData.get("unit") ?? "").trim();
    const unit = unitRaw || undefined;

    // Period + amount
    const rawMonth = coerceInt(formData.get("periodMonth"), payment.periodMonth);
    const rawYear = coerceInt(formData.get("periodYear"), payment.periodYear);
    const periodMonth = clamp(rawMonth, 1, 12);
    const currentYear = new Date().getFullYear();
    const periodYear = clamp(rawYear, currentYear - 25, currentYear + 2);

    const amountRaw = coerceNumber(formData.get("amount"), payment.amount);
    const amount = Math.max(0, amountRaw);

    // Optional dates (only write if provided; otherwise keep existing)
    const paymentDate = parseDateInput(formData.get("paymentDate"));
    const receivedAt = parseDateInput(formData.get("receivedAt"));
    const periodStart = parseDateInput(formData.get("periodStart"));
    const periodEnd = parseDateInput(formData.get("periodEnd"));

    const methodRaw = String(formData.get("method") ?? "").trim();
    const referenceRaw = String(formData.get("reference") ?? "").trim();
    const statusRaw = String(formData.get("status") ?? "").trim();
    const memoRaw = String(formData.get("memo") ?? "").trim();
    const notesRaw = String(formData.get("notes") ?? "").trim();

    if (!tenantName) {
      redirect(`/app/estates/${estateId}/rent/${paymentId}/edit?error=missing_tenant`);
    }

    await RentPayment.findOneAndUpdate(
      { _id: paymentId, estateId },
      {
        tenantName,
        unit,
        periodMonth,
        periodYear,
        amount,

        ...(paymentDate ? { paymentDate } : {}),
        ...(receivedAt ? { receivedAt } : {}),
        ...(periodStart ? { periodStart } : {}),
        ...(periodEnd ? { periodEnd } : {}),

        method: methodRaw || undefined,
        reference: referenceRaw || undefined,
        status: statusRaw || undefined,
        memo: memoRaw || undefined,
        notes: notesRaw || undefined,
      },
      { new: false }
    );

    revalidatePath(`/app/estates/${estateId}/rent`);
    revalidatePath(`/app/estates/${estateId}/rent/${paymentId}`);
    if (payment.propertyId) {
      revalidatePath(`/app/estates/${estateId}/properties/${payment.propertyId}/rent`);
    }

    redirect(`/app/estates/${estateId}/rent/${paymentId}?updated=1`);
  }

  const statusOptions = [
    { value: "", label: "No status" },
    { value: "PENDING", label: "Pending" },
    { value: "PAID", label: "Paid" },
    { value: "LATE", label: "Late" },
    { value: "PARTIAL", label: "Partial" },
    { value: "WAIVED", label: "Waived" },
  ];

  const monthOptions = Array.from({ length: 12 }).map((_, index) => ({
    value: index + 1,
    label: new Date(2000, index, 1).toLocaleString("en-US", { month: "short" }),
  }));

  const yearOptions = Array.from({ length: 12 }).map((_, index) => {
    const baseYear = new Date().getFullYear();
    const year = baseYear - 6 + index;
    return { value: year, label: year.toString() };
  });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="space-y-4">
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
          <Link
            href={`/app/estates/${estateId}/rent/${paymentId}`}
            className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
          >
            Payment
          </Link>
          <span className="mx-1 text-slate-600">/</span>
          <span className="text-rose-300">Edit</span>
        </nav>

        {forbiddenFlag ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium">Action blocked</p>
                <p className="text-xs text-rose-200">
                  You don’t have edit permissions for this estate. Request access from the owner to update rent payments.
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

        {errorCode ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium">Something went wrong</p>
                <p className="text-xs text-rose-200">
                  We couldn’t save your changes. Please review the form and try again.
                </p>
              </div>
              <Link
                href={`/app/estates/${estateId}/rent/${paymentId}/edit`}
                className="mt-2 inline-flex items-center justify-center rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-100 hover:bg-rose-500/25 md:mt-0"
              >
                Refresh
              </Link>
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Edit payment
              </span>
              <span className="rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.2em] text-slate-300">
                Role: {roleLabel(role)}
              </span>
              {payment.propertyId ? (
                <span className="rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.2em] text-slate-300">
                  Property-scoped
                </span>
              ) : null}
            </div>

            <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
              Rent payment
            </h1>
            <p className="text-sm text-slate-400">
              Update payment for{" "}
              <span className="font-medium text-slate-100">
                {payment.tenantName || "Tenant"}
              </span>{" "}
              <span className="text-slate-500">•</span>{" "}
              <span className="text-slate-200">
                {payment.periodMonth}/{payment.periodYear}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Link
              href={`/app/estates/${estateId}/rent/${paymentId}`}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-medium text-slate-100 hover:border-rose-700 hover:bg-slate-900/60"
            >
              Back to payment
            </Link>
            <Link
              href={`/app/estates/${estateId}/rent`}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-medium text-slate-100 hover:border-rose-700 hover:bg-slate-900/60"
            >
              Estate rent ledger
            </Link>
          </div>
        </div>
      </header>

      <form
        action={updateRentPayment}
        className="grid gap-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm md:grid-cols-[minmax(0,2fr),minmax(0,1.2fr)]"
      >
        {/* Left column: core payment info */}
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Tenant name
            </label>
            <input
              name="tenantName"
              defaultValue={payment.tenantName}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none placeholder:text-slate-500 focus:border-rose-500"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Unit / Property label (optional)
            </label>
            <input
              name="unit"
              defaultValue={payment.unit ?? ""}
              placeholder="e.g., Unit 3B"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none placeholder:text-slate-500 focus:border-rose-500"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Period month
              </label>
              <select
                name="periodMonth"
                defaultValue={payment.periodMonth}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-50 outline-none focus:border-rose-500"
              >
                {monthOptions.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Period year
              </label>
              <select
                name="periodYear"
                defaultValue={payment.periodYear}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-50 outline-none focus:border-rose-500"
              >
                {yearOptions.map((y) => (
                  <option key={y.value} value={y.value}>
                    {y.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Amount
              </label>
              <input
                name="amount"
                type="number"
                step="0.01"
                min={0}
                defaultValue={payment.amount}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:border-rose-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Payment date
              </label>
              <input
                name="paymentDate"
                type="date"
                defaultValue={payment.paymentDate}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:border-rose-500"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Leave blank to keep the existing date.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Received date (optional)
              </label>
              <input
                name="receivedAt"
                type="date"
                defaultValue={payment.receivedAt ?? ""}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:border-rose-500"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                If blank, we keep the existing value.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Method (optional)
              </label>
              <input
                name="method"
                defaultValue={payment.method ?? ""}
                placeholder="e.g., Cash, Zelle, Check"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none placeholder:text-slate-500 focus:border-rose-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Reference / Check #
              </label>
              <input
                name="reference"
                defaultValue={payment.reference ?? ""}
                placeholder="Optional reference ID"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none placeholder:text-slate-500 focus:border-rose-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Status
            </label>
            <select
              name="status"
              defaultValue={payment.status ?? ""}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-50 outline-none focus:border-rose-500"
            >
              {statusOptions.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Period start (optional)
              </label>
              <input
                name="periodStart"
                type="date"
                defaultValue={payment.periodStart ?? ""}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:border-rose-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Period end (optional)
              </label>
              <input
                name="periodEnd"
                type="date"
                defaultValue={payment.periodEnd ?? ""}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:border-rose-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Memo (internal)
            </label>
            <input
              name="memo"
              defaultValue={payment.memo ?? ""}
              placeholder="Short internal memo"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none placeholder:text-slate-500 focus:border-rose-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Notes
            </label>
            <textarea
              name="notes"
              defaultValue={payment.notes ?? ""}
              rows={4}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none placeholder:text-slate-500 focus:border-rose-500"
              placeholder="Optional detailed notes about this payment, tenant communication, etc."
            />
          </div>
        </div>

        {/* Right column: meta + actions */}
        <div className="flex flex-col justify-between gap-4">
          <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-xs">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Payment metadata
            </h2>

            <dl className="space-y-2">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Payment ID</dt>
                <dd className="truncate text-slate-200">{payment._id}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Created</dt>
                <dd className="text-slate-200">{formatDateTime(new Date(payment.createdAt))}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Last updated</dt>
                <dd className="text-slate-200">{formatDateTime(new Date(payment.updatedAt))}</dd>
              </div>
              {payment.propertyId ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Property</dt>
                  <dd className="truncate text-slate-200">{payment.propertyId}</dd>
                </div>
              ) : null}
            </dl>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-rose-900/60 bg-slate-950/80 p-4 text-xs">
            <p className="text-[11px] text-slate-400">
              Changes update this payment and refresh the estate&apos;s rent ledger so your accounting stays court-ready.
            </p>

            <div className="flex items-center justify-between gap-3">
              <Link
                href={`/app/estates/${estateId}/rent/${paymentId}`}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-slate-500 hover:bg-slate-900"
              >
                Cancel
              </Link>
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-lg border border-rose-700 bg-rose-600 px-4 py-1.5 text-xs font-semibold text-slate-50 shadow-sm shadow-rose-900/40 hover:bg-rose-500"
              >
                Save changes
              </button>
            </div>

            {payment.propertyId ? (
              <Link
                href={`/app/estates/${estateId}/properties/${payment.propertyId}/rent`}
                className="text-[11px] text-slate-400 hover:text-slate-200 underline-offset-2 hover:underline"
              >
                View this property’s rent ledger
              </Link>
            ) : null}
          </div>
        </div>
      </form>
    </div>
  );
}