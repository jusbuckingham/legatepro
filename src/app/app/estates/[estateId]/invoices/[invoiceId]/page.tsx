import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import PageHeader from "@/components/layout/PageHeader";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";

import { requireEstateAccess } from "@/lib/estateAccess";
import { Invoice } from "@/models/Invoice";

type PageProps = {
  params: Promise<{
    estateId: string;
    invoiceId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
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
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
    case "UNPAID":
    case "SENT":
      return "border-amber-500/30 bg-amber-500/10 text-amber-100";
    case "VOID":
      return "border-rose-500/30 bg-rose-500/10 text-rose-100";
    case "PARTIAL":
      return "border-sky-500/30 bg-sky-500/10 text-sky-100";
    case "DRAFT":
    default:
      return "border-slate-700 bg-slate-950/70 text-slate-200";
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

export default async function InvoiceDetailPage({ params, searchParams }: PageProps) {
  const { estateId, invoiceId } = await params;

  const sp = searchParams ? await searchParams : undefined;
  const forbiddenFlag = getStringParam(sp, "forbidden");
  const forbidden = forbiddenFlag === "1" || forbiddenFlag.toLowerCase() === "true";

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/app/estates/${estateId}/invoices/${invoiceId}`)}`);
  }

  // Resolve access (OWNER / EDITOR / VIEWER). If this fails, treat as unauthorized.
  let role: "OWNER" | "EDITOR" | "VIEWER" = "VIEWER";
  try {
    const access = await requireEstateAccess({ estateId, userId: session.user.id });
    const r = (access as { role?: unknown } | null)?.role;
    role = r === "OWNER" || r === "EDITOR" || r === "VIEWER" ? r : "VIEWER";
  } catch {
    return (
      <div className="space-y-8 p-6">
        <PageHeader
          eyebrow={
            <nav className="text-xs text-slate-500">
              <Link href="/app/estates" className="text-slate-400 hover:text-slate-200 hover:underline">
                Estates
              </Link>
              <span className="mx-1 text-slate-600">/</span>
              <span className="truncate text-rose-200">Unauthorized</span>
            </nav>
          }
          title="Unauthorized"
          description="You don’t have access to this estate (or your session expired)."
          actions={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link
                href="/app/estates"
                className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/60"
              >
                Back to estates
              </Link>
            </div>
          }
        />

        <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-50">We can’t show this invoice.</p>
          <p className="mt-1 text-sm text-slate-300">
            If you think you should have access, ask an estate OWNER to add you as a collaborator.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Link
              href="/app/estates"
              className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/60"
            >
              Return to estates
            </Link>
            <Link
              href={`/login?callbackUrl=${encodeURIComponent(`/app/estates/${estateId}/invoices/${invoiceId}`)}`}
              className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/60"
            >
              Re-authenticate
            </Link>
          </div>
        </section>
      </div>
    );
  }

  await connectToDatabase();

  const invoiceDoc = (await Invoice.findOne(
    {
      _id: invoiceId,
      estateId,
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
    .exec()) as InvoiceLeanDoc | null;

  if (!invoiceDoc) {
    notFound();
  }

  const estateName = "Estate";

  const requestAccessHref = `/app/estates/${estateId}/collaborators?${new URLSearchParams({
    request: "EDITOR",
    from: "invoice",
    invoiceId,
  }).toString()}`;

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

  const canEditRole = role === "OWNER" || role === "EDITOR";
  const isPaid = statusUpper === "PAID";
  const isVoid = statusUpper === "VOID";
  const canEdit = canEditRole && !isVoid;

  const invoiceIdText = invoiceDoc._id?.toString?.() ?? String(invoiceDoc._id);

  async function markPaidAction() {
    "use server";

    const session = await auth();
    if (!session?.user?.id) redirect("/login");

    await connectToDatabase();
    const access = await requireEstateAccess({ estateId, userId: session.user.id });
    const r = (access as { role?: unknown } | null)?.role;
    const role = r === "OWNER" || r === "EDITOR" || r === "VIEWER" ? r : "VIEWER";
    if (role !== "OWNER" && role !== "EDITOR") {
      redirect(`/app/estates/${estateId}/invoices/${invoiceId}?forbidden=1`);
    }

    await Invoice.updateOne(
      {
        _id: invoiceId,
        estateId,
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
    const access = await requireEstateAccess({ estateId, userId: session.user.id });
    const r = (access as { role?: unknown } | null)?.role;
    const role = r === "OWNER" || r === "EDITOR" || r === "VIEWER" ? r : "VIEWER";
    if (role !== "OWNER" && role !== "EDITOR") {
      redirect(`/app/estates/${estateId}/invoices/${invoiceId}?forbidden=1`);
    }

    await Invoice.updateOne(
      {
        _id: invoiceId,
        estateId,
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
    const access = await requireEstateAccess({ estateId, userId: session.user.id });
    const r = (access as { role?: unknown } | null)?.role;
    const role = r === "OWNER" || r === "EDITOR" || r === "VIEWER" ? r : "VIEWER";
    if (role !== "OWNER" && role !== "EDITOR") {
      redirect(`/app/estates/${estateId}/invoices/${invoiceId}?forbidden=1`);
    }

    await Invoice.deleteOne({
      _id: invoiceId,
      estateId,
    });

    revalidatePath(`/app/estates/${estateId}/invoices`);
    revalidatePath(`/app/invoices`);

    redirect(`/app/estates/${estateId}/invoices`);
  }

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
            <Link href={`/app/estates/${estateId}/invoices`} className="text-slate-400 hover:text-slate-200 hover:underline">
              Invoices
            </Link>
            <span className="mx-1 text-slate-600">/</span>
            <span className="truncate text-rose-200">{hasInvoiceNumber ? `#${invoiceDoc.invoiceNumber}` : "Invoice"}</span>
          </nav>
        }
        title={description}
        description={`${estateName}${hasInvoiceNumber ? ` • #${invoiceDoc.invoiceNumber}` : ""}`}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-200">
              {role}
            </span>
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${statusPillClasses(
                statusUpper,
              )}`}
            >
              {statusLabel}
            </span>

            <span className="inline-flex items-center rounded-full border border-slate-800 bg-slate-950/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-200">
              {formatCurrencyFromCents(totalCents)}
            </span>

            {!canEditRole && (
              <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-950/50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-100">
                View-only
              </span>
            )}

            <Link
              href={`/app/estates/${estateId}/invoices`}
              className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/60"
            >
              Back
            </Link>

            <Link
              href={`/app/estates/${estateId}/invoices/${invoiceId}/edit`}
              aria-disabled={!canEdit}
              className={`inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/60 ${
                !canEdit ? "pointer-events-none opacity-50" : ""
              }`}
            >
              Edit
            </Link>

            <Link
              href={`/app/estates/${estateId}/invoices/${invoiceId}/print`}
              className="inline-flex items-center justify-center rounded-md border border-emerald-500/60 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-100 hover:bg-emerald-500/20"
            >
              Print
            </Link>

            {!canEditRole ? (
              <Link
                href={requestAccessHref}
                className="inline-flex items-center justify-center rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-100 hover:bg-amber-500/20"
              >
                Request access
              </Link>
            ) : null}

            {canEditRole ? (
              <>
                <details className="group relative">
                  <summary
                    className={`list-none rounded-md border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/60 ${
                      isPaid || isVoid ? "pointer-events-none opacity-50" : "cursor-pointer"
                    }`}
                  >
                    Mark as paid
                  </summary>
                  <div className="absolute right-0 z-10 mt-2 w-72 rounded-xl border border-slate-800 bg-slate-950 p-3 shadow-lg shadow-black/40">
                    <p className="text-xs font-semibold text-slate-100">Confirm status update</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      This will set status to <span className="font-semibold text-slate-200">PAID</span> and record the paid date.
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <form action={markPaidAction}>
                        <button
                          type="submit"
                          className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-950 hover:bg-emerald-400"
                        >
                          Confirm
                        </button>
                      </form>
                      <span className="text-[11px] text-slate-500">You can change it later.</span>
                    </div>
                  </div>
                </details>

                <details className="group relative">
                  <summary
                    className={`list-none rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-rose-100 hover:bg-rose-500/20 ${
                      isVoid ? "pointer-events-none opacity-50" : "cursor-pointer"
                    }`}
                  >
                    Void
                  </summary>
                  <div className="absolute right-0 z-10 mt-2 w-72 rounded-xl border border-slate-800 bg-slate-950 p-3 shadow-lg shadow-black/40">
                    <p className="text-xs font-semibold text-slate-100">Void this invoice?</p>
                    <p className="mt-1 text-[11px] text-slate-400">Voided invoices should not be collected.</p>
                    <div className="mt-3 flex items-center gap-2">
                      <form action={voidInvoiceAction}>
                        <button
                          type="submit"
                          className="inline-flex items-center justify-center rounded-md bg-rose-500 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-950 hover:bg-rose-400"
                        >
                          Confirm
                        </button>
                      </form>
                      <span className="text-[11px] text-slate-500">This is reversible by editing.</span>
                    </div>
                  </div>
                </details>

                <details className="group relative">
                  <summary className="cursor-pointer list-none rounded-md border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/60">
                    Delete
                  </summary>
                  <div className="absolute right-0 z-10 mt-2 w-72 rounded-xl border border-slate-800 bg-slate-950 p-3 shadow-lg shadow-black/40">
                    <p className="text-xs font-semibold text-slate-100">Delete this invoice?</p>
                    <p className="mt-1 text-[11px] text-slate-400">This cannot be undone.</p>
                    <div className="mt-3 flex items-center gap-2">
                      <form action={deleteInvoiceAction}>
                        <button
                          type="submit"
                          className="inline-flex items-center justify-center rounded-md bg-slate-200 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-950 hover:bg-white"
                        >
                          Confirm
                        </button>
                      </form>
                      <span className="text-[11px] text-slate-500">Be careful.</span>
                    </div>
                  </div>
                </details>
              </>
            ) : null}
          </div>
        }
      />

      {/* Forbidden banner placeholder */}
      {forbidden ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/40 p-4">
          <p className="text-sm font-semibold text-rose-100">You do not have permission to edit this invoice.</p>
          <p className="mt-1 text-xs text-rose-200/90">
            Only estate OWNERs or EDITORs can make changes. Request access if needed.
          </p>
        </div>
      ) : null}

      {isOverdue ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/40 p-4">
          <p className="text-sm font-semibold text-amber-100">Overdue</p>
          <p className="mt-1 text-xs text-amber-200/90">
            This invoice is {daysPastDue} day{daysPastDue === 1 ? "" : "s"} past the due date. Consider following up or
            updating the status once paid.
          </p>
        </div>
      ) : null}

      <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Status</p>
            <p className="mt-1 text-sm font-medium text-slate-50">{statusLabel}</p>
            <p className="mt-1 text-xs text-slate-400">{statusHelperText(statusUpper)}</p>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Issue date</p>
            <p className="mt-1 text-sm font-medium text-slate-50">{formatDate(issue)}</p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Due date</p>
            <p className="mt-1 text-sm font-medium text-slate-50">{formatDate(due)}</p>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Totals</p>
            <p className="mt-1 text-sm font-medium text-slate-50">
              {formatCurrencyFromCents(totalCents)}
              <span className="text-xs text-slate-400"> • Subtotal {formatCurrencyFromCents(subtotalCents)}</span>
            </p>
          </div>
        </div>

        <details className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
          <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-slate-300">
            Raw record
          </summary>
          <pre className="mt-3 max-h-80 overflow-auto rounded-md border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-200">
            {JSON.stringify(
              {
                ...invoiceDoc,
                _id: invoiceIdText,
                estateId,
              },
              null,
              2,
            )}
          </pre>
          <p className="mt-2 text-[11px] text-slate-500">Estate: {estateId} • Invoice: {invoiceId}</p>
        </details>
      </section>
    </div>
  );
}