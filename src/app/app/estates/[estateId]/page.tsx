import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";
import { Invoice } from "@/models/Invoice";
import { EstateDocument } from "@/models/EstateDocument";
import { EstateTask } from "@/models/EstateTask";
import { EstateNote } from "@/models/EstateNote";

type PageProps = {
  params: Promise<{
    estateId: string;
  }>;
};

type DashboardInvoice = {
  _id: string;
  description: string;
  amount: number;
  issueDate: string;
  dueDate?: string;
  status?: string;
};

type EstateLean = {
  _id: unknown;
  name?: string | null;
  decedentName?: string | null;
  caseNumber?: string | null;
  referenceId?: string | null;
  courtName?: string | null;
};

type InvoiceLean = {
  _id: unknown;
  description?: string | null;
  status?: string | null;
  issueDate?: Date | string | null;
  dueDate?: Date | string | null;
  subtotal?: number | null;
  totalAmount?: number | null;
};

type EstateDocumentRow = {
  _id: string;
  label: string;
  subject?: string | null;
  url?: string | null;
  location?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  fileSizeBytes?: number | null;
  createdAt?: string | null;
};

type EstateDocumentLean = {
  _id: unknown;
  label?: string | null;
  subject?: string | null;
  url?: string | null;
  location?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  fileSizeBytes?: number | null;
  createdAt?: Date | string | null;
};

type EstateTaskLean = {
  _id: unknown;
  title?: string | null;
  description?: string | null;
  status?: string | null;
  dueDate?: Date | string | null;
  completedAt?: Date | string | null;
};

type EstateTaskRow = {
  _id: string;
  title: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "DONE";
  dueDate?: string | null;
  isOverdue: boolean;
};

type EstateNoteLean = {
  _id: unknown;
  body?: string | null;
  pinned?: boolean | null;
  createdAt?: Date | string | null;
};

type EstateNoteRow = {
  _id: string;
  body: string;
  pinned: boolean;
  createdAt?: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  UNPAID: "Unpaid",
  PARTIAL: "Partial",
  PAID: "Paid",
  VOID: "Void",
};

/** Human-readable document subject labels */
const DOCUMENT_SUBJECT_LABELS: Record<string, string> = {
  BANKING: "Banking",
  AUTO: "Auto",
  MEDICAL: "Medical",
  INCOME_TAX: "Income tax",
  PROPERTY: "Property",
  INSURANCE: "Insurance",
  IDENTITY: "Identity / ID",
  LEGAL: "Legal",
  ESTATE_ACCOUNTING: "Estate accounting",
  RECEIPTS: "Receipts",
  OTHER: "Other",
};

function formatCurrency(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return "$0.00";
  return `$${amount.toFixed(2)}`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function truncate(text: string, max = 200): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "…";
}

export default async function EstateOverviewPage({ params }: PageProps) {
  const { estateId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  await connectToDatabase();

  const estateDoc = (await Estate.findOne({
    _id: estateId,
    ownerId: session.user.id,
  })
    .lean()
    .exec()) as EstateLean | null;

  if (!estateDoc) {
    notFound();
  }

  const invoiceDocs = (await Invoice.find(
    { estateId, ownerId: session.user.id },
    {
      description: 1,
      status: 1,
      issueDate: 1,
      dueDate: 1,
      subtotal: 1,
      totalAmount: 1,
    },
  )
    .lean()
    .exec()) as InvoiceLean[];

  const documentDocs = (await EstateDocument.find(
    { estateId, ownerId: session.user.id },
    {
      label: 1,
      subject: 1,
      url: 1,
      location: 1,
      fileName: 1,
      fileType: 1,
      fileSizeBytes: 1,
      createdAt: 1,
    },
  )
    .lean()
    .exec()) as EstateDocumentLean[];

  const taskDocs = (await EstateTask.find(
    { estateId, ownerId: session.user.id },
    {
      title: 1,
      description: 1,
      status: 1,
      dueDate: 1,
      completedAt: 1,
    },
  )
    .lean()
    .exec()) as EstateTaskLean[];

  const noteDocs = (await EstateNote.find(
    { estateId, ownerId: session.user.id },
    { body: 1, pinned: 1, createdAt: 1 },
  )
    .sort({ pinned: -1, createdAt: -1 })
    .lean()
    .exec()) as EstateNoteLean[];

  /** INVOICES → clean rows */
  const invoices: DashboardInvoice[] = invoiceDocs.map((doc) => {
    const rawAmount =
      typeof doc.totalAmount === "number"
        ? doc.totalAmount
        : typeof doc.subtotal === "number"
        ? doc.subtotal
        : 0;

    const amountDollars =
      typeof rawAmount === "number" && !Number.isNaN(rawAmount)
        ? rawAmount / 100
        : 0;

    const issue =
      doc.issueDate instanceof Date
        ? doc.issueDate.toISOString()
        : doc.issueDate ?? "";

    const due =
      doc.dueDate instanceof Date
        ? doc.dueDate.toISOString()
        : doc.dueDate ?? undefined;

    const description =
      typeof doc.description === "string" && doc.description.trim().length > 0
        ? doc.description
        : "Invoice";

    return {
      _id: String(doc._id),
      description,
      amount: amountDollars,
      issueDate: issue,
      dueDate: due,
      status: doc.status ?? undefined,
    };
  });

  /** DOCUMENTS → clean rows */
  const documents: EstateDocumentRow[] = documentDocs.map((doc) => {
    const createdAt =
      doc.createdAt instanceof Date
        ? doc.createdAt.toISOString()
        : (doc.createdAt as string | null | undefined) ?? null;

    const label =
      typeof doc.label === "string" && doc.label.trim().length > 0
        ? doc.label
        : "Document";

    return {
      _id: String(doc._id),
      label,
      subject: doc.subject ?? null,
      url: doc.url ?? null,
      location: doc.location ?? null,
      fileName: doc.fileName ?? null,
      fileType: doc.fileType ?? null,
      fileSizeBytes:
        typeof doc.fileSizeBytes === "number" ? doc.fileSizeBytes : null,
      createdAt,
    };
  });

  /** TASKS → clean rows */
  const tasks: EstateTaskRow[] = taskDocs.map((doc) => {
    const title =
      typeof doc.title === "string" && doc.title.trim().length > 0
        ? doc.title
        : "Task";

    const statusRaw =
      typeof doc.status === "string" && doc.status.trim().length > 0
        ? doc.status.toUpperCase()
        : "NOT_STARTED";

    const status: EstateTaskRow["status"] =
      statusRaw === "IN_PROGRESS" || statusRaw === "DONE"
        ? statusRaw
        : "NOT_STARTED";

    const due =
      doc.dueDate instanceof Date
        ? doc.dueDate.toISOString()
        : (doc.dueDate as string | null | undefined) ?? null;

    let isOverdue = false;
    if (due) {
      const dueDate = new Date(due);
      const now = new Date();
      if (!Number.isNaN(dueDate.getTime())) {
        isOverdue = dueDate < now && status !== "DONE";
      }
    }

    return {
      _id: String(doc._id),
      title,
      status,
      dueDate: due,
      isOverdue,
    };
  });

  /** NOTES → clean rows */
  const notes: EstateNoteRow[] = noteDocs.map((doc) => {
    const body =
      typeof doc.body === "string" && doc.body.trim().length > 0
        ? doc.body.trim()
        : "";

    const createdAt =
      doc.createdAt instanceof Date
        ? doc.createdAt.toISOString()
        : (doc.createdAt as string | null | undefined) ?? null;

    return {
      _id: String(doc._id),
      body,
      pinned: Boolean(doc.pinned),
      createdAt,
    };
  });

  const pinnedNote = notes.find((n) => n.pinned) ?? null;
  const latestNote = notes.length > 0 ? notes[0] : null;

  const totalInvoiced = invoices.reduce(
    (sum, inv) => sum + (inv.amount ?? 0),
    0,
  );

  const unpaidTotal = invoices
    .filter((inv) => (inv.status ?? "DRAFT").toUpperCase() !== "PAID")
    .reduce((sum, inv) => sum + (inv.amount ?? 0), 0);

  const paidTotal = invoices
    .filter((inv) => (inv.status ?? "DRAFT").toUpperCase() === "PAID")
    .reduce((sum, inv) => sum + (inv.amount ?? 0), 0);

  const overdueCount = invoices.filter((inv) => {
    if (!inv.dueDate) return false;
    const due = new Date(inv.dueDate);
    const now = new Date();
    const statusUpper = (inv.status ?? "DRAFT").toUpperCase();
    return due < now && statusUpper !== "PAID";
  }).length;

  const estateName = estateDoc.name ?? "Estate";
  const decedentName = estateDoc.decedentName ?? null;
  const caseNumber = estateDoc.caseNumber ?? null;
  const referenceId = estateDoc.referenceId ?? null;
  const courtName = estateDoc.courtName ?? null;

  const recentInvoices = [...invoices]
    .sort((a, b) => {
      const aDate = a.issueDate ? new Date(a.issueDate).getTime() : 0;
      const bDate = b.issueDate ? new Date(b.issueDate).getTime() : 0;
      return bDate - aDate;
    })
    .slice(0, 5);

  const recentDocuments = [...documents]
    .sort((a, b) => {
      const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bDate - aDate;
    })
    .slice(0, 5);

  const openTasks = tasks.filter((t) => t.status !== "DONE");
  const completedTasks = tasks.filter((t) => t.status === "DONE");
  const overdueTasksCount = tasks.filter((t) => t.isOverdue).length;

  // Show up to 5 tasks, prioritizing overdue and with due dates
  const recentTasks = [...tasks]
    .sort((a, b) => {
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;

      const aTime = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const bTime = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return aTime - bTime;
    })
    .slice(0, 5);

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-col gap-3 border-b border-gray-200 pb-4 md:flex-row md:items-baseline md:justify-between">
        <div>
          <p className="text-xs text-gray-500">
            <Link href="/app/estates" className="hover:underline">
              ← Back to estates
            </Link>
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{estateName}</h1>
          {decedentName && (
            <p className="text-sm text-gray-600">
              Decedent: <span className="font-medium">{decedentName}</span>
            </p>
          )}
          <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-500">
            {caseNumber && (
              <span>
                Case: <span className="font-medium">{caseNumber}</span>
              </span>
            )}
            {referenceId && (
              <span>
                Reference:{" "}
                <span className="font-medium">{referenceId}</span>
              </span>
            )}
            {courtName && (
              <span>
                Court: <span className="font-medium">{courtName}</span>
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <Link
            href={`/app/estates/${estateId}/invoices`}
            className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            View all invoices
          </Link>
        </div>
      </header>

      {/* Notes preview (private) */}
      <section className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              Notes (private)
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              Use notes for anything that doesn&apos;t fit in invoices or
              documents—conversations, ideas, reminders.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 text-xs text-gray-500">
            {notes.length > 0 && (
              <span>
                <span className="font-medium">{notes.length}</span> note
                {notes.length === 1 ? "" : "s"}
              </span>
            )}
            <Link
              href={`/app/estates/${estateId}/notes`}
              className="text-[11px] font-medium text-blue-600 hover:underline"
            >
              Open full notes
            </Link>
          </div>
        </div>

        {notes.length === 0 ? (
          <p className="text-sm text-gray-500">
            No notes yet. Try jotting down what&apos;s on your mind about this
            estate right now—questions, to-dos, or what you talked about with
            the court or attorney.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {pinnedNote && (
              <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-gray-800">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase text-yellow-700">
                    Pinned
                  </span>
                  {pinnedNote.createdAt && (
                    <span className="text-[11px] text-yellow-800/80">
                      {formatDate(pinnedNote.createdAt)}
                    </span>
                  )}
                </div>
                <p className="text-sm whitespace-pre-wrap">
                  {truncate(pinnedNote.body)}
                </p>
              </div>
            )}

            {latestNote && (!pinnedNote || latestNote._id !== pinnedNote._id) && (
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase text-gray-700">
                    Most recent
                  </span>
                  {latestNote.createdAt && (
                    <span className="text-[11px] text-gray-500">
                      {formatDate(latestNote.createdAt)}
                    </span>
                  )}
                </div>
                <p className="text-sm whitespace-pre-wrap">
                  {truncate(latestNote.body)}
                </p>
              </div>
            )}

            {!pinnedNote && latestNote && notes.length === 1 && (
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800 md:col-span-2">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase text-gray-700">
                    Latest note
                  </span>
                  {latestNote.createdAt && (
                    <span className="text-[11px] text-gray-500">
                      {formatDate(latestNote.createdAt)}
                    </span>
                  )}
                </div>
                <p className="text-sm whitespace-pre-wrap">
                  {truncate(latestNote.body)}
                </p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Financial summary */}
      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-gray-500">
            Total Invoiced
          </p>
          <p className="mt-1 text-xl font-semibold">
            {formatCurrency(totalInvoiced)}
          </p>
        </div>
        <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-gray-500">
            Outstanding
          </p>
          <p className="mt-1 text-xl font-semibold">
            {formatCurrency(unpaidTotal)}
          </p>
        </div>
        <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-gray-500">
            Paid
          </p>
          <p className="mt-1 text-xl font-semibold">
            {formatCurrency(paidTotal)}
          </p>
        </div>
        <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-gray-500">
            Overdue Invoices
          </p>
          <p className="mt-1 text-xl font-semibold">{overdueCount}</p>
        </div>
      </section>

      {/* Recent invoices */}
      <section className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent Invoices</h2>
          <Link
            href={`/app/estates/${estateId}/invoices`}
            className="text-xs font-medium text-blue-600 hover:underline"
          >
            View all
          </Link>
        </div>

        {recentInvoices.length === 0 ? (
          <p className="text-sm text-gray-500">
            No invoices have been created for this estate yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-gray-500">
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Issue Date</th>
                  <th className="px-3 py-2">Due Date</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {recentInvoices.map((inv) => {
                  const statusUpper = (inv.status ?? "DRAFT").toUpperCase();
                  const statusLabel =
                    STATUS_LABELS[statusUpper] ?? inv.status ?? "Unknown";

                  return (
                    <tr key={inv._id} className="border-b last:border-0">
                      <td className="px-3 py-2 align-top">
                        <Link
                          href={`/app/estates/${estateId}/invoices/${inv._id}`}
                          className="text-sm font-medium text-blue-600 hover:underline"
                        >
                          {inv.description}
                        </Link>
                      </td>
                      <td className="px-3 py-2 align-top text-right">
                        {formatCurrency(inv.amount)}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {formatDate(inv.issueDate)}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {formatDate(inv.dueDate ?? null)}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium capitalize">
                          {statusLabel}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="flex justify-end gap-2 text-xs">
                          <Link
                            href={`/app/estates/${estateId}/invoices/${inv._id}`}
                            className="text-blue-600 hover:underline"
                          >
                            View
                          </Link>
                          <Link
                            href={`/app/estates/${estateId}/invoices/${inv._id}/edit`}
                            className="text-blue-600 hover:underline"
                          >
                            Edit
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Tasks / Probate checklist */}
      <section className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <h2 className="text-lg font-semibold">
            Tasks &amp; probate checklist
            {tasks.length > 0 ? ` (${tasks.length})` : ""}
          </h2>
          {tasks.length > 0 && (
            <div className="flex flex-col items-end gap-1 text-xs text-gray-500">
              <div>
                <span className="font-medium">{openTasks.length}</span> open ·{" "}
                <span className="font-medium">{completedTasks.length}</span>{" "}
                done ·{" "}
                <span className="font-medium">{overdueTasksCount}</span>{" "}
                overdue
              </div>
              <p className="text-[11px] text-gray-400">
                Use this checklist to track court steps, banking, and
                paperwork.
              </p>
              <Link
                href={`/app/estates/${estateId}/tasks`}
                className="text-[11px] font-medium text-blue-600 hover:underline"
              >
                Open full task list
              </Link>
            </div>
          )}
        </div>

        {tasks.length === 0 ? (
          <p className="text-sm text-gray-500">
            No tasks yet. Start by listing the first 3–5 things you need to do
            for this estate.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-gray-500">
                  <th className="px-3 py-2">Task</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Due</th>
                </tr>
              </thead>
              <tbody>
                {recentTasks.map((task) => (
                  <tr key={task._id} className="border-b last:border-0">
                    <td className="px-3 py-2 align-top">
                      <span className="font-medium text-gray-900">
                        {task.title}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          task.status === "DONE"
                            ? "bg-green-100 text-green-800"
                            : task.isOverdue
                            ? "bg-red-100 text-red-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {task.status === "NOT_STARTED"
                          ? "Not started"
                          : task.status === "IN_PROGRESS"
                          ? "In progress"
                          : "Done"}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top">
                      {task.dueDate ? (
                        <span
                          className={
                            task.isOverdue && task.status !== "DONE"
                              ? "text-red-600"
                              : "text-gray-700"
                          }
                        >
                          {formatDate(task.dueDate)}
                        </span>
                      ) : (
                        <span className="text-gray-400">No due date</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Documents preview */}
      <section className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <h2 className="text-lg font-semibold">
            Documents{documents.length > 0 ? ` (${documents.length})` : ""}
          </h2>

          {/* Quick search → sends you to full index with ?q=..., &subject=..., &sensitive=1 */}
          <div className="flex flex-col items-end gap-1">
            <form
              method="GET"
              action={`/app/estates/${estateId}/documents`}
              className="flex flex-wrap items-center gap-2 md:gap-1"
            >
              <label htmlFor="docs-q" className="sr-only">
                Search documents
              </label>
              <input
                id="docs-q"
                name="q"
                placeholder="Search documents…"
                className="h-7 w-36 rounded-md border border-gray-300 px-2 text-xs text-gray-800 placeholder:text-gray-400 md:w-48"
              />

              <label htmlFor="docs-subject" className="sr-only">
                Filter by subject
              </label>
              <select
                id="docs-subject"
                name="subject"
                className="h-7 rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-800"
              >
                <option value="">All subjects</option>
                {Object.entries(DOCUMENT_SUBJECT_LABELS).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ),
                )}
              </select>

              {/* Sensitive only toggle (mirrors index page behavior) */}
              <label className="flex items-center gap-1 text-[11px] text-gray-500">
                <input
                  type="checkbox"
                  name="sensitive"
                  value="1"
                  className="h-3 w-3"
                />
                Sensitive only
              </label>

              <button
                type="submit"
                className="hidden rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 md:inline-block"
              >
                Go
              </button>
            </form>
            <Link
              href={`/app/estates/${estateId}/documents`}
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              Open full index
            </Link>
            <Link
              href={`/app/estates/${estateId}/documents?newSensitive=1#add-document`}
              className="text-xs font-medium text-rose-600 hover:underline"
            >
              Create sensitive doc
            </Link>
          </div>
        </div>

        {recentDocuments.length === 0 ? (
          <p className="text-sm text-gray-500">
            No documents have been recorded for this estate yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-gray-500">
                  <th className="px-3 py-2">Label</th>
                  <th className="px-3 py-2">Subject</th>
                  <th className="px-3 py-2">Added</th>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2 text-right">Link</th>
                </tr>
              </thead>
              <tbody>
                {recentDocuments.map((doc) => (
                  <tr key={doc._id} className="border-b last:border-0">
                    <td className="px-3 py-2 align-top">
                      <span className="font-medium">{doc.label}</span>
                    </td>
                    <td className="px-3 py-2 align-top">
                      {doc.subject
                        ? DOCUMENT_SUBJECT_LABELS[doc.subject] ?? doc.subject
                        : "Other"}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {doc.createdAt ? formatDate(doc.createdAt) : "—"}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {doc.location ?? "—"}
                    </td>
                    <td className="px-3 py-2 align-top text-right">
                      {doc.url ? (
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium text-blue-600 hover:underline"
                        >
                          Open
                        </a>
                      ) : (
                        <span className="text-xs text-gray-400">No link</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}