import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { RentPayment } from "@/models/RentPayment";
import { Estate } from "@/models/Estate";

interface PageProps {
  params: Promise<{
    estateId: string;
  }>;
}

export default async function NewRentPaymentPage({ params }: PageProps) {
  const { estateId } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  await connectToDatabase();

  const estate = await Estate.findOne({
    _id: estateId,
    ownerId: session.user.id,
  }).lean();

  if (!estate) {
    notFound();
  }

  async function createPayment(formData: FormData) {
    "use server";

    const sessionInner = await auth();
    if (!sessionInner?.user?.id) {
      redirect("/login");
    }

    await connectToDatabase();

    // Grab estateId from the form explicitly
    const estateIdFromForm = (formData.get("estateId") || "").toString();

    const tenantName = (formData.get("tenantName") || "").toString().trim();
    const amountRaw = formData.get("amount");
    const paymentDateRaw = formData.get("paymentDate");
    const periodMonthRaw = formData.get("periodMonth");
    const periodYearRaw = formData.get("periodYear");
    const method = (formData.get("method") || "").toString().trim() || undefined;
    const reference =
      (formData.get("reference") || "").toString().trim() || undefined;
    const notes = (formData.get("notes") || "").toString().trim() || undefined;

    const amount = amountRaw ? Number(amountRaw) : 0;
    const periodMonth = periodMonthRaw ? Number(periodMonthRaw) : 0;
    const periodYear = periodYearRaw ? Number(periodYearRaw) : 0;

    const paymentDate =
      typeof paymentDateRaw === "string" && paymentDateRaw
        ? new Date(paymentDateRaw)
        : new Date();

    await RentPayment.create({
      ownerId: sessionInner.user.id,
      estateId: estateIdFromForm,
      tenantName,
      amount,
      paymentDate,
      periodMonth,
      periodYear,
      method,
      reference,
      notes,
    });

    revalidatePath(`/app/estates/${estateIdFromForm}/rent`);
    redirect(`/app/estates/${estateIdFromForm}/rent`);
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">
            Record rent payment
          </h1>
          <p className="text-xs text-slate-400">
            Log a new rent payment for this estate.
          </p>
        </div>

        <Link
          href={`/app/estates/${estateId}/rent`}
          className="text-xs font-medium text-slate-400 hover:text-slate-100"
        >
          Cancel
        </Link>
      </div>

      <form
        action={createPayment}
        className="max-w-xl space-y-4 rounded-2xl border border-slate-800 bg-slate-950/80 p-4 text-xs shadow-sm shadow-black/40"
      >
        {/* Hidden estateId so the server action has a stable value */}
        <input type="hidden" name="estateId" value={estateId} />

        {/* Tenant + amount */}
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Tenant name
            </label>
            <input
              name="tenantName"
              required
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-rose-500 focus:outline-none"
              placeholder="e.g. John Doe"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Amount
            </label>
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0"
              required
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-rose-500 focus:outline-none"
              placeholder="e.g. 1200"
            />
          </div>
        </div>

        {/* Dates / period */}
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Payment date
            </label>
            <input
              name="paymentDate"
              type="date"
              required
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-rose-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Period month
            </label>
            <input
              name="periodMonth"
              type="number"
              min="1"
              max="12"
              required
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-rose-500 focus:outline-none"
              placeholder="e.g. 6"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Period year
            </label>
            <input
              name="periodYear"
              type="number"
              min="1900"
              max="2100"
              required
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-rose-500 focus:outline-none"
              placeholder="e.g. 2025"
            />
          </div>
        </div>

        {/* Method / reference */}
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Payment method
            </label>
            <input
              name="method"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-rose-500 focus:outline-none"
              placeholder="e.g. Cash, Check, Zelle"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Reference / check #
            </label>
            <input
              name="reference"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-rose-500 focus:outline-none"
              placeholder="Optional"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Internal notes
          </label>
          <textarea
            name="notes"
            rows={3}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-rose-500 focus:outline-none"
            placeholder="Notes about this payment (late, partial, etc.)"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Link
            href={`/app/estates/${estateId}/rent`}
            className="text-xs font-medium text-slate-400 hover:text-slate-100"
          >
            Cancel
          </Link>

          <button
            type="submit"
            className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
          >
            Save payment
          </button>
        </div>
      </form>
    </div>
  );
}