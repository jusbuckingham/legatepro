import Link from "next/link";
import PageHeader from "@/components/layout/PageHeader";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import mongoose from "mongoose";
import { Estate } from "@/models/Estate";
import { Invoice } from "@/models/Invoice";

type PageProps = {
  params: Promise<{
    estateId: string;
    invoiceId: string;
  }>;
};

type EstateLean = {
  _id: unknown;
  name?: string | null;
};

type InvoiceLeanDoc = {
  _id: unknown;
  estateId: unknown;
  invoiceNumber?: string | null;
  description?: string | null;
  status?: string | null;
  issueDate?: Date | string | null;
  dueDate?: Date | string | null;
  subtotal?: number | null; // cents
  totalAmount?: number | null; // cents
  amount?: number | null; // cents (fallback)
  paidAt?: Date | string | null;
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  UNPAID: "Unpaid",
  PARTIAL: "Partial",
  PAID: "Paid",
  VOID: "Void",
};

function statusHelperText(statusUpper: string): string {
  switch (statusUpper) {
    case "DRAFT":
      return "Not sent yet. You can edit line items and dates before sending.";
    case "SENT":
      return "Sent to the recipient. Mark as Paid when payment is received.";
    case "UNPAID":
      return "Payment is outstanding. Follow up or update status when funds arrive.";
    case "PARTIAL":
      return "Partially paid. Record the remaining balance when received.";
    case "PAID":
      return "Paid in full. This invoice counts toward collected totals.";
    case "VOID":
      return "Voided. This invoice should not be collected or reported as receivable.";
    default:
      return "Status is informational. Update it as the invoice progresses.";
  }
}

function formatCurrencyFromCents(cents: number | null | undefined): string {
  const safe = typeof cents === "number" && Number.isFinite(cents) ? cents : 0;
  const dollars = safe / 100;
  return dollars.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
  });
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function statusPillClasses(statusUpper: string): string {
  switch (statusUpper) {
    case "PAID":
      return "bg-green-50 text-green-700 ring-green-200";
    case "UNPAID":
    case "SENT":
      return "bg-amber-50 text-amber-700 ring-amber-200";
    case "VOID":
      return "bg-red-50 text-red-700 ring-red-200";
    case "PARTIAL":
      return "bg-blue-50 text-blue-700 ring-blue-200";
    case "DRAFT":
    default:
      return "bg-gray-50 text-gray-700 ring-gray-200";
  }
}

export default async function InvoiceDetailPage({ params }: PageProps) {
  const { estateId, invoiceId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  await connectToDatabase();

  const estateObjectId = mongoose.Types.ObjectId.isValid(estateId)
    ? new mongoose.Types.ObjectId(estateId)
    : null;

  const invoiceObjectId = mongoose.Types.ObjectId.isValid(invoiceId)
    ? new mongoose.Types.ObjectId(invoiceId)
    : null;

  const userObjectId = mongoose.Types.ObjectId.isValid(session.user.id)
    ? new mongoose.Types.ObjectId(session.user.id)
    : null;

  const estateIdCandidates = [estateId, estateObjectId].filter(Boolean);

  const estateAccessOr: Record<string, unknown>[] = [
    { ownerId: session.user.id },
    ...(userObjectId ? [{ ownerId: userObjectId }] : []),

    // Common collaborator/member patterns (harmless if fields don't exist)
    { collaboratorIds: session.user.id },
    ...(userObjectId ? [{ collaboratorIds: userObjectId }] : []),
    { collaborators: session.user.id },
    ...(userObjectId ? [{ collaborators: userObjectId }] : []),
    { memberIds: session.user.id },
    ...(userObjectId ? [{ memberIds: userObjectId }] : []),
    { members: session.user.id },
    ...(userObjectId ? [{ members: userObjectId }] : []),
    { userIds: session.user.id },
    ...(userObjectId ? [{ userIds: userObjectId }] : []),
  ];

  const [estateDoc, invoiceDoc] = await Promise.all([
    Estate.findOne({
      _id: estateObjectId ?? estateId,
      $or: estateAccessOr,
    })
      .lean()
      .exec() as Promise<EstateLean | null>,
    Invoice.findOne(
      {
        _id: invoiceObjectId ?? invoiceId,
        estateId: { $in: estateIdCandidates },
      },
      {
        invoiceNumber: 1,
        description: 1,
        status: 1,
        issueDate: 1,
        dueDate: 1,
        paidAt: 1,
        subtotal: 1,
        totalAmount: 1,
        amount: 1,
      },
    )
      .lean()
      .exec() as Promise<InvoiceLeanDoc | null>,
  ]);

  if (!estateDoc) {
    notFound();
  }

  if (!invoiceDoc) {
    notFound();
  }

  const estateName = estateDoc.name ?? "Estate";

  const description =
    typeof invoiceDoc.description === "string" && invoiceDoc.description.trim()
      ? invoiceDoc.description
      : invoiceDoc.invoiceNumber
      ? `Invoice ${invoiceDoc.invoiceNumber}`
      : "Invoice";

  const statusUpper = (invoiceDoc.status ?? "DRAFT").toUpperCase();
  const statusLabel = STATUS_LABELS[statusUpper] ?? invoiceDoc.status ?? "Unknown";

  const issue =
    invoiceDoc.issueDate instanceof Date
      ? invoiceDoc.issueDate.toISOString()
      : (invoiceDoc.issueDate as string | null | undefined) ?? null;

  const due =
    invoiceDoc.dueDate instanceof Date
      ? invoiceDoc.dueDate.toISOString()
      : (invoiceDoc.dueDate as string | null | undefined) ?? null;

  const dueDateObj = due ? new Date(due) : null;
  const now = new Date();
  const isPaidLike = statusUpper === "PAID" || statusUpper === "VOID";
  const isOverdue = Boolean(
    !isPaidLike &&
      dueDateObj &&
      !Number.isNaN(dueDateObj.getTime()) &&
      dueDateObj.getTime() < now.getTime(),
  );
  const daysPastDue = isOverdue
    ? Math.max(
        1,
        Math.floor((now.getTime() - (dueDateObj as Date).getTime()) / (1000 * 60 * 60 * 24)),
      )
    : 0;

  const totalCents =
    typeof invoiceDoc.totalAmount === "number" && Number.isFinite(invoiceDoc.totalAmount)
      ? invoiceDoc.totalAmount
      : typeof invoiceDoc.subtotal === "number" && Number.isFinite(invoiceDoc.subtotal)
      ? invoiceDoc.subtotal
      : typeof invoiceDoc.amount === "number" && Number.isFinite(invoiceDoc.amount)
      ? invoiceDoc.amount
      : 0;

  const subtotalCents =
    typeof invoiceDoc.subtotal === "number" && Number.isFinite(invoiceDoc.subtotal)
      ? invoiceDoc.subtotal
      : totalCents;

  const hasInvoiceNumber =
    typeof invoiceDoc.invoiceNumber === "string" && invoiceDoc.invoiceNumber.trim().length > 0;

  const canEdit = statusUpper !== "VOID";
  const isPaid = statusUpper === "PAID";
  const isVoid = statusUpper === "VOID";

  async function markPaidAction() {
    "use server";

    const session = await auth();
    if (!session?.user?.id) redirect("/login");

    await connectToDatabase();

    await Invoice.updateOne(
      {
        _id: invoiceObjectId ?? invoiceId,
        estateId: { $in: estateIdCandidates },
      },
      {
        $set: {
          status: "PAID",
          paidAt: new Date(),
        },
      },
    );

    revalidatePath(`/app/estates/${estateId}/invoices/${invoiceId}`);
    revalidatePath(`/app/estates/${estateId}/invoices`);
    revalidatePath(`/app/invoices`);
  }

  async function voidInvoiceAction() {
    "use server";

    const session = await auth();
    if (!session?.user?.id) redirect("/login");

    await connectToDatabase();

    await Invoice.updateOne(
      {
        _id: invoiceObjectId ?? invoiceId,
        estateId: { $in: estateIdCandidates },
      },
      {
        $set: {
          status: "VOID",
        },
      },
    );

    revalidatePath(`/app/estates/${estateId}/invoices/${invoiceId}`);
    revalidatePath(`/app/estates/${estateId}/invoices`);
    revalidatePath(`/app/invoices`);
  }

  async function deleteInvoiceAction() {
    "use server";

    const session = await auth();
    if (!session?.user?.id) redirect("/login");

    await connectToDatabase();

    await Invoice.deleteOne({
      _id: invoiceObjectId ?? invoiceId,
      estateId: { $in: estateIdCandidates },
    });

    revalidatePath(`/app/estates/${estateId}/invoices`);
    revalidatePath(`/app/invoices`);

    redirect(`/app/estates/${estateId}/invoices`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <Link
            href={`/app/estates/${estateId}/invoices`}
            className="text-xs text-gray-500 hover:underline"
          >
            ← Back to invoices
          </Link>
        }
        title={description}
        description={`${estateName}${hasInvoiceNumber ? ` • #${invoiceDoc.invoiceNumber}` : ""}`}
        actions={
          <div className="flex flex-col gap-2 sm:items-end">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusPillClasses(
                  statusUpper,
                )}`}
              >
                {statusLabel}
              </span>
              <span className="text-lg font-semibold">
                {formatCurrencyFromCents(totalCents)}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/app/estates/${estateId}/invoices/${invoiceId}/edit`}
                aria-disabled={!canEdit || isPaid}
                className={`rounded-md border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-900 shadow-sm hover:bg-gray-50 ${
                  !canEdit || isPaid ? "pointer-events-none opacity-50" : ""
                }`}
              >
                Edit
              </Link>
              <Link
                href={`/app/estates/${estateId}/invoices/${invoiceId}/print`}
                className="rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-blue-700"
              >
                Print
              </Link>

              <details className="group">
                <summary
                  className={`list-none rounded-md border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-900 shadow-sm hover:bg-gray-50 ${
                    isPaid || isVoid ? "pointer-events-none opacity-50" : "cursor-pointer"
                  }`}
                >
                  Mark as paid
                </summary>
                <div className="mt-2 flex items-center gap-2">
                  <form action={markPaidAction}>
                    <button
                      type="submit"
                      className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-emerald-700"
                    >
                      Confirm paid
                    </button>
                  </form>
                  <span className="text-[11px] text-gray-500">This will set status to PAID and record paid date.</span>
                </div>
              </details>

              <details className="group">
                <summary
                  className={`list-none rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800 shadow-sm hover:bg-red-100 ${
                    isVoid ? "pointer-events-none opacity-50" : "cursor-pointer"
                  }`}
                >
                  Void
                </summary>
                <div className="mt-2 flex items-center gap-2">
                  <form action={voidInvoiceAction}>
                    <button
                      type="submit"
                      className="rounded-md bg-red-600 px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-red-700"
                    >
                      Confirm void
                    </button>
                  </form>
                  <span className="text-[11px] text-gray-500">Voided invoices should not be collected.</span>
                </div>
              </details>

              <details className="group">
                <summary className="cursor-pointer list-none rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-900 shadow-sm hover:bg-gray-100">
                  Delete
                </summary>
                <div className="mt-2 flex items-center gap-2">
                  <form action={deleteInvoiceAction}>
                    <button
                      type="submit"
                      className="rounded-md bg-gray-900 px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-black"
                    >
                      Confirm delete
                    </button>
                  </form>
                  <span className="text-[11px] text-gray-500">This cannot be undone.</span>
                </div>
              </details>
            </div>
          </div>
        }
      />
      {isOverdue ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">Overdue</p>
          <p className="mt-1 text-xs text-amber-900/80">
            This invoice is {daysPastDue} day{daysPastDue === 1 ? "" : "s"} past the due date.
            Consider following up or updating the status once paid.
          </p>
        </div>
      ) : null}

      {/* Details card */}
      <section className="rounded-md border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Invoice details</h2>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-md bg-gray-50 p-4">
            <p className="text-xs font-medium uppercase text-gray-500">Status</p>
            <p className="mt-1 text-sm font-medium text-gray-900">{statusLabel}</p>
            <p className="mt-1 text-xs text-gray-500">{statusHelperText(statusUpper)}</p>
          </div>

          <div className="rounded-md bg-gray-50 p-4">
            <p className="text-xs font-medium uppercase text-gray-500">Issue date</p>
            <p className="mt-1 text-sm font-medium text-gray-900">
              {formatDate(issue)}
            </p>
          </div>

          <div className="rounded-md bg-gray-50 p-4">
            <p className="text-xs font-medium uppercase text-gray-500">Due date</p>
            <p className="mt-1 text-sm font-medium text-gray-900">
              {formatDate(due)}
            </p>
          </div>

          <div className="rounded-md bg-gray-50 p-4">
            <p className="text-xs font-medium uppercase text-gray-500">Subtotal</p>
            <p className="mt-1 text-sm font-medium text-gray-900">
              {formatCurrencyFromCents(subtotalCents)}
            </p>
          </div>

          <div className="rounded-md bg-gray-50 p-4">
            <p className="text-xs font-medium uppercase text-gray-500">Total</p>
            <p className="mt-1 text-sm font-medium text-gray-900">
              {formatCurrencyFromCents(totalCents)}
            </p>
          </div>
        </div>

        <details className="mt-5">
          <summary className="cursor-pointer select-none text-xs font-medium uppercase text-gray-500 hover:text-gray-700">
            Internal IDs
          </summary>
          <p className="mt-2 break-all text-xs text-gray-600">
            Estate: {estateId} • Invoice: {invoiceId}
          </p>
        </details>
      </section>
    </div>
  );
}