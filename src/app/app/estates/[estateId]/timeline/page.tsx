import Link from "next/link";
import { redirect } from "next/navigation";
import type { FilterQuery } from "mongoose";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { requireEstateAccess } from "@/lib/estateAccess";

import { Invoice } from "@/models/Invoice";
import { EstateDocument } from "@/models/EstateDocument";
import { EstateTask } from "@/models/EstateTask";
import { EstateNote } from "@/models/EstateNote";

import EstateEvent from "@/models/EstateEvent";
import { EstateActivity } from "@/models/EstateActivity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

  // Consistent server-side formatting (Node) to avoid hydration/locale drift.
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
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

  // Avoid timezone drift by parsing the dateKey as a local date.
  const d = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateKey;

  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    }).format(d);
  } catch {
    return d.toLocaleDateString();
  }
}

function normalizeMoneyToDollars(raw: number | null | undefined): number | null {
  if (raw == null || Number.isNaN(raw)) return null;
  // Current schema tends to store totals as cents.
  // Heuristic: values >= 10,000 are almost certainly cents (>= $100.00).
  if (raw >= 10_000) return raw / 100;
  return raw;
}

function formatCurrencySmart(raw: number | null | undefined): string | null {
  const dollars = normalizeMoneyToDollars(raw);
  if (dollars == null) return null;
  return `$${dollars.toFixed(2)}`;
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

function friendlyKindLabel(kind: string): string {
  switch ((kind || "").toLowerCase()) {
    case "invoice":
      return "Invoice";
    case "document":
      return "Document";
    case "task":
      return "Task";
    case "note":
      return "Note";
    case "activity":
      return "Log";
    case "event":
      return "Event";
    default:
      return titleCaseWord(kind);
  }
}

function friendlyActionLabel(action: string): string {
  const a = (action || "").toLowerCase();
  if (a === "status_changed") return "status changed";
  if (a === "role_changed") return "role changed";
  if (a === "invite_sent") return "invite sent";
  if (a === "invite_revoked") return "invite revoked";
  if (a === "invite_accepted") return "invite accepted";
  if (a === "pinned") return "pinned";
  if (a === "unpinned") return "unpinned";
  if (a === "created") return "created";
  if (a === "updated") return "updated";
  if (a === "deleted") return "deleted";
  return a.replaceAll("_", " ");
}

function buildActivityTitle(kind: string, action: string, fallbackMessage: string): string {
  // Prefer explicit messages when they exist, but avoid the generic placeholder.
  if (fallbackMessage && fallbackMessage.trim() && fallbackMessage !== "Activity") {
    return fallbackMessage.trim();
  }

  const k = friendlyKindLabel(kind);
  const a = friendlyActionLabel(action);

  if (k && a) return `${k} ${a}`;
  if (k) return k;
  return "Activity";
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

  const cursorRaw = Array.isArray(sp.cursor) ? sp.cursor[0] : sp.cursor;
  const beforeRaw = Array.isArray(sp.before) ? sp.before[0] : sp.before; // backward compat
  const limitRaw = Array.isArray(sp.limit) ? sp.limit[0] : sp.limit;

  // Cursor format: `${ISO_TIMESTAMP}|${EVENT_ID}`
  // Timestamp is primary; id is a stable tie-breaker.
  const parseCursor = (raw: unknown): { ts: string; id: string } | null => {
    if (typeof raw !== "string") return null;
    const v = raw.trim();
    if (!v) return null;
    const [ts, id] = v.split("|");
    if (!ts || !id) return null;
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return null;
    return { ts, id };
  };

  const cursor = parseCursor(cursorRaw);
  const cursorDate = cursor ? new Date(cursor.ts) : null;
  const isValidCursor = !!cursorDate && !Number.isNaN(cursorDate.getTime());

  // Backward compatibility: accept ?before=... only when cursor is absent.
  const beforeDate =
    !isValidCursor && typeof beforeRaw === "string" && beforeRaw ? new Date(beforeRaw) : null;
  const isValidBefore =
    !isValidCursor && beforeDate instanceof Date && !Number.isNaN(beforeDate.getTime());

  const parsedLimit = typeof limitRaw === "string" ? Number.parseInt(limitRaw, 10) : NaN;
  const pageSize = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 200) : 75;

  const fetchSize = pageSize + 1;

  const makeCursor = (ts: string, id: string) => `${ts}|${id}`;

  const isBeforeCursor = (ev: { timestamp: string; id: string }): boolean => {
    if (isValidCursor && cursor) {
      if (ev.timestamp < cursor.ts) return true;
      if (ev.timestamp > cursor.ts) return false;
      // same timestamp -> tie-breaker
      return ev.id < cursor.id;
    }

    if (isValidBefore && beforeDate) {
      return Date.parse(ev.timestamp) < beforeDate.getTime();
    }

    return true;
  };

  const session = await auth();
  if (!session?.user?.id) {
    const callbackUrl = encodeURIComponent(`/app/estates/${estateId}/timeline`);
    redirect(`/login?callbackUrl=${callbackUrl}`);
  }

  const access = await requireEstateAccess({ estateId, userId: session.user.id });
  if (!access.hasAccess) {
    redirect("/app/estates");
  }

  const canCreate = access.canEdit;
  const canViewSensitive = access.canViewSensitive;

  await connectToDatabase();

  // Performance: avoid over-fetching across 6 collections when we only display `pageSize` items.
  // - If a specific type is selected, only query the relevant collection.
  // - If viewing ALL, fetch fewer per collection and merge.
  // - Run DB reads in parallel.

  const enabledKinds: TimelineKind[] =
    typeFilter === "ALL"
      ? ["invoice", "document", "task", "note", "event", "activity"]
      : ([typeFilter] as TimelineKind[]);

  // We still fetch `pageSize + 1` overall to determine `hasMore`, but per collection we cap.
  // The ALL view does not need `pageSize+1` from every collection.
  const perCollectionLimit =
    typeFilter === "ALL"
      ? Math.min(fetchSize, Math.max(15, Math.ceil(fetchSize / enabledKinds.length) + 5))
      : fetchSize;

  const shouldFetchInvoices = enabledKinds.includes("invoice");
  const shouldFetchDocuments = enabledKinds.includes("document");
  const shouldFetchTasks = enabledKinds.includes("task");
  const shouldFetchNotes = enabledKinds.includes("note");
  const shouldFetchEvents = enabledKinds.includes("event");
  const shouldFetchActivity = enabledKinds.includes("activity");

  const cutoffDate =
    isValidCursor && cursorDate ? cursorDate : isValidBefore && beforeDate ? beforeDate : null;
  const hasCutoff = !!cutoffDate;

  // Use `$lt` so we don't re-fetch the boundary record when paging.
  // Exact de-duping still happens via the `isBeforeCursor` filter (timestamp + id tie-breaker).
  const invoiceWhere: FilterQuery<Record<string, unknown>> = { estateId };
  if (hasCutoff && cutoffDate) invoiceWhere.createdAt = { $lt: cutoffDate };

  const documentWhere: FilterQuery<Record<string, unknown>> = { estateId };
  if (hasCutoff && cutoffDate) documentWhere.createdAt = { $lt: cutoffDate };
  if (!canViewSensitive) (documentWhere as Record<string, unknown>).isSensitive = false;

  const taskWhere: FilterQuery<Record<string, unknown>> = { estateId };
  if (hasCutoff && cutoffDate) taskWhere.createdAt = { $lt: cutoffDate };

  const noteWhere: FilterQuery<Record<string, unknown>> = { estateId };
  if (hasCutoff && cutoffDate) noteWhere.createdAt = { $lt: cutoffDate };

  const estateEventWhere: FilterQuery<Record<string, unknown>> = { estateId };
  if (hasCutoff && cutoffDate) estateEventWhere.createdAt = { $lt: cutoffDate };

  const estateActivityWhere: FilterQuery<Record<string, unknown>> = { estateId };
  if (hasCutoff && cutoffDate) estateActivityWhere.createdAt = { $lt: cutoffDate };

  const invoicePromise = shouldFetchInvoices
    ? (Invoice.find(
        invoiceWhere,
        { invoiceNumber: 1, status: 1, createdAt: 1, issueDate: 1, subtotal: 1, totalAmount: 1 },
      )
        .sort({ createdAt: -1 })
        .limit(perCollectionLimit)
        .lean()
        .exec() as unknown as Promise<InvoiceLean[]>)
    : (Promise.resolve([]) as Promise<InvoiceLean[]>);

  const documentPromise = shouldFetchDocuments
    ? (EstateDocument.find(documentWhere, { label: 1, subject: 1, createdAt: 1 })
        .sort({ createdAt: -1 })
        .limit(perCollectionLimit)
        .lean()
        .exec() as unknown as Promise<EstateDocumentLean[]>)
    : (Promise.resolve([]) as Promise<EstateDocumentLean[]>);

  const taskPromise = shouldFetchTasks
    ? (EstateTask.find(taskWhere, { title: 1, status: 1, createdAt: 1, dueDate: 1 })
        .sort({ createdAt: -1 })
        .limit(perCollectionLimit)
        .lean()
        .exec() as unknown as Promise<EstateTaskLean[]>)
    : (Promise.resolve([]) as Promise<EstateTaskLean[]>);

  const notePromise = shouldFetchNotes
    ? (EstateNote.find(noteWhere, { body: 1, pinned: 1, createdAt: 1 })
        .sort({ createdAt: -1 })
        .limit(perCollectionLimit)
        .lean()
        .exec() as unknown as Promise<EstateNoteLean[]>)
    : (Promise.resolve([]) as Promise<EstateNoteLean[]>);

  const estateEventPromise = shouldFetchEvents
    ? (EstateEvent.find(
        estateEventWhere,
        { type: 1, summary: 1, detail: 1, meta: 1, createdAt: 1 },
      )
        .sort({ createdAt: -1 })
        .limit(perCollectionLimit)
        .lean()
        .exec() as unknown as Promise<EstateEventLean[]>)
    : (Promise.resolve([]) as Promise<EstateEventLean[]>);

  const estateActivityPromise = shouldFetchActivity
    ? (EstateActivity.find(
        estateActivityWhere,
        { kind: 1, action: 1, entityId: 1, message: 1, snapshot: 1, createdAt: 1 },
      )
        .sort({ createdAt: -1 })
        .limit(perCollectionLimit)
        .lean()
        .exec() as unknown as Promise<EstateActivityLean[]>)
    : (Promise.resolve([]) as Promise<EstateActivityLean[]>);

  const [invoiceDocs, documentDocs, taskDocs, noteDocs, estateEventDocs, estateActivityDocs] =
    await Promise.all([
      invoicePromise,
      documentPromise,
      taskPromise,
      notePromise,
      estateEventPromise,
      estateActivityPromise,
    ]);

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
    const amt = formatCurrencySmart(inv.totalAmount ?? inv.subtotal ?? null);

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
      href: `/app/estates/${estateId}/documents/${String(doc._id)}`,
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
      href: `/app/estates/${estateId}/tasks/${String(t._id)}`,
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
      href: `/app/estates/${estateId}/notes/${String(n._id)}`,
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

    const title = buildActivityTitle(kind, action, message);

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
      detail =
        formatNoteChangeDetail(action, a.snapshot) ??
        (action ? `Note ${friendlyActionLabel(action)}` : "Note activity");
    } else if (kind && action) {
      detail = `${friendlyKindLabel(kind)} · ${friendlyActionLabel(action)}`;
    } else if (kind) {
      detail = friendlyKindLabel(kind);
    }

    let href: string | undefined;
    if (kind === "invoice" && entityId) {
      href = `/app/estates/${estateId}/invoices/${entityId}`;
    } else if (kind === "task" && entityId) {
      href = `/app/estates/${estateId}/tasks/${entityId}`;
    } else if (kind === "task") {
      href = `/app/estates/${estateId}/tasks`;
    } else if (kind === "document" && entityId) {
      href = `/app/estates/${estateId}/documents/${entityId}`;
    } else if (kind === "document") {
      href = `/app/estates/${estateId}/documents`;
    } else if (kind === "note" && entityId) {
      href = `/app/estates/${estateId}/notes/${entityId}`;
    } else if (kind === "note") {
      href = `/app/estates/${estateId}/notes`;
    }

    const cleanedDetail = detail && detail.trim() ? detail : undefined;

    events.push({
      id: `activity-${String(a._id)}`,
      kind: "activity",
      estateId,
      title,
      detail: cleanedDetail,
      timestamp: ts,
      href,
    });
  }

  // Apply cursor/before boundary first, then filter and sort.
  const boundedEvents = events.filter((ev) => isBeforeCursor({ timestamp: ev.timestamp, id: ev.id }));

  // Filter (search + type) first, then sort once.
  const filteredEvents = boundedEvents.filter((ev) => {
    if (typeFilter !== "ALL" && ev.kind !== typeFilter) return false;
    if (!searchQuery) return true;

    const q = searchQuery.toLowerCase();
    return ev.title.toLowerCase().includes(q) || (ev.detail ?? "").toLowerCase().includes(q);
  });

  const hasFilters = !!searchQuery || typeFilter !== "ALL";

  const buildHref = (nextType: string, nextCursorValue?: string | null) => {
    const base = `/app/estates/${estateId}/timeline`;
    const params = new URLSearchParams();

    if (searchQuery) params.set("q", searchQuery);
    if (nextType && nextType !== "ALL") params.set("type", nextType);

    const useCursor =
      nextCursorValue === null
        ? null
        : typeof nextCursorValue === "string"
          ? nextCursorValue
          : isValidCursor && cursor
            ? makeCursor(cursor.ts, cursor.id)
            : null;

    if (useCursor) params.set("cursor", useCursor);
    if (pageSize !== 75) params.set("limit", String(pageSize));

    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  };

  // Sort once for deterministic paging (newest → oldest). `filteredEvents` is already a fresh array.
  filteredEvents.sort((a, b) => {
    if (a.timestamp !== b.timestamp) {
      return a.timestamp < b.timestamp ? 1 : -1;
    }
    // Tie-breaker for deterministic paging
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });

  const hasMore = filteredEvents.length > pageSize;
  const pageEvents = hasMore ? filteredEvents.slice(0, pageSize) : filteredEvents;

  const last = hasMore ? pageEvents[pageEvents.length - 1] : null;
  const nextCursor = last ? makeCursor(last.timestamp, last.id) : null;

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
            {canCreate ? (
              <>
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
              </>
            ) : (
              <Link
                href={`/app/estates/${estateId}?requestAccess=1`}
                className="inline-flex items-center rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
              >
                Request edit access
              </Link>
            )}

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
            <Link
              href={`/app/estates/${estateId}`}
              className="inline-flex items-center rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              Overview
            </Link>
          </div>

          <div className="flex flex-col items-start gap-1 md:items-end">
            <span>
              <span className="font-medium">{hasFilters ? totalFilteredCount : events.length}</span> event
              {(hasFilters ? totalFilteredCount : events.length) === 1 ? "" : "s"}
              {hasFilters && !hasCutoff && (
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
          {/* Preserve paging + page size when searching/filtering */}
          {isValidCursor && cursor ? (
            <input type="hidden" name="cursor" value={makeCursor(cursor.ts, cursor.id)} />
          ) : null}
          {pageSize !== 75 ? <input type="hidden" name="limit" value={String(pageSize)} /> : null}

          <div className="flex flex-1 items-center gap-2">
            <label htmlFor="q" className="whitespace-nowrap text-[11px] text-gray-500">
              Search
            </label>
            <input
              id="q"
              name="q"
              type="search"
              autoComplete="off"
              aria-label="Search timeline"
              defaultValue={searchQuery}
              placeholder="Search titles and details…"
              className="h-7 w-full rounded-md border border-gray-300 px-2 text-xs text-gray-900 placeholder:text-gray-400"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 md:w-auto md:flex-nowrap">
            <label htmlFor="type" className="whitespace-nowrap text-[11px] text-gray-500">
              Type
            </label>
            <select
              id="type"
              name="type"
              aria-label="Filter by type"
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

            <button
              type="submit"
              className="inline-flex h-7 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-[11px] font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              Search
            </button>

            {hasFilters ? (
              <Link
                href={buildHref(typeFilter, isValidCursor && cursor ? makeCursor(cursor.ts, cursor.id) : null)}
                className="inline-flex h-7 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-[11px] font-medium text-gray-700 shadow-sm hover:bg-gray-50"
              >
                Clear
              </Link>
            ) : null}
          </div>
        </form>

        {hasFilters && (
          <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-gray-600">
            <span className="text-gray-400">Active:</span>

            {searchQuery ? (
              <Link
                href={(() => {
                  const base = buildHref(typeFilter, isValidCursor && cursor ? makeCursor(cursor.ts, cursor.id) : undefined);
                  const url = new URL(base, "http://localhost");
                  url.searchParams.delete("q");
                  const qs = url.searchParams.toString();
                  return qs ? `${url.pathname}?${qs}` : url.pathname;
                })()}
                className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-gray-700 hover:bg-gray-100"
                title="Clear search"
              >
                <span className="text-gray-500">Search</span>
                <span className="font-medium">{truncate(searchQuery, 28)}</span>
                <span className="text-gray-400">×</span>
              </Link>
            ) : null}

            {typeFilter !== "ALL" ? (
              <Link
                href={(() => {
                  const base = buildHref("ALL", isValidCursor && cursor ? makeCursor(cursor.ts, cursor.id) : undefined);
                  const url = new URL(base, "http://localhost");
                  // buildHref("ALL", ...) already omits type; ensure it stays omitted
                  const qs = url.searchParams.toString();
                  return qs ? `${url.pathname}?${qs}` : url.pathname;
                })()}
                className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-gray-700 hover:bg-gray-100"
                title="Clear type"
              >
                <span className="text-gray-500">Type</span>
                <span className="font-medium">{friendlyKindLabel(typeFilter)}</span>
                <span className="text-gray-400">×</span>
              </Link>
            ) : null}

            {hasCutoff && cutoffDate ? (
              <Link
                href={buildHref(typeFilter, null)}
                className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-gray-700 hover:bg-gray-100"
                title="Back to newest"
              >
                <span className="text-gray-500">Before</span>
                <span className="font-medium">{formatDateTime(cutoffDate.toISOString())}</span>
                <span className="text-gray-400">×</span>
              </Link>
            ) : null}

            <Link
              href={`/app/estates/${estateId}/timeline`}
              className="ml-1 text-[11px] font-medium text-blue-700 hover:underline"
            >
              Clear all
            </Link>
          </div>
        )}
      </section>

      <section className="space-y-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        {events.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-gray-500">No activity yet. As you work, entries will appear here.</p>
            <p className="text-xs text-gray-400">
              Tip: create a task, invoice, note, or upload a document—then come back to see it grouped here by day.
            </p>
          </div>
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
                {hasCutoff && cutoffDate && (
                  <>
                    <span className="text-gray-400">•</span>
                    <span>
                      Older than <span className="font-medium text-gray-900">{formatDateTime(cutoffDate.toISOString())}</span>
                    </span>
                  </>
                )}
              </div>

              {hasCutoff && (
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
                      <li
                        key={ev.id}
                        className={
                          (isGrouped ? "mb-3" : "mb-6") +
                          " ml-1 last:mb-0 rounded-md px-2 py-1 -mx-2 transition-colors " +
                          (ev.href ? "hover:bg-gray-50" : "")
                        }
                      >
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

            {hasMore && nextCursor && (
              <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
                <Link
                  href={buildHref(typeFilter, nextCursor)}
                  className="inline-flex items-center rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                >
                  Load older
                </Link>

                {hasCutoff ? (
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