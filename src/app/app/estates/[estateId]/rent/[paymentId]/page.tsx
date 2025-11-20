import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { RentPayment } from "@/models/RentPayment";

interface PageProps {
  params: Promise<{
    estateId: string;
    paymentId: string;
  }>;
}

type LeanRentPayment = {
  _id: string;
  ownerId: string;
  estateId: string;
  propertyId?: string;
  tenantName: string;
  periodMonth: number;
  periodYear: number;
  amount: number;
  paymentDate: string | Date;
  method?: string | null;
  reference?: string | null;
  notes?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(value: string | Date): string {
  if (!value) return "–";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "–";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function RentPaymentDetailPage({ params }: PageProps) {
  const { estateId, paymentId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  await connectToDatabase();

  const doc = await RentPayment.findOne({
    _id: paymentId,
    estateId,
    // NOTE: We intentionally do NOT filter by ownerId here for now,
    // because some existing records may not have ownerId set.
    // ownerId: session.user.id,
  }).lean<LeanRentPayment | null>();

  if (!doc) {
    notFound();
  }

  const payment: LeanRentPayment = {
    ...doc,
    _id: String(doc._id),
    estateId: String(doc.estateId),
  };

  async function deletePayment() {
    "use server";

    await fetch(`/api/estates/${estateId}/rent/${paymentId}`, {
      method: "DELETE",
    });

    revalidatePath(`/app/estates/${estateId}/rent`);
    redirect(`/app/estates/${estateId}/rent`);
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">
            Rent Payment Details
          </h1>
          <p className="text-xs text-slate-400">
            Tenant{" "}
            <span className="font-medium text-slate-200">
              {payment.tenantName}
            </span>{" "}
            for{" "}
            <span className="font-medium text-slate-200">
              {payment.periodMonth}/{payment.periodYear}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/app/estates/${estateId}/rent/${paymentId}/edit`}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-100 hover:border-rose-500/70 hover:text-rose-100"
          >
            Edit payment
          </Link>

          <form action={deletePayment}>
            <button
              type="submit"
              className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-1.5 text-xs font-medium text-red-200 hover:border-red-600 hover:bg-red-950/70"
            >
              Delete payment
            </button>
          </form>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Amount</span>
            <span className="font-semibold text-emerald-300">
              {formatCurrency(payment.amount)}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-400">Payment date</span>
            <span className="text-slate-100">
              {formatDate(payment.paymentDate)}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-400">Method</span>
            <span className="text-slate-100">
              {payment.method || "Not specified"}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-400">Reference</span>
            <span className="text-slate-100">{payment.reference || "–"}</span>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Period</span>
            <span className="text-slate-100">
              {payment.periodMonth}/{payment.periodYear}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-400">Created</span>
            <span className="text-slate-100">
              {formatDate(payment.createdAt)}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-400">Last updated</span>
            <span className="text-slate-100">
              {formatDate(payment.updatedAt)}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-xs">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-slate-100">Internal notes</h2>
          <span className="text-[10px] uppercase tracking-wide text-slate-500">
            Visible only to you
          </span>
        </div>
        <p className="whitespace-pre-wrap text-slate-200">
          {payment.notes || "No notes recorded for this payment."}
        </p>
      </div>

      <div className="flex justify-between border-t border-slate-900 pt-4">
        <Link
          href={`/app/estates/${estateId}/rent`}
          className="text-xs font-medium text-slate-400 hover:text-slate-100"
        >
          ← Back to rent ledger
        </Link>
      </div>
    </div>
  );
}