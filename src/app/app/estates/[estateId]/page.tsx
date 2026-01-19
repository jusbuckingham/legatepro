import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { getEstateAccess } from "@/lib/validators";
import { Estate } from "@/models/Estate";
import { Invoice } from "@/models/Invoice";
import { EstateDocument } from "@/models/EstateDocument";
import { EstateTask } from "@/models/EstateTask";
import { EstateNote } from "@/models/EstateNote";
import EstateEvent from "@/models/EstateEvent";

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

type EstateEventLean = {
  _id: unknown;
  type?: string | null;
  summary?: string | null;
  detail?: string | null;
  createdAt?: Date | string | null;
};

type EstateEventRow = {
  _id: string;
  type: string;
  summary: string;
  detail?: string | null;
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

function normalizeInvoiceAmountToDollars(rawAmount: number): number {
  // In current schema we treat totals as cents.
  // But older data may have stored totals in dollars.
  // Heuristic: values >= 10,000 are almost certainly cents (>= $100.00).
  if (!Number.isFinite(rawAmount)) return 0;
  if (rawAmount >= 10_000) return rawAmount / 100;
  return rawAmount;
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

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || Number.isNaN(bytes) || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  const precision = i === 0 ? 0 : i === 1 ? 0 : 1;
  return `${n.toFixed(precision)} ${units[i]}`;
}

function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export default async function EstateOverviewPage({ params }: PageProps) {
  const { estateId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  await connectToDatabase();

  const access = await getEstateAccess(estateId, session.user.id);
  if (!access) {
    // If the estate doesn't exist or the user has no access, send them back
    redirect("/app/estates");
  }

  const canEdit = access.canEdit;
  const canViewSensitive = access.canViewSensitive;

  const documentFilter: Record<string, unknown> = { estateId };
  if (!canViewSensitive) {
    documentFilter.isSensitive = false;
  }

  const [estateDoc, invoiceDocs, documentDocs, taskDocs, noteDocs, eventDocs] =
    (await Promise.all([
      Estate.findById(estateId).lean().exec(),
      Invoice.find(
        { estateId },
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
        .exec(),
      EstateDocument.find(
        documentFilter,
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
        .exec(),
      EstateTask.find(
        { estateId },
        {
          title: 1,
          description: 1,
          status: 1,
          dueDate: 1,
          completedAt: 1,
        },
      )
        .lean()
        .exec(),
      EstateNote.find(
        { estateId },
        { body: 1, pinned: 1, createdAt: 1 },
      )
        .sort({ pinned: -1, createdAt: -1 })
        .lean()
        .exec(),
      EstateEvent.find(
        { estateId },
        { type: 1, summary: 1, detail: 1, createdAt: 1 },
      )
        .sort({ createdAt: -1 })
        .limit(5)
        .lean()
        .exec(),
    ])) as [
      EstateLean | null,
      InvoiceLean[],
      EstateDocumentLean[],
      EstateTaskLean[],
      EstateNoteLean[],
      EstateEventLean[],
    ];

  if (!estateDoc) {
    notFound();
  }

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
        ? normalizeInvoiceAmountToDollars(rawAmount)
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

  /** ACTIVITY → clean rows */
  const recentActivity: EstateEventRow[] = (eventDocs ?? []).map((doc) => {
    const createdAt =
      doc.createdAt instanceof Date
        ? doc.createdAt.toISOString()
        : (doc.createdAt as string | null | undefined) ?? null;

    const type =
      typeof doc.type === "string" && doc.type.trim().length > 0
        ? doc.type
        : "EVENT";

    const summary =
      typeof doc.summary === "string" && doc.summary.trim().length > 0
        ? doc.summary
        : "Activity";

    const detail =
      typeof doc.detail === "string" && doc.detail.trim().length > 0
        ? doc.detail
        : null;

    return {
      _id: String(doc._id),
      type,
      summary,
      detail,
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
  const checklistComplete = tasks.length > 0 && openTasks.length === 0;
  const isEstateEmpty =
    invoices.length === 0 &&
    tasks.length === 0 &&
    documents.length === 0 &&
    notes.length === 0 &&
    recentActivity.length === 0;

  // Tasks sorted: overdue first, then soonest due date
  const sortedTasks = [...tasks].sort((a, b) => {
    if (a.isOverdue && !b.isOverdue) return -1;
    if (!a.isOverdue && b.isOverdue) return 1;

    const aTime = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const bTime = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    return aTime - bTime;
  });

  // Show up to 5 tasks in the main preview
  const recentTasks = sortedTasks.slice(0, 5);

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
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{estateName}</h1>
            <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700">
              {access.role === "OWNER"
                ? "Owner"
                : access.role === "EDITOR"
                ? "Editor"
                : "Viewer"}
            </span>
          </div>
          {access.role === "VIEWER" && (
            <div className="mt-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              <div className="font-semibold">Read-only access</div>
              <div className="mt-1 text-xs text-blue-900/80">
                You can view this estate, but creating, editing, and deleting are disabled.
              </div>
            </div>
          )}
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
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/app/estates/${estateId}/timeline`}
              className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              View timeline
            </Link>
            <Link
              href={`/app/estates/${estateId}/activity`}
              className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              Activity
            </Link>
            <Link
              href={`/app/estates/${estateId}/invoices`}
              className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              View all invoices
            </Link>
            <Link
              href={`/app/estates/${estateId}/collaborators`}
              className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              {access.role === "OWNER" ? "Manage collaborators" : "View collaborators"}
            </Link>

            {/* Quick-create shortcuts (hidden for VIEWER) */}
            {canEdit && (
              <>
                <span className="hidden h-6 w-px bg-gray-200 md:inline-block" />

                <Link
                  href={`/app/estates/${estateId}/invoices/new`}
                  className="rounded-md bg-gray-900 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-black"
                >
                  New invoice
                </Link>
                <Link
                  href={`/app/estates/${estateId}/documents#add-document`}
                  className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                >
                  Add document
                </Link>
                <Link
                  href={`/app/estates/${estateId}/tasks#add-task`}
                  className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                >
                  Add task
                </Link>
                <Link
                  href={`/app/estates/${estateId}/notes#add-note`}
                  className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                >
                  Add note
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      {isEstateEmpty ? (
        <section className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Getting started</h2>
              <p className="mt-1 text-xs text-gray-500">
                Add a few basics and this overview will start populating automatically.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canEdit ? (
                <>
                  <Link
                    href={`/app/estates/${estateId}/tasks#add-task`}
                    className="rounded-md bg-gray-900 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-black"
                  >
                    Add first task
                  </Link>
                  <Link
                    href={`/app/estates/${estateId}/invoices/new`}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                  >
                    Create invoice
                  </Link>
                </>
              ) : (
                <span className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-900">
                  Ask an owner/editor to add the first items.
                </span>
              )}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase text-gray-700">Step 1</p>
                <span className="text-[11px] text-gray-500">Tasks</span>
              </div>
              <p className="mt-1 text-sm font-medium text-gray-900">Add a probate checklist</p>
              <p className="mt-1 text-xs text-gray-500">
                Start with 3–5 tasks: court filings, bank steps, property actions.
              </p>
              <div className="mt-2">
                <Link
                  href={
                    canEdit
                      ? `/app/estates/${estateId}/tasks#add-task`
                      : `/app/estates/${estateId}/tasks`
                  }
                  className="text-xs font-medium text-blue-600 hover:underline"
                >
                  {canEdit ? "Add a task" : "View tasks"}
                </Link>
              </div>
            </div>

            <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase text-gray-700">Step 2</p>
                <span className="text-[11px] text-gray-500">Invoices</span>
              </div>
              <p className="mt-1 text-sm font-medium text-gray-900">Track work and billing</p>
              <p className="mt-1 text-xs text-gray-500">
                Create your first invoice so totals and overdue alerts show up here.
              </p>
              <div className="mt-2 flex flex-wrap gap-3">
                <Link
                  href={`/app/estates/${estateId}/invoices`}
                  className="text-xs font-medium text-blue-600 hover:underline"
                >
                  View invoices
                </Link>
                {canEdit ? (
                  <Link
                    href={`/app/estates/${estateId}/invoices/new`}
                    className="text-xs font-medium text-gray-700 hover:underline"
                  >
                    Create invoice
                  </Link>
                ) : null}
              </div>
            </div>

            <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase text-gray-700">Step 3</p>
                <span className="text-[11px] text-gray-500">Documents</span>
              </div>
              <p className="mt-1 text-sm font-medium text-gray-900">Index key documents</p>
              <p className="mt-1 text-xs text-gray-500">
                Add letters, court filings, IDs, banking info, receipts, and more.
              </p>
              <div className="mt-2 flex flex-wrap gap-3">
                <Link
                  href={`/app/estates/${estateId}/documents`}
                  className="text-xs font-medium text-blue-600 hover:underline"
                >
                  View documents
                </Link>
                {canEdit ? (
                  <Link
                    href={
                      canEdit
                        ? `/app/estates/${estateId}/documents#add-document`
                        : `/app/estates/${estateId}/documents`
                    }
                    className="text-xs font-medium text-gray-700 hover:underline"
                  >
                    Add document
                  </Link>
                ) : null}
              </div>
            </div>

            <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase text-gray-700">Step 4</p>
                <span className="text-[11px] text-gray-500">Notes</span>
              </div>
              <p className="mt-1 text-sm font-medium text-gray-900">Capture context</p>
              <p className="mt-1 text-xs text-gray-500">
                Keep a running log of calls, court info, and decisions.
              </p>
              <div className="mt-2 flex flex-wrap gap-3">
                <Link
                  href={`/app/estates/${estateId}/notes`}
                  className="text-xs font-medium text-blue-600 hover:underline"
                >
                  View notes
                </Link>
                {canEdit ? (
                  <Link
                    href={
                      canEdit
                        ? `/app/estates/${estateId}/notes#add-note`
                        : `/app/estates/${estateId}/notes`
                    }
                    className="text-xs font-medium text-gray-700 hover:underline"
                  >
                    Add note
                  </Link>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3 text-[11px] text-gray-500">
            {canEdit ? (
              <>
                <Link
                  href={`/app/estates/${estateId}/contacts/new`}
                  className="font-medium text-blue-600 hover:underline"
                >
                  Add a contact
                </Link>
                <Link
                  href={`/app/estates/${estateId}/properties/new`}
                  className="font-medium text-blue-600 hover:underline"
                >
                  Add a property
                </Link>
                <Link
                  href={`/app/estates/${estateId}/rent/new`}
                  className="font-medium text-blue-600 hover:underline"
                >
                  Record rent
                </Link>
              </>
            ) : (
              <>
                <Link
                  href={`/app/estates/${estateId}/contacts`}
                  className="font-medium text-blue-600 hover:underline"
                >
                  View contacts
                </Link>
                <Link
                  href={`/app/estates/${estateId}/properties`}
                  className="font-medium text-blue-600 hover:underline"
                >
                  View properties
                </Link>
                <Link
                  href={`/app/estates/${estateId}/rent`}
                  className="font-medium text-blue-600 hover:underline"
                >
                  View rent
                </Link>
              </>
            )}
          </div>
        </section>
      ) : null}
      {(overdueCount > 0 || overdueTasksCount > 0) && (
        <section className="rounded-md border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold text-amber-900">
                Attention needed
              </div>
              <div className="mt-1 text-xs text-amber-900/80">
                {overdueCount > 0 && (
                  <span className="mr-3">
                    <span className="font-semibold">{overdueCount}</span> overdue invoice
                    {overdueCount === 1 ? "" : "s"}
                  </span>
                )}
                {overdueTasksCount > 0 && (
                  <span>
                    <span className="font-semibold">{overdueTasksCount}</span> overdue task
                    {overdueTasksCount === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {overdueCount > 0 && (
                <Link
                  href={`/app/estates/${estateId}/invoices`}
                  className="rounded-md border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
                >
                  Review invoices
                </Link>
              )}
              {overdueTasksCount > 0 && (
                <Link
                  href={`/app/estates/${estateId}/tasks`}
                  className="rounded-md border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
                >
                  Review tasks
                </Link>
              )}
            </div>
          </div>
        </section>
      )}

      {/* At-a-glance */}
      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
            Documents
          </p>
          <p className="mt-1 text-xl font-semibold text-gray-900">
            {documents.length}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {canViewSensitive
              ? "Includes sensitive (if allowed)"
              : "Sensitive hidden"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={`/app/estates/${estateId}/documents`}
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              View index
            </Link>
            {canEdit && (
              <Link
                href={`/app/estates/${estateId}/documents#add-document`}
                className="text-xs font-medium text-gray-700 hover:underline"
              >
                Add
              </Link>
            )}
          </div>
        </div>

        <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
            Tasks
          </p>
          <p className="mt-1 text-xl font-semibold text-gray-900">
            {openTasks.length}
            <span className="ml-2 text-sm font-medium text-gray-500">
              open
            </span>
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {overdueTasksCount > 0
              ? `${overdueTasksCount} overdue`
              : "No overdue tasks"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={`/app/estates/${estateId}/tasks`}
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              View list
            </Link>
            {canEdit && (
              <Link
                href={`/app/estates/${estateId}/tasks#add-task`}
                className="text-xs font-medium text-gray-700 hover:underline"
              >
                Add
              </Link>
            )}
          </div>
        </div>

        <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
            Notes
          </p>
          <p className="mt-1 text-xl font-semibold text-gray-900">
            {notes.length}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {pinnedNote ? "Pinned note set" : "No pinned note"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={`/app/estates/${estateId}/notes`}
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              View notes
            </Link>
            {canEdit && (
              <Link
                href={`/app/estates/${estateId}/notes#add-note`}
                className="text-xs font-medium text-gray-700 hover:underline"
              >
                Add
              </Link>
            )}
          </div>
        </div>

        <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
            Invoices
          </p>
          <p className="mt-1 text-xl font-semibold text-gray-900">
            {invoices.length}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {overdueCount > 0 ? `${overdueCount} overdue` : "No overdue invoices"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={`/app/estates/${estateId}/invoices`}
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              View all
            </Link>
            {canEdit && (
              <Link
                href={`/app/estates/${estateId}/invoices/new`}
                className="text-xs font-medium text-gray-700 hover:underline"
              >
                New
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Recent activity */}
      <section className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent activity</h2>
          <div className="flex items-center gap-3">
            <Link
              href={`/app/estates/${estateId}/timeline`}
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              View timeline
            </Link>
            <Link
              href={`/app/estates/${estateId}/activity`}
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              View all
            </Link>
          </div>
        </div>

        {recentActivity.length === 0 ? (
          <p className="text-sm text-gray-500">No activity yet.</p>
        ) : (
          <div className="overflow-hidden rounded-md border border-gray-200">
            <div className="grid grid-cols-[140px_1fr_120px] gap-2 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase text-gray-600">
              <div>Type</div>
              <div>Summary</div>
              <div className="text-right">When</div>
            </div>

            {recentActivity.map((evt: EstateEventRow) => (
              <div
                key={evt._id}
                className="grid grid-cols-[140px_1fr_120px] gap-2 border-t border-gray-200 px-3 py-2"
              >
                <div className="text-xs font-medium text-gray-700">{evt.type}</div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-gray-900">
                    {evt.summary}
                  </div>
                  {evt.detail ? (
                    <div className="mt-0.5 truncate text-xs text-gray-500">
                      {evt.detail}
                    </div>
                  ) : null}
                </div>
                <div className="text-right text-xs text-gray-500">
                  {evt.createdAt ? formatDate(evt.createdAt) : "—"}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={`/app/estates/${estateId}/timeline`}
            className="text-xs font-medium text-blue-600 hover:underline"
          >
            Open timeline
          </Link>
          <Link
            href={`/app/estates/${estateId}/activity`}
            className="text-xs font-medium text-blue-600 hover:underline"
          >
            Open activity feed
          </Link>
          {canEdit && (
            <span className="text-xs text-gray-400">
              Tip: add quick notes from the Activity page (Activity → Add note).
            </span>
          )}
        </div>
      </section>

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
              View all notes
            </Link>
            {access.role === "VIEWER" && (
              <span className="text-[11px] text-gray-400">
                Create/edit disabled
              </span>
            )}
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

      {/* Financial summary (invoices) */}
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
                  const isOverdue =
                    statusUpper !== "PAID" &&
                    Boolean(inv.dueDate) &&
                    new Date(inv.dueDate as string).getTime() < new Date().getTime();

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
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-1 text-xs font-medium",
                            statusUpper === "PAID" && "bg-green-100 text-green-800",
                            isOverdue && "bg-red-100 text-red-800",
                            statusUpper !== "PAID" && !isOverdue && "bg-gray-100 text-gray-800",
                          )}
                        >
                          {isOverdue ? "Overdue" : statusLabel}
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
                          {canEdit && (
                            <Link
                              href={`/app/estates/${estateId}/invoices/${inv._id}/edit`}
                              className="text-blue-600 hover:underline"
                            >
                              Edit
                            </Link>
                          )}
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
                <span className="font-medium">{completedTasks.length}</span> done ·{" "}
                <span className="font-medium">{overdueTasksCount}</span> overdue
              </div>
              <p className="text-[11px] text-gray-400">
                Use this checklist to track court steps, banking, and paperwork.
              </p>
              <Link
                href={`/app/estates/${estateId}/tasks`}
                className="text-[11px] font-medium text-blue-600 hover:underline"
              >
                View all tasks
              </Link>
              {access.role === "VIEWER" && (
                <span className="text-[11px] text-gray-400">Create/edit disabled</span>
              )}
            </div>
          )}
        </div>

        {/* Auto-hide when checklist is complete */}
        {tasks.length === 0 ? (
          <p className="text-sm text-gray-500">
            No tasks yet. Start by listing the first 3–5 things you need to do for this estate.
          </p>
        ) : checklistComplete ? (
          <details className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
            <summary className="cursor-pointer list-none">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-sm font-semibold text-emerald-900">Checklist complete</div>
                  <div className="mt-1 text-xs text-emerald-900/80">
                    All tasks are marked done. You can add more as new steps come up.
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/app/estates/${estateId}/tasks`}
                    className="rounded-md border border-emerald-300 bg-white px-3 py-1 text-xs font-medium text-emerald-900 hover:bg-emerald-100"
                  >
                    View tasks
                  </Link>
                  {canEdit ? (
                    <Link
                      href={`/app/estates/${estateId}/tasks#add-task`}
                      className="rounded-md bg-emerald-900 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-emerald-950"
                    >
                      Add a new task
                    </Link>
                  ) : null}
                  <span className="hidden text-[11px] font-medium text-emerald-900/70 md:inline">
                    Click to expand
                  </span>
                </div>
              </div>
            </summary>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-emerald-200 text-xs uppercase text-emerald-900/70">
                    <th className="px-3 py-2">Task</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Due</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTasks.map((task) => (
                    <tr key={task._id} className="border-b border-emerald-200/60 last:border-0">
                      <td className="px-3 py-2 align-top">
                        <Link
                          href={`/app/estates/${estateId}/tasks/${task._id}`}
                          className="font-medium text-emerald-900 hover:underline"
                        >
                          {task.title}
                        </Link>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-900">
                          Done
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top">
                        {task.dueDate ? (
                          <span className="text-emerald-900/80">{formatDate(task.dueDate)}</span>
                        ) : (
                          <span className="text-emerald-900/60">No due date</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
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
                      <Link
                        href={`/app/estates/${estateId}/tasks/${task._id}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {task.title}
                      </Link>
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
              {canViewSensitive && (
                <label className="flex items-center gap-1 text-[11px] text-gray-500">
                  <input
                    type="checkbox"
                    name="sensitive"
                    value="1"
                    className="h-3 w-3"
                  />
                  Sensitive only
                </label>
              )}

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
              View all documents
            </Link>
            {canEdit && canViewSensitive && (
              <Link
                href={`/app/estates/${estateId}/documents?newSensitive=1#add-document`}
                className="text-xs font-medium text-rose-600 hover:underline"
              >
                Create sensitive doc
              </Link>
            )}
            {access.role === "VIEWER" && (
              <span className="text-[11px] text-gray-400">
                Create/edit disabled
              </span>
            )}
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
                  <th className="px-3 py-2">File</th>
                  <th className="px-3 py-2 text-right">Link</th>
                </tr>
              </thead>
              <tbody>
                {recentDocuments.map((doc) => (
                  <tr key={doc._id} className="border-b last:border-0">
                    <td className="px-3 py-2 align-top">
                      <Link
                        href={`/app/estates/${estateId}/documents/${doc._id}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {doc.label}
                      </Link>
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
                    <td className="px-3 py-2 align-top">
                      <div className="text-xs text-gray-700">
                        {doc.fileName ?? doc.fileType ?? "—"}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        {formatBytes(doc.fileSizeBytes ?? null)}
                      </div>
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