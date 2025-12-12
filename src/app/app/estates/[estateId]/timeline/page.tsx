import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";

import { Invoice } from "@/models/Invoice";
import { EstateDocument } from "@/models/EstateDocument";
import { EstateTask } from "@/models/EstateTask";
import { EstateNote } from "@/models/EstateNote";

import { EstateEvent } from "@/models/EstateEvent";
import { EstateActivity } from "@/models/EstateActivity";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ estateId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type TimelineKind = "invoice" | "document" | "task" | "note" | "event" | "activity";

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

// Lean-ish types (loose on purpose)
type InvoiceLean = {
  _id: unknown;
  invoiceNumber?: string | null;
  status?: string | null;
  createdAt?: Date | string | null;
  issueDate?: Date | string | null;
  totalAmount?: number | null;
  subtotal?: number | null;
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

type EstateEventLean = {
  _id: unknown;
  type?: string | null;
  summary?: string | null;
  detail?: string | null;
  createdAt?: Date | string | null;
  meta?: Record<string, unknown> | null;
};

type EstateActivityLean = {
  _id: unknown;
  kind?: string | null; // "invoice" | ...
  action?: string | null; // "status_changed" | ...
  entityId?: string | null;
  message?: string | null;
  snapshot?: Record<string, unknown> | null;
  createdAt?: Date | string | null;
};

function toISO(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString();
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function truncate(text: string, max = 160) {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "…";
}

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getDayLabelFromKey(dateKey: string, todayKey: string, yesterdayKey: string): string {
  if (dateKey === todayKey) return "Today";
  if (dateKey === yesterdayKey) return "Yesterday";
  const d = new Date(dateKey);
  if (Number.isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString();
}

function formatCurrencyFromCents(cents: number | null | undefined): string | null {
  if (cents == null || Number.isNaN(cents)) return null;
  return `$${(cents / 100).toFixed(2)}`;
}

function friendlyInvoiceStatus(status: string | null | undefined): string {
  switch ((status ?? "").toUpperCase()) {
    case "PAID":
      return "Paid";
    case "SENT":
      return "Sent";
    case "VOID":
      return "Void";
    case "DRAFT":
      return "Draft";
    default:
      return status ? status : "Unknown";
  }
}

export default async function EstateTimelinePage({ params, searchParams }: PageProps) {
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
      normalized === "note" ||
      normalized === "event" ||
      normalized === "activity"
    ) {
      typeFilter = normalized as TimelineKind;
    } else {
      typeFilter = "ALL";
    }
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/app/estates/${estateId}/timeline`);
  }

  await connectToDatabase();

  // Base entities
  const invoiceDocs = (await Invoice.find(
    { estateId, ownerId: session.user.id },
    { invoiceNumber: 1, status: 1, createdAt: 1, issueDate: 1, subtotal: 1, totalAmount: 1 },
  ).lean()) as InvoiceLean[];

  const documentDocs = (await EstateDocument.find(
    { estateId, ownerId: session.user.id },
    { label: 1, subject: 1, createdAt: 1 },
  ).lean()) as EstateDocumentLean[];

  const taskDocs = (await EstateTask.find(
    { estateId, ownerId: session.user.id },
    { title: 1, status: 1, createdAt: 1, dueDate: 1 },
  ).lean()) as EstateTaskLean[];

  const noteDocs = (await EstateNote.find(
    { estateId, ownerId: session.user.id },
    { body: 1, pinned: 1, createdAt: 1 },
  ).lean()) as EstateNoteLean[];

  // Legacy estate events (what logEstateEvent writes)
  const estateEventDocs = (await EstateEvent.find(
    { estateId, ownerId: session.user.id },
    { type: 1, summary: 1, detail: 1, meta: 1, createdAt: 1 },
  )
    .sort({ createdAt: -1 })
    .lean()) as EstateEventLean[];

  // New activity events (what logActivity writes)
  const estateActivityDocs = (await EstateActivity.find(
    { estateId, ownerId: session.user.id },
    { kind: 1, action: 1, entityId: 1, message: 1, snapshot: 1, createdAt: 1 },
  )
    .sort({ createdAt: -1 })
    .lean()) as EstateActivityLean[];

  const events: TimelineEvent[] = [];

  // Invoices → timeline
  for (const inv of invoiceDocs) {
    const ts = toISO(inv.createdAt) ?? toISO(inv.issueDate);
    if (!ts) continue;

    const invoiceNumberLabel =
      typeof inv.invoiceNumber === "string" && inv.invoiceNumber.trim()
        ? inv.invoiceNumber.trim()
        : String(inv._id).slice(-6);

    const statusLabel = friendlyInvoiceStatus(inv.status ?? "DRAFT");
    const amt = formatCurrencyFromCents(inv.totalAmount ?? inv.subtotal ?? null);

    events.push({
      id: `invoice-${String(inv._id)}`,
      kind: "invoice",
      estateId,
      title: `Invoice ${invoiceNumberLabel}`,
      detail: [amt, statusLabel].filter(Boolean).join(" · "),
      timestamp: ts,
      href: `/app/estates/${estateId}/invoices/${String(inv._id)}`,
    });
  }

  // Documents → timeline
  for (const doc of documentDocs) {
    const ts = toISO(doc.createdAt);
    if (!ts) continue;

    const label =
      typeof doc.label === "string" && doc.label.trim() ? doc.label.trim() : "Document";
    const subject =
      typeof doc.subject === "string" && doc.subject.trim() ? doc.subject.trim() : "";

    events.push({
      id: `doc-${String(doc._id)}`,
      kind: "document",
      estateId,
      title: label,
      detail: subject ? `Document · ${subject}` : "Document added",
      timestamp: ts,
      href: `/app/estates/${estateId}/documents`,
    });
  }

  // Tasks → timeline
  for (const t of taskDocs) {
    const ts = toISO(t.createdAt);
    if (!ts) continue;

    const title = typeof t.title === "string" && t.title.trim() ? t.title.trim() : "Task";
    const status = typeof t.status === "string" ? t.status : "";
    const due = toISO(t.dueDate);
    const dueLabel = due ? `Due ${new Date(due).toLocaleDateString()}` : "";

    events.push({
      id: `task-${String(t._id)}`,
      kind: "task",
      estateId,
      title,
      detail: ["Task", status && `Status: ${status}`, dueLabel].filter(Boolean).join(" · "),
      timestamp: ts,
      href: `/app/estates/${estateId}/tasks`,
    });
  }

  // Notes → timeline
  for (const n of noteDocs) {
    const ts = toISO(n.createdAt);
    if (!ts) continue;

    const body = typeof n.body === "string" ? n.body.trim() : "";
    if (!body) continue;

    events.push({
      id: `note-${String(n._id)}`,
      kind: "note",
      estateId,
      title: n.pinned ? "Pinned note" : "Note",
      detail: truncate(body, 180),
      timestamp: ts,
      href: `/app/estates/${estateId}/notes`,
    });
  }

  // Legacy EstateEvent → timeline
  for (const ev of estateEventDocs) {
    const ts = toISO(ev.createdAt);
    if (!ts) continue;

    const summary = typeof ev.summary === "string" && ev.summary.trim() ? ev.summary.trim() : "Event";
    const detail = typeof ev.detail === "string" ? ev.detail.trim() : "";

    // If it’s invoice-related, try to link to invoice detail via meta.invoiceId
    const metaInvoiceId = ev.meta && typeof ev.meta.invoiceId === "string" ? ev.meta.invoiceId : null;
    const href =
      metaInvoiceId && metaInvoiceId !== "undefined"
        ? `/app/estates/${estateId}/invoices/${metaInvoiceId}`
        : undefined;

    events.push({
      id: `event-${String(ev._id)}`,
      kind: "event",
      estateId,
      title: summary,
      detail,
      timestamp: ts,
      href,
    });
  }

  // EstateActivity → timeline (this is the “enriched” path)
  for (const a of estateActivityDocs) {
    const ts = toISO(a.createdAt);
    if (!ts) continue;

    const message = typeof a.message === "string" && a.message.trim() ? a.message.trim() : "Activity";
    const detailParts: string[] = [];

    const kind = typeof a.kind === "string" ? a.kind : "";
    const action = typeof a.action === "string" ? a.action : "";

    if (kind) detailParts.push(kind);
    if (action) detailParts.push(action);

    const detail = detailParts.length ? detailParts.join(" · ") : undefined;

    // Link to entity when possible (only invoices for now)
    const entityId = typeof a.entityId === "string" ? a.entityId : null;
    const href =
      kind === "invoice" && entityId
        ? `/app/estates/${estateId}/invoices/${entityId}`
        : undefined;

    events.push({
      id: `activity-${String(a._id)}`,
      kind: "activity",
      estateId,
      title: message,
      detail,
      timestamp: ts,
      href,
    });
  }

  // Sort newest → oldest
  const sortedEvents = [...events].sort((a, b) => {
    const at = new Date(a.timestamp).getTime();
    const bt = new Date(b.timestamp).getTime();
    return bt - at;
  });

  // Filters
  const filteredEvents = sortedEvents.filter((ev) => {
    if (typeFilter !== "ALL" && ev.kind !== typeFilter) return false;
    if (!searchQuery) return true;

    const q = searchQuery.toLowerCase();
    return (
      ev.title.toLowerCase().includes(q) ||
      (ev.detail ?? "").toLowerCase().includes(q)
    );
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

  for (const ev of filteredEvents) {
    const d = new Date(ev.timestamp);
    if (Number.isNaN(d.getTime())) continue;

    const dateKey = toDateKey(d);

    if (!currentGroup || currentGroup.dateKey !== dateKey) {
      currentGroup = {
        dateKey,
        label: getDayLabelFromKey(dateKey, todayKey, yesterdayKey),
        events: [],
      };
      dayGroups.push(currentGroup);
    }

    currentGroup.events.push(ev);
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <nav className="text-xs text-gray-500">
            <Link href="/app/estates" className="hover:underline">
              Estates
            </Link>
            <span className="mx-1 text-gray-400">/</span>
            <Link href={`/app/estates/${estateId}`} className="hover:underline">
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
              A day-grouped view of what happened in this estate—now including
              explicit activity events like invoice status changes.
            </p>
          </div>
        </div>

        <div className="mt-1 flex flex-col items-end gap-1 text-xs text-gray-500">
          <span>
            <span className="font-medium">{events.length}</span> event
            {events.length === 1 ? "" : "s"}
          </span>
          <span className="text-[11px] text-gray-400">
            Includes invoices, documents, tasks, notes, and activity logs.
          </span>
        </div>
      </div>

      {/* Filters */}
      <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <form method="GET" className="flex flex-col gap-2 text-xs md:flex-row md:items-center md:justify-between">
          <div className="flex flex-1 items-center gap-2">
            <label htmlFor="q" className="whitespace-nowrap text-[11px] text-gray-500">
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
            <label htmlFor="type" className="whitespace-nowrap text-[11px] text-gray-500">
              Type
            </label>
            <select
              id="type"
              name="type"
              defaultValue={typeFilter}
              className="h-7 rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-900"
            >
              <option value="ALL">All</option>
              <option value="activity">Activity</option>
              <option value="event">Events</option>
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

      {/* Timeline */}
      <section className="space-y-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        {events.length === 0 ? (
          <p className="text-sm text-gray-500">
            No activity yet. As you work, entries will appear here.
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
                  {group.events.map((ev) => {
                    const isLatest = ev.id === latestEventId;

                    let badgeLabel = "Event";
                    let badgeClass = "bg-gray-100 text-gray-800 border border-gray-200";

                    if (ev.kind === "activity") {
                      badgeLabel = "Activity";
                      badgeClass = "bg-slate-100 text-slate-800 border border-slate-200";
                    } else if (ev.kind === "invoice") {
                      badgeLabel = "Invoice";
                      badgeClass = "bg-blue-100 text-blue-800 border border-blue-200";
                    } else if (ev.kind === "document") {
                      badgeLabel = "Document";
                      badgeClass = "bg-purple-100 text-purple-800 border border-purple-200";
                    } else if (ev.kind === "task") {
                      badgeLabel = "Task";
                      badgeClass = "bg-emerald-100 text-emerald-800 border border-emerald-200";
                    } else if (ev.kind === "note") {
                      badgeLabel = "Note";
                      badgeClass = "bg-yellow-100 text-yellow-800 border border-yellow-200";
                    } else if (ev.kind === "event") {
                      badgeLabel = "Event";
                      badgeClass = "bg-gray-100 text-gray-800 border border-gray-200";
                    }

                    return (
                      <li key={ev.id} className="mb-6 ml-1 last:mb-0">
                        <span className="absolute -left-[7px] mt-1.5 h-3.5 w-3.5 rounded-full border border-white bg-gray-300 shadow-sm" />

                        <div className="flex flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeClass}`}>
                              {badgeLabel}
                              {isLatest && (
                                <span className="ml-1 text-[10px] font-normal text-gray-600">
                                  Latest
                                </span>
                              )}
                            </span>
                            <span className="text-[11px] text-gray-500">
                              {formatDateTime(ev.timestamp)}
                            </span>
                          </div>

                          <div className="text-sm font-medium text-gray-900">
                            {ev.href ? (
                              <Link href={ev.href} className="text-blue-700 hover:underline">
                                {ev.title}
                              </Link>
                            ) : (
                              ev.title
                            )}
                          </div>

                          {ev.detail && (
                            <p className="text-sm text-gray-600">
                              {truncate(ev.detail, 220)}
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