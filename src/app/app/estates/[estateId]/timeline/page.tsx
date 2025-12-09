import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Invoice } from "@/models/Invoice";
import { EstateDocument } from "@/models/EstateDocument";
import { EstateTask } from "@/models/EstateTask";
import { EstateNote } from "@/models/EstateNote";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    estateId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type InvoiceLean = {
  _id: unknown;
  description?: string | null;
  status?: string | null;
  issueDate?: Date | string | null;
  createdAt?: Date | string | null;
  subtotal?: number | null;
  totalAmount?: number | null;
};

type EstateDocumentLean = {
  _id: unknown;
  label?: string | null;
  subject?: string | null;
  createdAt?: Date | string | null;
};

type EstateTaskLean = {
  _id: unknown;
  title?: string | null;
  status?: string | null;
  createdAt?: Date | string | null;
  dueDate?: Date | string | null;
};

type EstateNoteLean = {
  _id: unknown;
  body?: string | null;
  pinned?: boolean | null;
  createdAt?: Date | string | null;
};

type TimelineKind = "invoice" | "document" | "task" | "note";

type TimelineEvent = {
  id: string;
  kind: TimelineKind;
  estateId: string;
  title: string;
  detail?: string;
  timestamp: string; // ISO
  href?: string;
};

type TimelineDayGroup = {
  dateKey: string; // YYYY-MM-DD
  label: string;
  events: TimelineEvent[];
};

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString();
}

function truncate(text: string, max = 120): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "…";
}

function formatCurrencyFromCents(
  cents: number | null | undefined,
): string | null {
  if (cents == null || Number.isNaN(cents)) return null;
  const dollars = cents / 100;
  return `$${dollars.toFixed(2)}`;
}

function toDateKey(date: Date): string {
  // YYYY-MM-DD in local time
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDayLabelFromKey(dateKey: string, todayKey: string, yesterdayKey: string): string {
  if (dateKey === todayKey) return "Today";
  if (dateKey === yesterdayKey) return "Yesterday";

  // Fallback: parse dateKey back into Date for display
  const d = new Date(dateKey);
  if (Number.isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString();
}

export default async function EstateTimelinePage({
  params,
  searchParams,
}: PageProps) {
  const { estateId } = await params;

  let searchQuery = "";
  let typeFilter: TimelineKind | "ALL" = "ALL";

  if (searchParams) {
    const sp = await searchParams;

    const qRaw = sp.q;
    searchQuery =
      typeof qRaw === "string"
        ? qRaw.trim()
        : Array.isArray(qRaw)
        ? (qRaw[0] ?? "").trim()
        : "";

    const typeRaw = sp.type;
    const typeValue =
      typeof typeRaw === "string"
        ? typeRaw
        : Array.isArray(typeRaw)
        ? typeRaw[0]
        : "";

    const normalized = typeValue.toLowerCase();
    if (
      normalized === "invoice" ||
      normalized === "document" ||
      normalized === "task" ||
      normalized === "note"
    ) {
      typeFilter = normalized;
    } else {
      typeFilter = "ALL";
    }
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/app/estates/${estateId}/timeline`);
  }

  await connectToDatabase();

  const invoiceDocs = (await Invoice.find(
    { estateId, ownerId: session.user.id },
    {
      description: 1,
      status: 1,
      issueDate: 1,
      createdAt: 1,
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
      createdAt: 1,
    },
  )
    .lean()
    .exec()) as EstateDocumentLean[];

  const taskDocs = (await EstateTask.find(
    { estateId, ownerId: session.user.id },
    {
      title: 1,
      status: 1,
      createdAt: 1,
      dueDate: 1,
    },
  )
    .lean()
    .exec()) as EstateTaskLean[];

  const noteDocs = (await EstateNote.find(
    { estateId, ownerId: session.user.id },
    {
      body: 1,
      pinned: 1,
      createdAt: 1,
    },
  )
    .lean()
    .exec()) as EstateNoteLean[];

  const events: TimelineEvent[] = [];

  // Invoices → events
  for (const doc of invoiceDocs) {
    const created =
      doc.createdAt instanceof Date
        ? doc.createdAt.toISOString()
        : (doc.createdAt as string | null | undefined) ?? null;

    const issue =
      doc.issueDate instanceof Date
        ? doc.issueDate.toISOString()
        : (doc.issueDate as string | null | undefined) ?? null;

    const timestamp = created ?? issue;
    if (!timestamp) continue;

    const amountLabel =
      formatCurrencyFromCents(doc.totalAmount ?? doc.subtotal ?? null) ?? "";

    const statusRaw =
      typeof doc.status === "string" ? doc.status.toUpperCase() : "DRAFT";

    const statusLabel =
      statusRaw === "PAID"
        ? "Paid"
        : statusRaw === "SENT"
        ? "Sent"
        : statusRaw === "UNPAID"
        ? "Unpaid"
        : statusRaw === "PARTIAL"
        ? "Partial"
        : statusRaw === "VOID"
        ? "Void"
        : "Draft";

    const description =
      typeof doc.description === "string" && doc.description.trim().length > 0
        ? doc.description.trim()
        : "Invoice";

    events.push({
      id: `invoice-${String(doc._id)}`,
      kind: "invoice",
      estateId,
      title: description,
      detail: [amountLabel, statusLabel].filter(Boolean).join(" · "),
      timestamp,
      href: `/app/estates/${estateId}/invoices/${String(doc._id)}`,
    });
  }

  // Documents → events
  for (const doc of documentDocs) {
    const created =
      doc.createdAt instanceof Date
        ? doc.createdAt.toISOString()
        : (doc.createdAt as string | null | undefined) ?? null;

    if (!created) continue;

    const label =
      typeof doc.label === "string" && doc.label.trim().length > 0
        ? doc.label.trim()
        : "Document";

    const subject =
      typeof doc.subject === "string" && doc.subject.trim().length > 0
        ? doc.subject.trim()
        : "";

    events.push({
      id: `doc-${String(doc._id)}`,
      kind: "document",
      estateId,
      title: label,
      detail: subject ? `Document · ${subject}` : "Document added",
      timestamp: created,
      href: `/app/estates/${estateId}/documents`,
    });
  }

  // Tasks → events
  for (const doc of taskDocs) {
    const created =
      doc.createdAt instanceof Date
        ? doc.createdAt.toISOString()
        : (doc.createdAt as string | null | undefined) ?? null;

    if (!created) continue;

    const title =
      typeof doc.title === "string" && doc.title.trim().length > 0
        ? doc.title.trim()
        : "Task";

    const statusRaw =
      typeof doc.status === "string" ? doc.status.toUpperCase() : "NOT_STARTED";

    const statusLabel =
      statusRaw === "IN_PROGRESS"
        ? "In progress"
        : statusRaw === "DONE"
        ? "Done"
        : "Not started";

    const due =
      doc.dueDate instanceof Date
        ? doc.dueDate.toISOString()
        : (doc.dueDate as string | null | undefined) ?? null;

    const dueLabel = due ? `Due ${formatDate(due)}` : "";

    const detailPieces = [statusLabel, dueLabel].filter(Boolean);

    events.push({
      id: `task-${String(doc._id)}`,
      kind: "task",
      estateId,
      title,
      detail:
        detailPieces.length > 0
          ? `Task · ${detailPieces.join(" · ")}`
          : "Task",
      timestamp: created,
      href: `/app/estates/${estateId}/tasks`,
    });
  }

  // Notes → events
  for (const doc of noteDocs) {
    const created =
      doc.createdAt instanceof Date
        ? doc.createdAt.toISOString()
        : (doc.createdAt as string | null | undefined) ?? null;

    if (!created) continue;

    const rawBody =
      typeof doc.body === "string" && doc.body.trim().length > 0
        ? doc.body.trim()
        : "";

    if (!rawBody) continue;

    const summary = truncate(rawBody, 160);
    const pinned = Boolean(doc.pinned);

    events.push({
      id: `note-${String(doc._id)}`,
      kind: "note",
      estateId,
      title: pinned ? "Pinned note" : "Note",
      detail: summary,
      timestamp: created,
      href: `/app/estates/${estateId}/notes`,
    });
  }

  // Sort newest → oldest
  const sortedEvents = [...events].sort((a, b) => {
    const aTime = new Date(a.timestamp).getTime();
    const bTime = new Date(b.timestamp).getTime();
    return bTime - aTime;
  });

  // Apply filters
  const filteredEvents = sortedEvents.filter((event) => {
    if (typeFilter !== "ALL" && event.kind !== typeFilter) {
      return false;
    }

    if (!searchQuery) return true;

    const q = searchQuery.toLowerCase();
    const inTitle = event.title.toLowerCase().includes(q);
    const inDetail = (event.detail ?? "").toLowerCase().includes(q);

    return inTitle || inDetail;
  });

  const hasFilters = !!searchQuery || typeFilter !== "ALL";

  // Day grouping
  const today = new Date();
  const todayKey = toDateKey(today);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = toDateKey(yesterday);

  const latestEventId = filteredEvents[0]?.id;

  const dayGroups: TimelineDayGroup[] = [];
  let currentGroup: TimelineDayGroup | null = null;

  for (const event of filteredEvents) {
    const eventDate = new Date(event.timestamp);
    if (Number.isNaN(eventDate.getTime())) {
      continue;
    }
    const dateKey = toDateKey(eventDate);

    if (!currentGroup || currentGroup.dateKey !== dateKey) {
      // Start a new group
      const label = getDayLabelFromKey(dateKey, todayKey, yesterdayKey);
      currentGroup = {
        dateKey,
        label,
        events: [],
      };
      dayGroups.push(currentGroup);
    }

    currentGroup.events.push(event);
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header / breadcrumb */}
      <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <nav className="text-xs text-gray-500">
            <Link href="/app/estates" className="hover:underline">
              Estates
            </Link>
            <span className="mx-1 text-gray-400">/</span>
            <Link
              href={`/app/estates/${estateId}`}
              className="hover:underline"
            >
              Overview
            </Link>
            <span className="mx-1 text-gray-400">/</span>
            <span className="text-gray-900">Timeline</span>
          </nav>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-900">
              Activity timeline
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-gray-600">
              See the story of this estate—when invoices were created, documents
              uploaded, tasks added, and notes captured—all in one chronological
              view.
            </p>
          </div>
        </div>

        <div className="mt-1 flex flex-col items-end gap-1 text-xs text-gray-500">
          <span>
            <span className="font-medium">{events.length}</span> event
            {events.length === 1 ? "" : "s"}
          </span>
          <span className="text-[11px] text-gray-400">
            Grouped by day so you can see what happened when.
          </span>
        </div>
      </div>

      {/* Filters */}
      <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <form
          method="GET"
          className="flex flex-col gap-2 text-xs md:flex-row md:items-center md:justify-between"
        >
          <div className="flex flex-1 items-center gap-2">
            <label
              htmlFor="q"
              className="whitespace-nowrap text-[11px] text-gray-500"
            >
              Search
            </label>
            <input
              id="q"
              name="q"
              defaultValue={searchQuery}
              placeholder="Search titles and details…"
              className="h-7 w-full rounded-md border border-gray-300 px-2 text-xs text-gray-900 placeholder:text-gray-400"
            />
          </div>

          <div className="flex items-center gap-2 md:w-auto">
            <label
              htmlFor="type"
              className="whitespace-nowrap text-[11px] text-gray-500"
            >
              Type
            </label>
            <select
              id="type"
              name="type"
              defaultValue={typeFilter}
              className="h-7 rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-900"
            >
              <option value="ALL">All</option>
              <option value="invoice">Invoices</option>
              <option value="document">Documents</option>
              <option value="task">Tasks</option>
              <option value="note">Notes</option>
            </select>

            {hasFilters && (
              <a
                href={`/app/estates/${estateId}/timeline`}
                className="whitespace-nowrap text-[11px] text-gray-500 hover:text-gray-800"
              >
                Clear filters
              </a>
            )}
          </div>
        </form>
      </section>

      {/* Timeline list with day groups */}
      <section className="space-y-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        {events.length === 0 ? (
          <p className="text-sm text-gray-500">
            No activity yet. As you create invoices, upload documents, add
            tasks, and write notes, they&apos;ll appear here in order.
          </p>
        ) : filteredEvents.length === 0 ? (
          <p className="text-sm text-gray-500">
            No events match this search or type filter.
          </p>
        ) : (
          <div className="space-y-6">
            {dayGroups.map((group) => (
              <div key={group.dateKey}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {group.label}
                </h3>
                <ol className="relative border-l border-gray-200 pl-4 text-sm">
                  {group.events.map((event) => {
                    const isLatest = event.id === latestEventId;

                    let badgeLabel = "";
                    let badgeClass =
                      "bg-gray-100 text-gray-800 border border-gray-200";

                    if (event.kind === "invoice") {
                      badgeLabel = "Invoice";
                      badgeClass =
                        "bg-blue-100 text-blue-800 border border-blue-200";
                    } else if (event.kind === "document") {
                      badgeLabel = "Document";
                      badgeClass =
                        "bg-purple-100 text-purple-800 border border-purple-200";
                    } else if (event.kind === "task") {
                      badgeLabel = "Task";
                      badgeClass =
                        "bg-emerald-100 text-emerald-800 border border-emerald-200";
                    } else if (event.kind === "note") {
                      badgeLabel = "Note";
                      badgeClass =
                        "bg-yellow-100 text-yellow-800 border border-yellow-200";
                    }

                    return (
                      <li key={event.id} className="mb-6 ml-1 last:mb-0">
                        {/* Dot */}
                        <span className="absolute -left-[7px] mt-1.5 h-3.5 w-3.5 rounded-full border border-white bg-gray-300 shadow-sm" />

                        <div className="flex flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeClass}`}
                            >
                              {badgeLabel}
                              {isLatest && (
                                <span className="ml-1 text-[10px] font-normal text-gray-600">
                                  Latest
                                </span>
                              )}
                            </span>
                            <span className="text-[11px] text-gray-500">
                              {formatDateTime(event.timestamp)}
                            </span>
                          </div>

                          <div className="text-sm font-medium text-gray-900">
                            {event.href ? (
                              <Link
                                href={event.href}
                                className="text-blue-700 hover:underline"
                              >
                                {event.title}
                              </Link>
                            ) : (
                              event.title
                            )}
                          </div>

                          {event.detail && (
                            <p className="text-sm text-gray-600">
                              {event.kind === "note"
                                ? event.detail
                                : truncate(event.detail, 200)}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}