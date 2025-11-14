// src/app/app/estates/[estateId]/rent/[paymentId]/page.tsx

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { connectToDatabase } from "../../../../../../lib/db";
import { RentPayment } from "../../../../../../models/RentPayment";
import { EstateProperty } from "../../../../../../models/EstateProperty";

export const dynamic = "force-dynamic";

interface PageProps {
  params: {
    estateId: string;
    paymentId: string;
  };
}

interface RentPaymentDetail {
  id: string;
  estateId: string;
  propertyId?: string;
  propertyLabel?: string;
  payerName?: string;
  payerType?: string;
  method?: string;
  amount?: number;
  currency?: string;
  datePaid?: string;
  periodStart?: string;
  periodEnd?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

function formatCurrency(amount?: number, currency = "USD"): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function formatDate(value?: string | Date | null): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

async function getRentPaymentDetail(
  estateId: string,
  paymentId: string
): Promise<RentPaymentDetail | null> {
  await connectToDatabase();

  const rawPayment = await RentPayment.findOne({
    _id: paymentId,
    estateId,
  })
    .lean()
    .exec();

  if (!rawPayment) {
    return null;
  }

  const paymentDoc = rawPayment as unknown as {
    _id?: { toString(): string };
    estateId?: { toString(): string } | string;
    propertyId?: { toString(): string };
    payerName?: string;
    payerType?: string;
    method?: string;
    amount?: number;
    currency?: string;
    datePaid?: string | Date;
    periodStart?: string | Date;
    periodEnd?: string | Date;
    notes?: string;
    createdAt?: string | Date;
    updatedAt?: string | Date;
  };

  let propertyLabel: string | undefined;

  if (paymentDoc.propertyId) {
    const property = (await EstateProperty.findById(paymentDoc.propertyId)
      .lean()
      .exec()) as { label?: string } | null;

    if (property?.label) {
      propertyLabel = property.label;
    } else if (property) {
      propertyLabel = "Property";
    }
  }

  const id = paymentDoc._id?.toString?.() ?? "";
  const estateIdString =
    typeof paymentDoc.estateId === "string"
      ? paymentDoc.estateId
      : paymentDoc.estateId?.toString?.() ?? estateId;

  return {
    id,
    estateId: estateIdString,
    propertyId: paymentDoc.propertyId?.toString?.(),
    propertyLabel,
    payerName: paymentDoc.payerName,
    payerType: paymentDoc.payerType,
    method: paymentDoc.method,
    amount: paymentDoc.amount,
    currency: paymentDoc.currency ?? "USD",
    datePaid: paymentDoc.datePaid
      ? new Date(paymentDoc.datePaid).toISOString()
      : undefined,
    periodStart: paymentDoc.periodStart
      ? new Date(paymentDoc.periodStart).toISOString()
      : undefined,
    periodEnd: paymentDoc.periodEnd
      ? new Date(paymentDoc.periodEnd).toISOString()
      : undefined,
    notes: paymentDoc.notes,
    createdAt: paymentDoc.createdAt
      ? new Date(paymentDoc.createdAt).toISOString()
      : undefined,
    updatedAt: paymentDoc.updatedAt
      ? new Date(paymentDoc.updatedAt).toISOString()
      : undefined,
  };
}

export async function updateRentPayment(formData: FormData) {
  "use server";

  const estateId = String(formData.get("estateId") || "");
  const paymentId = String(formData.get("paymentId") || "");

  if (!estateId || !paymentId) {
    return;
  }

  await connectToDatabase();

  const amountRaw = formData.get("amount");
  const amountParsed =
    typeof amountRaw === "string" && amountRaw.trim().length > 0
      ? Number.parseFloat(amountRaw)
      : undefined;

  const update: Record<string, unknown> = {
    payerName: formData.get("payerName") || undefined,
    payerType: formData.get("payerType") || undefined,
    method: formData.get("method") || undefined,
    datePaid: formData.get("datePaid") || undefined,
    periodStart: formData.get("periodStart") || undefined,
    periodEnd: formData.get("periodEnd") || undefined,
    notes: formData.get("notes") || undefined,
  };

  if (amountParsed !== undefined && !Number.isNaN(amountParsed)) {
    update.amount = amountParsed;
  }

  await RentPayment.findByIdAndUpdate(paymentId, update).exec();

  revalidatePath(`/app/estates/${estateId}/rent/${paymentId}`);
  revalidatePath(`/app/estates/${estateId}/rent`);
}

export async function deleteRentPayment(formData: FormData) {
  "use server";

  const estateId = String(formData.get("estateId") || "");
  const paymentId = String(formData.get("paymentId") || "");

  if (!estateId || !paymentId) {
    return;
  }

  await connectToDatabase();

  await RentPayment.findByIdAndDelete(paymentId).exec();

  revalidatePath(`/app/estates/${estateId}/rent`);
  redirect(`/app/estates/${estateId}/rent`);
}

export default async function RentPaymentDetailPage({ params }: PageProps) {
  const { estateId, paymentId } = params;

  const payment = await getRentPaymentDetail(estateId, paymentId);

  if (!payment) {
    notFound();
  }

  const {
    payerName,
    payerType,
    propertyId,
    propertyLabel,
    method,
    amount,
    currency,
    datePaid,
    periodStart,
    periodEnd,
    notes,
  } = payment;

  const paidLabel = formatDate(datePaid);
  const periodLabel =
    periodStart || periodEnd
      ? `${formatDate(periodStart)} → ${formatDate(periodEnd)}`
      : "Not set";

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-950/70 px-3 py-1 text-xs text-slate-300">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-400" />
            Rent payment
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
              {formatCurrency(amount, currency)}{" "}
              <span className="text-sm font-normal text-slate-400">
                {payerName ? `from ${payerName}` : ""}
              </span>
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              {paidLabel !== "—" ? `Paid ${paidLabel}` : "Payment date not set"}
              {method ? ` • ${method}` : ""}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            {payerType && (
              <span className="inline-flex items-center rounded-full bg-slate-900/80 px-2 py-0.5 text-xs font-medium text-slate-200">
                {payerType}
              </span>
            )}
            {propertyId && (
              <span className="inline-flex items-center rounded-full bg-slate-900/80 px-2 py-0.5 text-xs font-medium text-slate-200">
                Linked to property
              </span>
            )}
          </div>
          <div className="flex gap-2 text-xs">
            <Link
              href={`/app/estates/${estateId}/rent`}
              className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 font-medium text-slate-200 hover:border-rose-500/70 hover:text-rose-100"
            >
              ← Back to rent ledger
            </Link>
            {propertyId && (
              <Link
                href={`/app/estates/${estateId}/properties/${propertyId}/rent`}
                className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 font-medium text-slate-200 hover:border-rose-500/70 hover:text-rose-100"
              >
                View property rent
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Core details */}
      <div className="grid gap-6 md:grid-cols-3">
        <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4 md:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Payment details
          </h2>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-slate-400">
                Payer name
              </dt>
              <dd className="mt-1 text-sm text-slate-100">
                {payerName || (
                  <span className="text-slate-500">Not provided</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-400">
                Payer type
              </dt>
              <dd className="mt-1 text-sm text-slate-100">
                {payerType || (
                  <span className="text-slate-500">Not provided</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-400">
                Amount received
              </dt>
              <dd className="mt-1 text-sm text-slate-100">
                {formatCurrency(amount, currency)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-400">
                Date paid
              </dt>
              <dd className="mt-1 text-sm text-slate-100">{paidLabel}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-400">
                Rent period
              </dt>
              <dd className="mt-1 text-sm text-slate-100">{periodLabel}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-400">
                Payment method
              </dt>
              <dd className="mt-1 text-sm text-slate-100">
                {method || (
                  <span className="text-slate-500">Not provided</span>
                )}
              </dd>
            </div>
          </dl>
        </section>

        <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Linked property
          </h2>
          {propertyId ? (
            <div className="space-y-2 text-sm text-slate-200">
              <p className="font-medium">
                {propertyLabel ?? "Linked property"}
              </p>
              <p className="text-xs text-slate-400">
                This helps you show the court and your accountant which house
                generated this rent.
              </p>
              <Link
                href={`/app/estates/${estateId}/properties/${propertyId}`}
                className="inline-flex items-center text-xs font-medium text-rose-300 hover:text-rose-200"
              >
                View property details →
              </Link>
            </div>
          ) : (
            <p className="text-sm text-slate-400">
              This payment is not linked to a specific property yet. You can
              update it later if needed.
            </p>
          )}
        </section>
      </div>

      {/* Notes */}
      <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Internal notes
          </h2>
          <span className="text-xs text-slate-500">
            These stay inside LegatePro — they&apos;re not shared with tenants.
          </span>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 text-sm text-slate-100">
          {notes ? (
            <p className="whitespace-pre-wrap">{notes}</p>
          ) : (
            <p className="text-slate-500">
              No notes yet. You might track partial payments, promises to pay,
              or instructions from your attorney here.
            </p>
          )}
        </div>
      </section>

      {/* Quick edit */}
      <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Update this payment
          </h2>
          <span className="text-xs text-slate-500">
            Small changes here refresh this page and the rent ledger.
          </span>
        </div>

        <form action={updateRentPayment} className="space-y-4">
          <input type="hidden" name="estateId" value={estateId} />
          <input type="hidden" name="paymentId" value={payment.id} />

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1 md:col-span-1">
              <label className="text-xs font-medium text-slate-400">
                Amount received
              </label>
              <input
                name="amount"
                defaultValue={amount ?? ""}
                inputMode="decimal"
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-rose-500/70"
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1 md:col-span-1">
              <label className="text-xs font-medium text-slate-400">
                Date paid
              </label>
              <input
                type="date"
                name="datePaid"
                defaultValue={
                  datePaid ? new Date(datePaid).toISOString().slice(0, 10) : ""
                }
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-rose-500/70"
              />
            </div>
            <div className="space-y-1 md:col-span-1">
              <label className="text-xs font-medium text-slate-400">
                Payment method
              </label>
              <input
                name="method"
                defaultValue={method ?? ""}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-rose-500/70"
                placeholder="check, Zelle, cash…"
              />
            </div>

            <div className="space-y-1 md:col-span-1">
              <label className="text-xs font-medium text-slate-400">
                Period start
              </label>
              <input
                type="date"
                name="periodStart"
                defaultValue={
                  periodStart
                    ? new Date(periodStart).toISOString().slice(0, 10)
                    : ""
                }
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-rose-500/70"
              />
            </div>
            <div className="space-y-1 md:col-span-1">
              <label className="text-xs font-medium text-slate-400">
                Period end
              </label>
              <input
                type="date"
                name="periodEnd"
                defaultValue={
                  periodEnd
                    ? new Date(periodEnd).toISOString().slice(0, 10)
                    : ""
                }
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-rose-500/70"
              />
            </div>
            <div className="space-y-1 md:col-span-1">
              <label className="text-xs font-medium text-slate-400">
                Payer name
              </label>
              <input
                name="payerName"
                defaultValue={payerName ?? ""}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-rose-500/70"
                placeholder="Tenant or payer"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400">
              Internal notes
            </label>
            <textarea
              name="notes"
              defaultValue={notes ?? ""}
              className="min-h-[80px] w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-rose-500/70"
              placeholder="Partial payments, promises to pay, calls with tenants…"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center rounded-md bg-rose-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-rose-400"
            >
              Save changes
            </button>
          </div>
        </form>

        <form
          action={deleteRentPayment}
          className="mt-2 flex justify-end"
        >
          <input type="hidden" name="estateId" value={estateId} />
          <input type="hidden" name="paymentId" value={payment.id} />
          <button
            type="submit"
            className="inline-flex items-center rounded-md border border-rose-500/80 px-3 py-1.5 text-xs font-medium text-rose-100 hover:bg-rose-500/10"
          >
            Delete payment
          </button>
        </form>
      </section>
    </div>
  );
}