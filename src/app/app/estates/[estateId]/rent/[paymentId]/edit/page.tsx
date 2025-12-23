import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { RentPayment } from "@/models/RentPayment";

interface PageProps {
  params: {
    estateId: string;
    paymentId: string;
  };
}

interface RentPaymentLeanFromDb {
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
}

interface LeanRentPayment {
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
}

function toDateInputValue(date?: Date): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

function toIsoString(date: Date): string {
  return date.toISOString();
}

export default async function EditRentPaymentPage(props: PageProps) {
  const { estateId, paymentId } = props.params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  await connectToDatabase();

  const doc = await RentPayment.findOne({
    _id: paymentId,
    estateId,
    $or: [{ ownerId: session.user.id }, { ownerId: { $exists: false } }],
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
    createdAt: toIsoString(doc.createdAt),
    updatedAt: toIsoString(doc.updatedAt),
  };

  async function updateRentPayment(formData: FormData) {
    "use server";

    const innerSession = await auth();
    if (!innerSession?.user?.id) {
      redirect("/login");
    }

    await connectToDatabase();

    const tenantName = (formData.get("tenantName") ?? "").toString().trim();
    const unitRaw = (formData.get("unit") ?? "").toString().trim();
    const unit = unitRaw || undefined;

    const periodMonth = Number(formData.get("periodMonth") ?? payment.periodMonth);
    const periodYear = Number(formData.get("periodYear") ?? payment.periodYear);

    const amount = Number(formData.get("amount") ?? payment.amount);

    const paymentDateStr = (formData.get("paymentDate") ?? "").toString();
    const paymentDate = paymentDateStr ? new Date(paymentDateStr) : undefined;

    const methodRaw = (formData.get("method") ?? "").toString().trim();
    const referenceRaw = (formData.get("reference") ?? "").toString().trim();
    const statusRaw = (formData.get("status") ?? "").toString().trim();
    const memoRaw = (formData.get("memo") ?? "").toString().trim();
    const notesRaw = (formData.get("notes") ?? "").toString().trim();

    const receivedAtStr = (formData.get("receivedAt") ?? "").toString();
    const periodStartStr = (formData.get("periodStart") ?? "").toString();
    const periodEndStr = (formData.get("periodEnd") ?? "").toString();

    const receivedAt = receivedAtStr ? new Date(receivedAtStr) : undefined;
    const periodStart = periodStartStr ? new Date(periodStartStr) : undefined;
    const periodEnd = periodEndStr ? new Date(periodEndStr) : undefined;

    await RentPayment.findOneAndUpdate(
      {
        _id: paymentId,
        estateId,
        $or: [{ ownerId: innerSession.user.id }, { ownerId: { $exists: false } }],
      },
      {
        tenantName,
        unit,
        periodMonth,
        periodYear,
        amount,
        // only set dates if provided; otherwise leave existing values
        ...(paymentDate ? { paymentDate } : {}),
        method: methodRaw || undefined,
        reference: referenceRaw || undefined,
        status: statusRaw || undefined,
        receivedAt,
        periodStart,
        periodEnd,
        memo: memoRaw || undefined,
        notes: notesRaw || undefined,
      },
      { new: false }
    );

    revalidatePath(`/app/estates/${estateId}/rent`);
    revalidatePath(`/app/estates/${estateId}/rent/${paymentId}`);
    redirect(`/app/estates/${estateId}/rent/${paymentId}`);
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

  const yearOptions = Array.from({ length: 10 }).map((_, index) => {
    const baseYear = new Date().getFullYear();
    const year = baseYear - 5 + index;
    return { value: year, label: year.toString() };
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-50">
            Edit Rent Payment
          </h1>
          <p className="text-sm text-slate-400">
            Update rent payment for{" "}
            <span className="font-medium text-slate-100">
              {payment.tenantName || "Tenant"}
            </span>{" "}
            — {payment.periodMonth}/{payment.periodYear}
          </p>
        </div>
        <Link
          href={`/app/estates/${estateId}/rent/${paymentId}`}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-100 hover:border-rose-700 hover:bg-slate-900/60"
        >
          Back to payment detail
        </Link>
      </div>

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
                <dd className="text-slate-200">
                  {new Date(payment.createdAt).toLocaleString()}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Last updated</dt>
                <dd className="text-slate-200">
                  {new Date(payment.updatedAt).toLocaleString()}
                </dd>
              </div>
            </dl>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-rose-900/60 bg-slate-950/80 p-4 text-xs">
            <p className="text-[11px] text-slate-400">
              Changes will update this payment and refresh the estate&apos;s rent
              ledger. You can always see the full history via your database if
              needed.
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
          </div>
        </div>
      </form>
    </div>
  );
}