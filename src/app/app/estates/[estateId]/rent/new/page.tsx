import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { RentPayment } from "@/models/RentPayment";
import { Estate } from "@/models/Estate";
import { requireEstateAccess, requireEstateEditAccess } from "@/lib/estateAccess";

interface PageProps {
  params: Promise<{
    estateId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) {
    return param[0] || "";
  }
  return param || "";
}

export default async function NewRentPaymentPage({ params, searchParams }: PageProps) {
  const { estateId } = await params;
  const sp = searchParams ? await searchParams : undefined;
  const propertyIdFromQuery = firstParam(sp?.propertyId).trim();
  const error = firstParam(sp?.error).trim();

  const session = await auth();

  if (!session?.user?.id) {
    const callbackUrl = encodeURIComponent(
      `/app/estates/${estateId}/rent/new${propertyIdFromQuery ? `?propertyId=${encodeURIComponent(propertyIdFromQuery)}` : ""}`
    );
    redirect(`/login?callbackUrl=${callbackUrl}`);
  }

  await connectToDatabase();

  const access = await requireEstateAccess({ estateId, userId: session.user.id });
  const canEdit = access.role !== "VIEWER";

  const estate = await Estate.findOne({ _id: estateId }).lean();

  if (!estate) {
    notFound();
  }

  const now = new Date();
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const defaultDate = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(
    now.getDate()
  )}`;

  const currentYear = now.getFullYear();

  async function createPayment(formData: FormData) {
    "use server";

    const sessionInner = await auth();
    if (!sessionInner?.user?.id) {
      const callbackUrl = encodeURIComponent(
        `/app/estates/${estateId}/rent/new${propertyIdFromQuery ? `?propertyId=${encodeURIComponent(propertyIdFromQuery)}` : ""}`
      );
      redirect(`/login?callbackUrl=${callbackUrl}`);
    }

    await connectToDatabase();

    await requireEstateEditAccess({ estateId, userId: sessionInner.user.id });

    const tenantName = (formData.get("tenantName") || "").toString().trim();
    const amountRaw = formData.get("amount");
    const paymentDateRaw = formData.get("paymentDate");
    const periodMonthRaw = formData.get("periodMonth");
    const periodYearRaw = formData.get("periodYear");
    const method = (formData.get("method") || "").toString().trim() || undefined;
    const reference =
      (formData.get("reference") || "").toString().trim() || undefined;
    const notes = (formData.get("notes") || "").toString().trim() || undefined;
    const propertyId = (formData.get("propertyId") || "").toString().trim() || undefined;

    const amount = amountRaw ? Number(amountRaw) : 0;
    const periodMonth = periodMonthRaw ? Number(periodMonthRaw) : 0;
    const periodYear = periodYearRaw ? Number(periodYearRaw) : 0;

    const baseRedirectUrl = `/app/estates/${estateId}/rent/new${propertyId ? `?propertyId=${encodeURIComponent(propertyId)}` : ""}`;

    if (!tenantName) {
      redirect(`${baseRedirectUrl}${propertyId ? "&" : "?"}error=missing_tenant`);
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      redirect(`${baseRedirectUrl}${propertyId ? "&" : "?"}error=invalid_amount`);
    }

    if (!Number.isInteger(periodMonth) || periodMonth < 1 || periodMonth > 12) {
      redirect(`${baseRedirectUrl}${propertyId ? "&" : "?"}error=invalid_period`);
    }

    if (!Number.isInteger(periodYear) || periodYear < 1900 || periodYear > 2100) {
      redirect(`${baseRedirectUrl}${propertyId ? "&" : "?"}error=invalid_year`);
    }

    const paymentDate =
      typeof paymentDateRaw === "string" && paymentDateRaw
        ? new Date(paymentDateRaw)
        : new Date();

    try {
      await RentPayment.create({
        ownerId: sessionInner.user.id,
        estateId,
        tenantName,
        amount,
        paymentDate,
        periodMonth,
        periodYear,
        method,
        reference,
        notes,
        ...(propertyId ? { propertyId } : {}),
      });
    } catch {
      redirect(`${baseRedirectUrl}${propertyId ? "&" : "?"}error=create_failed`);
    }

    if (propertyId) {
      redirect(`/app/estates/${estateId}/properties/${propertyId}/rent?created=1`);
    } else {
      redirect(`/app/estates/${estateId}/rent?created=1`);
    }
  }

  const errorMessages: Record<string, string> = {
    missing_tenant: "Tenant name is required.",
    invalid_amount: "Please enter a valid amount greater than zero.",
    invalid_period: "Please enter a valid period month (1-12).",
    invalid_year: "Please enter a valid period year (1900-2100).",
    create_failed: "Failed to create the rent payment. Please try again.",
  };

  return (
    <div className="space-y-6 p-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-slate-400">
        <Link href="/app/estates" className="hover:underline">
          Estates
        </Link>
        <span>/</span>
        <Link href={`/app/estates/${estateId}`} className="hover:underline truncate max-w-[8rem]">
          {estate?.name || "Estate"}
        </Link>
        <span>/</span>
        <Link href={`/app/estates/${estateId}/rent`} className="hover:underline">
          Rent
        </Link>
        <span>/</span>
        <span className="font-semibold text-slate-100">New</span>
      </nav>

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">
            Record rent payment
          </h1>
          <p className="text-xs text-slate-400">
            Log a new rent payment for this estate.
          </p>
          {propertyIdFromQuery ? (
            <div className="inline-block rounded-full bg-amber-600/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400 mt-1">
              Property-scoped
            </div>
          ) : null}
        </div>

        <Link
          href={`/app/estates/${estateId}/rent`}
          className="text-xs font-medium text-slate-400 hover:text-slate-100"
        >
          Cancel
        </Link>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-500 bg-rose-900/20 p-3 text-sm text-rose-400">
          <p>{errorMessages[error] || "An unknown error occurred."}</p>
          <button
            type="button"
            onClick={() => {
              "use client";
              window.location.reload();
            }}
            className="mt-1 underline"
          >
            Refresh
          </button>
        </div>
      ) : null}

      {!canEdit ? (
        <>
          <div className="rounded-lg border border-amber-600 bg-amber-900/20 p-4 text-sm text-amber-400">
            <p>
              You have read-only access to this estate’s rent payments. To add or edit payments, please request edit access.
            </p>
            <Link
              href={`/app/estates/${estateId}?requestAccess=1`}
              className="mt-2 inline-block rounded-md border border-amber-500 bg-amber-700/40 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-100 hover:bg-amber-600"
            >
              Request edit access
            </Link>
          </div>
          <div className="mt-6 max-w-xl rounded-2xl border border-slate-800 bg-slate-950/80 p-6 text-xs text-slate-400 shadow-sm shadow-black/40">
            <p className="mb-4">You cannot add new rent payments with your current access level.</p>
            <Link
              href={`/app/estates/${estateId}/rent`}
              className="text-xs font-medium text-slate-400 hover:text-slate-100 underline"
            >
              Back to rent ledger
            </Link>
          </div>
        </>
      ) : (
        <form
          action={createPayment}
          className="max-w-xl space-y-6 rounded-2xl border border-slate-800 bg-slate-950/80 p-6 text-xs shadow-sm shadow-black/40"
        >
          {propertyIdFromQuery ? (
            <input type="hidden" name="propertyId" value={propertyIdFromQuery} />
          ) : null}

          {/* Tenant + amount */}
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Tenant name
              </label>
              <input
                name="tenantName"
                required
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-rose-500 focus:outline-none"
                placeholder="e.g. John Doe"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Amount
              </label>
              <input
                name="amount"
                type="number"
                step="0.01"
                min="0"
                required
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-rose-500 focus:outline-none"
                placeholder="e.g. 1200"
              />
            </div>
          </div>

          {/* Dates / period */}
          <div className="grid gap-6 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Payment date
              </label>
              <input
                name="paymentDate"
                type="date"
                required
                defaultValue={defaultDate}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-rose-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Period month
              </label>
              <select
                name="periodMonth"
                required
                defaultValue={(now.getMonth() + 1).toString()}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-rose-500 focus:outline-none"
              >
                <option value="1">Jan</option>
                <option value="2">Feb</option>
                <option value="3">Mar</option>
                <option value="4">Apr</option>
                <option value="5">May</option>
                <option value="6">Jun</option>
                <option value="7">Jul</option>
                <option value="8">Aug</option>
                <option value="9">Sep</option>
                <option value="10">Oct</option>
                <option value="11">Nov</option>
                <option value="12">Dec</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Period year
              </label>
              <select
                name="periodYear"
                required
                defaultValue={currentYear.toString()}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-rose-500 focus:outline-none"
              >
                {Array.from({ length: 5 }).map((_, i) => {
                  const year = currentYear - 3 + i;
                  return (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {/* Method / reference */}
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Payment method
              </label>
              <input
                name="method"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-rose-500 focus:outline-none"
                placeholder="e.g. Cash, Check, Zelle"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Reference / check #
              </label>
              <input
                name="reference"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-rose-500 focus:outline-none"
                placeholder="Optional"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Internal notes
            </label>
            <textarea
              name="notes"
              rows={3}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-rose-500 focus:outline-none"
              placeholder="Notes about this payment (late, partial, etc.)"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3">
            <Link
              href={`/app/estates/${estateId}/rent`}
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-100 hover:border-slate-600"
            >
              Cancel
            </Link>

            <button
              type="submit"
              className="rounded-2xl bg-rose-500 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-950 hover:bg-rose-400"
            >
              Save payment
            </button>
          </div>
        </form>
      )}
    </div>
  );
}