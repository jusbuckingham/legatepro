import Link from "next/link";
import { redirect } from "next/navigation";
import type { FilterQuery } from "mongoose";

import { requireViewer } from "@/lib/estateAccess";

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
  tags?: string[];
  subtype?: string;
  meta?: Record<string, unknown> | null;
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

function kindIcon(kind: TimelineKind): string {
  switch (kind) {
    case "invoice":
      return "💵";
    case "document":
      return "📄";
    case "task":
      return "✅";
    case "note":
      return "📝";
    case "activity":
      return "📌";
    case "event":
    default:
      return "•";
  }
}

function titleCaseWord(s: string): string {
  if (!s) return s;
  return s.slice(0, 1).toUpperCase() + s.slice(1);
}

function safeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length ? t : null;
}

function formatStatusChangeDetail(snapshot?: Record<string, unknown> | null): string | null {
  if (!snapshot) return null;
  const prev = safeString(snapshot.previousStatusLabel) ?? safeString(snapshot.previousStatus);
  const next = safeString(snapshot.newStatusLabel) ?? safeString(snapshot.newStatus);
  if (!prev && !next) return null;
  return `Status changed: ${prev ?? "Unknown"} → ${next ?? "Unknown"}`;
}

function formatTaskChangeDetail(snapshot?: Record<string, unknown> | null): string | null {
  if (!snapshot) return null;
  const prevStatus = safeString(snapshot.previousStatus);
  const nextStatus = safeString(snapshot.newStatus);
  if (prevStatus || nextStatus) {
    return `Status changed: ${prevStatus ?? "Unknown"} → ${nextStatus ?? "Unknown"}`;
  }
  const prevTitle = safeString(snapshot.previousTitle);
  const nextTitle = safeString(snapshot.newTitle);
  if (prevTitle || nextTitle) {
    if (prevTitle && nextTitle && prevTitle !== nextTitle) {
      return `Title changed: ${prevTitle} → ${nextTitle}`;
    }
  }
  return null;
}

function formatDocumentChangeDetail(
  action: string,
  snapshot?: Record<string, unknown> | null,
): string | null {
  if (action === "created") {
    const subject = safeString(snapshot?.subject);
    const isSensitive = typeof snapshot?.isSensitive === "boolean" ? snapshot.isSensitive : null;
    const bits: string[] = [];
    if (subject) bits.push(`Subject: ${subject}`);
    if (isSensitive === true) bits.push("Sensitive");
    return bits.length ? bits.join(" · ") : "Document created";
  }

  if (action === "deleted") {
    const subject = safeString(snapshot?.subject);
    const isSensitive = typeof snapshot?.isSensitive === "boolean" ? snapshot.isSensitive : null;
    const bits: string[] = [];
    if (subject) bits.push(`Subject: ${subject}`);
    if (isSensitive === true) bits.push("Sensitive");
    return bits.length ? bits.join(" · ") : "Document deleted";
  }

  const prev = (snapshot?.previous as Record<string, unknown> | undefined) ?? null;
  const cur = (snapshot?.current as Record<string, unknown> | undefined) ?? null;

  const prevLabel = safeString(prev?.label);
  const curLabel = safeString(cur?.label);
  const prevSubject = safeString(prev?.subject);
  const curSubject = safeString(cur?.subject);

  const prevSensitive = typeof prev?.isSensitive === "boolean" ? prev.isSensitive : null;
  const curSensitive = typeof cur?.isSensitive === "boolean" ? cur.isSensitive : null;

  const parts: string[] = [];

  if (prevLabel && curLabel && prevLabel !== curLabel) {
    parts.push(`Label: ${prevLabel} → ${curLabel}`);
  }

  if (prevSubject && curSubject && prevSubject !== curSubject) {
    parts.push(`Subject: ${prevSubject} → ${curSubject}`);
  } else if (!prevSubject && curSubject) {
    parts.push(`Subject: ${curSubject}`);
  }

  if (prevSensitive !== null && curSensitive !== null && prevSensitive !== curSensitive) {
    parts.push(curSensitive ? "Marked sensitive" : "Unmarked sensitive");
  } else if (curSensitive === true) {
    parts.push("Sensitive");
  }

  return parts.length ? parts.join(" · ") : "Document updated";
}

function formatNoteChangeDetail(
  action: string,
  snapshot?: Record<string, unknown> | null,
): string | null {
  if (action === "created") {
    const category = safeString(snapshot?.category);
    const pinned = typeof snapshot?.pinned === "boolean" ? snapshot.pinned : null;
    const parts: string[] = [];
    if (category) parts.push(`Category: ${category}`);
    if (pinned === true) parts.push("Pinned");
    return parts.length ? parts.join(" · ") : "Note created";
  }

  if (action === "deleted") {
    const category = safeString(snapshot?.category);
    const pinned = typeof snapshot?.pinned === "boolean" ? snapshot.pinned : null;
    const parts: string[] = [];
    if (category) parts.push(`Category: ${category}`);
    if (pinned === true) parts.push("Pinned");
    return parts.length ? parts.join(" · ") : "Note deleted";
  }

  if (action === "pinned") return "Pinned";
  if (action === "unpinned") return "Unpinned";

  const prevPinned = typeof snapshot?.previousPinned === "boolean" ? snapshot.previousPinned : null;
  const nextPinned = typeof snapshot?.newPinned === "boolean" ? snapshot.newPinned : null;

  const prevCat = safeString(snapshot?.previousCategory);
  const nextCat = safeString(snapshot?.newCategory);

  const parts: string[] = [];

  if (prevCat && nextCat && prevCat !== nextCat) {
    parts.push(`Category: ${prevCat} → ${nextCat}`);
  } else if (!prevCat && nextCat) {
    parts.push(`Category: ${nextCat}`);
  }

  if (prevPinned !== null && nextPinned !== null && prevPinned !== nextPinned) {
    parts.push(nextPinned ? "Pinned" : "Unpinned");
  } else if (nextPinned === true) {
    parts.push("Pinned");
  }

  const prevBody = safeString(snapshot?.previousBodyPreview);
  const nextBody = safeString(snapshot?.newBodyPreview);
  if (prevBody && nextBody && prevBody !== nextBody) {
    parts.push("Body updated");
  } else if (!prevBody && nextBody) {
    parts.push("Body added");
  }

  return parts.length ? parts.join(" · ") : "Note updated";
}

function formatCollaboratorEvent(
  type: string | null | undefined,
  meta?: Record<string, unknown> | null,
  fallbackDetail?: string,
): { title: string; detail?: string } | null {
  const t = (type ?? "").toUpperCase();

  if (
    t !== "COLLABORATOR_ADDED" &&
    t !== "COLLABORATOR_ROLE_CHANGED" &&
    t !== "COLLABORATOR_REMOVED" &&
    t !== "COLLABORATOR_INVITE_SENT" &&
    t !== "COLLABORATOR_INVITE_REVOKED" &&
    t !== "COLLABORATOR_INVITE_ACCEPTED"
  ) {
    return null;
  }

  const userId = safeString(meta?.userId) ?? safeString(meta?.collaboratorId);
  const email = safeString(meta?.email) ?? safeString(meta?.collaboratorEmail);
  const role = safeString(meta?.role);
  const prevRole = safeString(meta?.previousRole);

  if (t === "COLLABORATOR_ADDED") {
    const title = email && role ? `Invite accepted (${role})` : "Collaborator added";
    return {
      title,
      detail:
        [email ? email : null, userId ? `User: ${userId}` : null, !email && role ? `Role: ${role}` : null]
          .filter(Boolean)
          .join(" · ") ||
        fallbackDetail ||
        title,
    };
  }

  if (t === "COLLABORATOR_ROLE_CHANGED") {
    const roleChange = prevRole || role ? `${prevRole ?? "Unknown"} → ${role ?? "Unknown"}` : null;
    const title = prevRole && role ? `Invite role updated (${roleChange})` : "Collaborator role changed";
    return {
      title,
      detail:
        [email ? email : null, userId ? `User: ${userId}` : null, roleChange ? `Role: ${roleChange}` : null]
          .filter(Boolean)
          .join(" · ") ||
        fallbackDetail ||
        title,
    };
  }

  if (t === "COLLABORATOR_INVITE_SENT") {
    const title = "Invite sent";
    return {
      title,
      detail:
        [email ? email : null, role ? `Role: ${role}` : null].filter(Boolean).join(" · ") ||
        fallbackDetail ||
        "Invite link created",
    };
  }

  if (t === "COLLABORATOR_INVITE_REVOKED") {
    const title = "Invite revoked";
    return {
      title,
      detail:
        [email ? email : null, role ? `Role: ${role}` : null].filter(Boolean).join(" · ") ||
        fallbackDetail ||
        "Invite revoked",
    };
  }

  if (t === "COLLABORATOR_INVITE_ACCEPTED") {
    const title = role ? `Invite accepted (${role})` : "Invite accepted";
    return {
      title,
      detail:
        [email ? email : null, userId ? `User: ${userId}` : null].filter(Boolean).join(" · ") ||
        fallbackDetail ||
        title,
    };
  }

  return {
    title: "Collaborator removed",
    detail:
      [userId ? `User: ${userId}` : null, prevRole ? `Role: ${prevRole}` : null].filter(Boolean).join(" · ") ||
      fallbackDetail ||
      "Collaborator removed",
  };
}

export default async function EstateTimelinePage({ params, searchParams }: PageProps) {
  const { estateId } = await params;

  let searchQuery = "";
  let typeFilter: TimelineKind | "ALL" = "ALL";

  const sp: Record<string, string | string[] | undefined> = searchParams ? await searchParams : {};

  if (searchParams) {
    const qRaw = sp.q;
    searchQuery =
      typeof qRaw === "string"
        ? qRaw.trim()
        : Array.isArray(qRaw)
          ? (qRaw[0] ?? "").trim()
          : "";

    const typeRaw = sp.type;
    const typeValue = typeof typeRaw === "string" ? typeRaw : Array.isArray(typeRaw) ? typeRaw[0] : "";

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

  const beforeRaw = Array.isArray(sp.before) ? sp.before[0] : sp.before;
  const limitRaw = Array.isArray(sp.limit) ? sp.limit[0] : sp.limit;

  const beforeDate = typeof beforeRaw === "string" && beforeRaw ? new Date(beforeRaw) : null;
  const isValidBefore = beforeDate instanceof Date && !Number.isNaN(beforeDate.getTime());

  const parsedLimit = typeof limitRaw === "string" ? Number.parseInt(limitRaw, 10) : NaN;
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 200) : 75;

  const pageSize = limit;
  const fetchSize = pageSize + 1;

  const accessResult = await requireViewer({ estateId });

  // `requireViewer` returns an access payload on success, and (depending on implementation)
  // either a `Response`/`NextResponse` or an object containing one on failure.
  const deniedResponse: Response | null =
    accessResult instanceof Response
      ? accessResult
      : (accessResult as unknown as { response?: unknown; res?: unknown })?.response instanceof Response
        ? ((accessResult as unknown as { response: Response }).response)
        : (accessResult as unknown as { res?: unknown })?.res instanceof Response
          ? ((accessResult as unknown as { res: Response }).res)
          : null;

  if (deniedResponse) {
    return redirect(`/login?callbackUrl=/app/estates/${estateId}/timeline`);
  }

  const invoiceWhere: FilterQuery<Record<string, unknown>> = { estateId };
  if (isValidBefore) invoiceWhere.createdAt = { $lt: beforeDate };

  const invoiceDocs = (await Invoice.find(
    invoiceWhere,
    { invoiceNumber: 1, status: 1, createdAt: 1, issueDate: 1, subtotal: 1, totalAmount: 1 },
  )
    .sort({ createdAt: -1 })
    .limit(fetchSize)
    .lean()) as InvoiceLean[];

  const documentWhere: FilterQuery<Record<string, unknown>> = { estateId };
  if (isValidBefore) documentWhere.createdAt = { $lt: beforeDate };

  const documentDocs = (await EstateDocument.find(documentWhere, { label: 1, subject: 1, createdAt: 1 })
    .sort({ createdAt: -1 })
    .limit(fetchSize)
    .lean()) as EstateDocumentLean[];

  const taskWhere: FilterQuery<Record<string, unknown>> = { estateId };
  if (isValidBefore) taskWhere.createdAt = { $lt: beforeDate };

  const taskDocs = (await EstateTask.find(taskWhere, { title: 1, status: 1, createdAt: 1, dueDate: 1 })
    .sort({ createdAt: -1 })
    .limit(fetchSize)
    .lean()) as EstateTaskLean[];

  const noteWhere: FilterQuery<Record<string, unknown>> = { estateId };
  if (isValidBefore) noteWhere.createdAt = { $lt: beforeDate };

  const noteDocs = (await EstateNote.find(noteWhere, { body: 1, pinned: 1, createdAt: 1 })
    .sort({ createdAt: -1 })
    .limit(fetchSize)
    .lean()) as EstateNoteLean[];

  const estateEventWhere: FilterQuery<Record<string, unknown>> = { estateId };
  if (isValidBefore) estateEventWhere.createdAt = { $lt: beforeDate };

  const estateEventDocs = (await EstateEvent.find(
    estateEventWhere,
    { type: 1, summary: 1, detail: 1, meta: 1, createdAt: 1 },
  )
    .sort({ createdAt: -1 })
    .limit(fetchSize)
    .lean()) as EstateEventLean[];

  const estateActivityWhere: FilterQuery<Record<string, unknown>> = { estateId };
  if (isValidBefore) estateActivityWhere.createdAt = { $lt: beforeDate };

  const estateActivityDocs = (await EstateActivity.find(
    estateActivityWhere,
    { kind: 1, action: 1, entityId: 1, message: 1, snapshot: 1, createdAt: 1 },
  )
    .sort({ createdAt: -1 })
    .limit(fetchSize)
    .lean()) as EstateActivityLean[];

  const events: TimelineEvent[] = [];

  const invoiceStatusActivityIds = new Set<string>();
  for (const a of estateActivityDocs) {
    const kindRaw = typeof a.kind === "string" ? a.kind : "";
    const actionRaw = typeof a.action === "string" ? a.action : "";

    const kind = kindRaw.toLowerCase();
    const action = actionRaw.toLowerCase();

    const entityId = typeof a.entityId === "string" ? a.entityId : null;
    if (kind === "invoice" && action === "status_changed" && entityId) {
      invoiceStatusActivityIds.add(entityId);
    }
  }

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

  for (const doc of documentDocs) {
    const ts = toISO(doc.createdAt);
    if (!ts) continue;

    const label = typeof doc.label === "string" && doc.label.trim() ? doc.label.trim() : "Document";
    const subject = typeof doc.subject === "string" && doc.subject.trim() ? doc.subject.trim() : "";

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

  for (const ev of estateEventDocs) {
    const ts = toISO(ev.createdAt);
    if (!ts) continue;

    const summary = typeof ev.summary === "string" && ev.summary.trim() ? ev.summary.trim() : "Event";
    const detailRaw = typeof ev.detail === "string" ? ev.detail.trim() : "";

    const metaInvoiceId = ev.meta && typeof ev.meta.invoiceId === "string" ? ev.meta.invoiceId : null;

    const collaboratorFmt = formatCollaboratorEvent(ev.type, ev.meta, detailRaw);
    const collaboratorIsInvite =
      ev.type === "COLLABORATOR_INVITE_SENT" ||
      ev.type === "COLLABORATOR_INVITE_REVOKED" ||
      ev.type === "COLLABORATOR_INVITE_ACCEPTED" ||
      !!(ev.meta && (typeof ev.meta.email === "string" || typeof ev.meta.collaboratorEmail === "string"));

    const href = collaboratorFmt
      ? `/app/estates/${estateId}/collaborators`
      : metaInvoiceId && metaInvoiceId !== "undefined"
        ? `/app/estates/${estateId}/invoices/${metaInvoiceId}`
        : undefined;

    const title = collaboratorFmt ? collaboratorFmt.title : summary;
    const detail = collaboratorFmt ? (collaboratorFmt.detail ?? "") : detailRaw;

    if ((ev.type === "INVOICE_STATUS_CHANGED" || ev.type === "invoice.status_changed") && metaInvoiceId) {
      if (invoiceStatusActivityIds.has(metaInvoiceId)) {
        continue;
      }
    }

    events.push({
      id: `event-${String(ev._id)}`,
      kind: "event",
      estateId,
      title,
      detail,
      timestamp: ts,
      href,
      tags: collaboratorFmt && collaboratorIsInvite ? ["Invite"] : undefined,
      subtype: typeof ev.type === "string" ? ev.type : undefined,
      meta: ev.meta ?? null,
    });
  }

  for (const a of estateActivityDocs) {
    const ts = toISO(a.createdAt);
    if (!ts) continue;

    const message = typeof a.message === "string" && a.message.trim() ? a.message.trim() : "Activity";

    const kindRaw = typeof a.kind === "string" ? a.kind : "";
    const actionRaw = typeof a.action === "string" ? a.action : "";
    const kind = kindRaw.toLowerCase();
    const action = actionRaw.toLowerCase();

    const entityId = typeof a.entityId === "string" ? a.entityId : null;

    const defaultTitle = kind && action ? `${titleCaseWord(kind)} ${action.replaceAll("_", " ")}` : "Activity";
    const title = message === "Activity" ? defaultTitle : message;

    let detail: string | undefined;
    if (kind === "invoice" && action === "status_changed") {
      detail = formatStatusChangeDetail(a.snapshot) ?? "Invoice status changed";
    } else if (kind === "task" && action === "status_changed") {
      detail = formatTaskChangeDetail(a.snapshot) ?? "Task status changed";
    } else if (kind === "task" && action === "updated") {
      detail = formatTaskChangeDetail(a.snapshot) ?? "Task updated";
    } else if (kind === "task" && action === "created") {
      detail = "Task created";
    } else if (kind === "task" && action === "deleted") {
      detail = "Task deleted";
    } else if (kind === "document" && (action === "created" || action === "updated" || action === "deleted")) {
      detail = formatDocumentChangeDetail(action, a.snapshot) ?? `Document ${action}`;
    } else if (kind === "note") {
      detail = formatNoteChangeDetail(action, a.snapshot) ?? (action ? `Note ${action}` : "Note activity");
    } else if (kind && action) {
      detail = `${kind} · ${action}`;
    } else if (kind) {
      detail = kind;
    }

    let href: string | undefined;
    if (kind === "invoice" && entityId) {
      href = `/app/estates/${estateId}/invoices/${entityId}`;
    } else if (kind === "task") {
      href = `/app/estates/${estateId}/tasks`;
    } else if (kind === "document") {
      href = `/app/estates/${estateId}/documents`;
    } else if (kind === "note") {
      href = `/app/estates/${estateId}/notes`;
    }

    events.push({
      id: `activity-${String(a._id)}`,
      kind: "activity",
      estateId,
      title,
      detail,
      timestamp: ts,
      href,
    });
  }

  const sortedEvents = [...events].sort((a, b) => {
    const at = new Date(a.timestamp).getTime();
    const bt = new Date(b.timestamp).getTime();
    return bt - at;
  });

  const filteredEvents = sortedEvents.filter((ev) => {
    if (typeFilter !== "ALL" && ev.kind !== typeFilter) return false;
    if (!searchQuery) return true;

    const q = searchQuery.toLowerCase();
    return ev.title.toLowerCase().includes(q) || (ev.detail ?? "").toLowerCase().includes(q);
  });

  const hasFilters = !!searchQuery || typeFilter !== "ALL";

  const buildHref = (nextType: string, nextBefore?: string | null) => {
    const base = `/app/estates/${estateId}/timeline`;
    const params = new URLSearchParams();

    if (searchQuery) params.set("q", searchQuery);
    if (nextType && nextType !== "ALL") params.set("type", nextType);

    const useBefore =
      nextBefore === null
        ? null
        : typeof nextBefore === "string"
          ? nextBefore
          : isValidBefore && beforeDate
            ? beforeDate.toISOString()
            : null;

    if (useBefore) params.set("before", useBefore);
    if (pageSize !== 75) params.set("limit", String(pageSize));

    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  };

  const sortedForPaging = [...filteredEvents].sort((a, b) => {
    const at = new Date(a.timestamp).getTime();
    const bt = new Date(b.timestamp).getTime();
    return bt - at;
  });

  const hasMore = sortedForPaging.length > pageSize;
  const pageEvents = hasMore ? sortedForPaging.slice(0, pageSize) : sortedForPaging;
  const nextBefore = hasMore ? pageEvents[pageEvents.length - 1]?.timestamp : null;

  const totalFilteredCount = filteredEvents.length;
  const pageCount = pageEvents.length;

  const today = new Date();
  const todayKey = toDateKey(today);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = toDateKey(yesterday);

  const latestEventId = pageEvents[0]?.id;

  const dayGroups: TimelineDayGroup[] = [];
  let currentGroup: TimelineDayGroup | null = null;

  for (const ev of pageEvents) {
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
    <div className="mx-auto max-w-5xl space-y-6 p-6">
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
            <h1 className="text-xl font-semibold tracking-tight text-gray-900">Activity timeline</h1>
            <p className="mt-1 max-w-2xl text-sm text-gray-600">
              A day-grouped view of what happened in this estate—now including explicit activity events like invoice status changes.
            </p>
          </div>
        </div>

        <div className="mt-1 flex flex-col items-start gap-2 text-xs text-gray-500 md:items-end">
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            <Link
              href={`/app/estates/${estateId}/tasks/new`}
              className="inline-flex items-center rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              + New task
            </Link>
            <Link
              href={`/app/estates/${estateId}/invoices/new`}
              className="inline-flex items-center rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              + New invoice
            </Link>
            <Link
              href={`/app/estates/${estateId}/documents`}
              className="inline-flex items-center rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              Documents
            </Link>
            <Link
              href={`/app/estates/${estateId}/notes`}
              className="inline-flex items-center rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              Notes
            </Link>
          </div>

          <div className="flex flex-col items-start gap-1 md:items-end">
            <span>
              <span className="font-medium">{hasFilters ? totalFilteredCount : events.length}</span> event
              {(hasFilters ? totalFilteredCount : events.length) === 1 ? "" : "s"}
              {hasFilters && !isValidBefore && (
                <span className="ml-1 text-[11px] text-gray-400">(of {events.length})</span>
              )}
            </span>
            <span className="text-[11px] text-gray-400">Includes invoices, documents, tasks, notes, and activity logs.</span>
          </div>
        </div>
      </div>

      <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { key: "ALL", label: "All" },
            { key: "invoice", label: "Invoices" },
            { key: "task", label: "Tasks" },
            { key: "document", label: "Documents" },
            { key: "note", label: "Notes" },
            { key: "activity", label: "Activity" },
            { key: "event", label: "Legacy events" },
          ].map((opt) => {
            const isActive = typeFilter === opt.key;
            return (
              <Link
                key={opt.key}
                href={buildHref(opt.key)}
                className={
                  "inline-flex items-center rounded-full border px-3 py-1 text-xs " +
                  (isActive ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50")
                }
              >
                {opt.label}
              </Link>
            );
          })}
          <span className="ml-1 text-xs text-gray-500">
            {pageCount} shown{hasMore ? ` of ${totalFilteredCount}` : ""}
          </span>
          {(typeFilter === "invoice" || typeFilter === "task" || typeFilter === "document" || typeFilter === "note") && (
            <Link href={buildHref("ALL")} className="ml-1 text-xs text-gray-500 hover:text-gray-800">
              Clear type
            </Link>
          )}
        </div>

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
            <select id="type" name="type" defaultValue={typeFilter} className="h-7 rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-900">
              <option value="ALL">All</option>
              <option value="activity">Activity</option>
              <option value="event">Events</option>
              <option value="invoice">Invoices</option>
              <option value="document">Documents</option>
              <option value="task">Tasks</option>
              <option value="note">Notes</option>
            </select>

            {hasFilters && (
              <Link
                href={`/app/estates/${estateId}/timeline`}
                className="whitespace-nowrap text-[11px] text-gray-500 hover:text-gray-800"
              >
                Clear filters
              </Link>
            )}
          </div>
        </form>
      </section>

      <section className="space-y-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        {events.length === 0 ? (
          <p className="text-sm text-gray-500">No activity yet. As you work, entries will appear here.</p>
        ) : filteredEvents.length === 0 ? (
          <p className="text-sm text-gray-500">No events match this search or type filter.</p>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col gap-2 rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-600 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>
                  Showing <span className="font-medium text-gray-900">{pageCount}</span>
                  {pageCount === 1 ? " event" : " events"}
                  {hasMore ? (
                    <span className="ml-1 text-gray-400">(of {totalFilteredCount})</span>
                  ) : null}
                </span>
                <span className="text-gray-400">•</span>
                <span>
                  Page size: <span className="font-medium text-gray-900">{pageSize}</span>
                </span>
                {isValidBefore && beforeDate && (
                  <>
                    <span className="text-gray-400">•</span>
                    <span>
                      Older than <span className="font-medium text-gray-900">{beforeDate.toLocaleString()}</span>
                    </span>
                  </>
                )}
              </div>

              {isValidBefore && (
                <div className="flex items-center gap-3">
                  <Link href={buildHref(typeFilter, null)} className="text-xs font-medium text-blue-700 hover:underline">
                    Back to newest
                  </Link>
                </div>
              )}
            </div>

            {dayGroups.map((group) => (
              <div key={group.dateKey}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {group.label}{" "}
                  <span className="text-[11px] font-normal text-gray-400">({group.events.length})</span>
                </h3>

                <ol className="relative border-l border-gray-200 pl-4 text-sm">
                  {group.events.map((ev, idx) => {
                    const prev = idx > 0 ? group.events[idx - 1] : null;
                    const isGrouped = !!prev && prev.kind === ev.kind && !!prev.href && !!ev.href && prev.href === ev.href;

                    const isLatest = ev.id === latestEventId;

                    let badgeLabel = "Event";
                    let badgeClass = "bg-gray-100 text-gray-800 border border-gray-200";

                    if (ev.kind === "activity") {
                      badgeLabel = "Log";
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
                      badgeLabel = "Legacy";
                      badgeClass = "bg-gray-100 text-gray-800 border border-gray-200";
                    }

                    return (
                      <li key={ev.id} className={(isGrouped ? "mb-3" : "mb-6") + " ml-1 last:mb-0"}>
                        <span
                          className={
                            "absolute -left-[7px] mt-1.5 h-3.5 w-3.5 rounded-full border border-white shadow-sm " +
                            (isGrouped ? "bg-gray-200 opacity-60" : "bg-gray-300")
                          }
                        />

                        <div className="flex flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeClass}`}>
                              <span aria-hidden className="text-[12px]">
                                {kindIcon(ev.kind)}
                              </span>
                              <span>{badgeLabel}</span>
                              {isLatest && (
                                <span className="ml-1 text-[10px] font-normal text-gray-600">Latest</span>
                              )}
                            </span>

                            {ev.tags?.includes("Invite") ? (
                              <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                                Invite
                              </span>
                            ) : null}

                            <span className="text-[11px] text-gray-500">{formatDateTime(ev.timestamp)}</span>
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
                            <p className="text-sm text-gray-600">{truncate(ev.detail, 220)}</p>
                          )}

                          {ev.kind === "event" &&
                          (ev.subtype ?? "").toUpperCase() === "COLLABORATOR_INVITE_SENT" &&
                          ev.meta &&
                          typeof ev.meta.inviteUrl === "string" &&
                          ev.meta.inviteUrl.trim() ? (
                            <div className="mt-1 flex flex-col gap-1">
                              <div className="text-[11px] font-medium text-gray-500">Invite link</div>
                              <input
                                readOnly
                                value={ev.meta.inviteUrl}
                                onFocus={(e) => e.currentTarget.select()}
                                className="h-8 w-full rounded-md border border-gray-200 bg-gray-50 px-2 text-xs text-gray-700"
                              />
                              <div className="text-[11px] text-gray-400">Tip: click the field, then ⌘C / Ctrl+C</div>
                            </div>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}

            {hasMore && nextBefore && (
              <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
                <Link
                  href={buildHref(typeFilter, nextBefore)}
                  className="inline-flex items-center rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                >
                  Load older
                </Link>

                {isValidBefore ? (
                  <Link href={buildHref(typeFilter, null)} className="text-sm font-medium text-blue-700 hover:underline">
                    Back to newest
                  </Link>
                ) : (
                  <span className="text-sm font-medium text-gray-400">Newest</span>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}