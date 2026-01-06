import { connectToDatabase } from "@/lib/db";
import { EstateEvent, type EstateEventType } from "@/models/EstateEvent";

function truncateText(value: unknown, max = 180): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  if (!v) return undefined;
  if (v.length <= max) return v;
  return v.slice(0, max).trimEnd() + "…";
}

export type NoteEventAction = "CREATED" | "UPDATED" | "DELETED" | "PINNED" | "UNPINNED";

export type LogNoteEventInput = {
  ownerId: string;
  estateId: string;
  noteId: string;
  action: NoteEventAction;
  bodyPreview?: string | null;
  meta?: Record<string, unknown>;
};

function noteEventType(action: NoteEventAction): EstateEventType {
  switch (action) {
    case "CREATED":
      return "NOTE_CREATED";
    case "UPDATED":
      return "NOTE_UPDATED";
    case "DELETED":
      return "NOTE_DELETED";
    case "PINNED":
      return "NOTE_PINNED";
    case "UNPINNED":
      return "NOTE_UNPINNED";
    default: {
      // Exhaustive check
      const _never: never = action;
      return _never;
    }
  }
}

function noteEventSummary(action: NoteEventAction): string {
  switch (action) {
    case "CREATED":
      return "Note created";
    case "UPDATED":
      return "Note updated";
    case "DELETED":
      return "Note deleted";
    case "PINNED":
      return "Note pinned";
    case "UNPINNED":
      return "Note unpinned";
    default:
      return "Note event";
  }
}

/**
 * Convenience logger for note actions so we keep type/summary/detail consistent.
 * Routes can call this instead of hand-rolling event strings.
 */
export async function logNoteEvent(input: LogNoteEventInput) {
  const { ownerId, estateId, noteId, action, bodyPreview, meta } = input;

  const detail = truncateText(bodyPreview, 220);

  await logEstateEvent({
    ownerId,
    estateId,
    type: noteEventType(action),
    summary: noteEventSummary(action),
    detail,
    meta: {
      noteId,
      ...(meta ?? {}),
    },
  });
}

export type DocumentEventAction = "CREATED" | "UPDATED" | "DELETED";

export type LogDocumentEventInput = {
  ownerId: string;
  estateId: string;
  documentId: string;
  action: DocumentEventAction;
  labelPreview?: string | null;
  meta?: Record<string, unknown>;
};

function documentEventType(action: DocumentEventAction): EstateEventType {
  switch (action) {
    case "CREATED":
      return "DOCUMENT_CREATED";
    case "UPDATED":
      return "DOCUMENT_UPDATED";
    case "DELETED":
      return "DOCUMENT_DELETED";
    default: {
      const _never: never = action;
      return _never;
    }
  }
}

function documentEventSummary(action: DocumentEventAction): string {
  switch (action) {
    case "CREATED":
      return "Document created";
    case "UPDATED":
      return "Document updated";
    case "DELETED":
      return "Document deleted";
    default:
      return "Document event";
  }
}

/**
 * Convenience logger for document actions so we keep type/summary/detail consistent.
 * Routes can call this instead of hand-rolling event strings.
 */
export async function logDocumentEvent(input: LogDocumentEventInput) {
  const { ownerId, estateId, documentId, action, labelPreview, meta } = input;

  const detail = truncateText(labelPreview, 220);

  await logEstateEvent({
    ownerId,
    estateId,
    type: documentEventType(action),
    summary: documentEventSummary(action),
    detail,
    meta: {
      documentId,
      ...(meta ?? {}),
    },
  });
}

export type LegacyEstateEventType = "DOCUMENT_ADDED";

export type LogEstateEventInput = {
  ownerId: string;
  estateId: string;
  type: EstateEventType | LegacyEstateEventType;
  summary: string;
  detail?: string | null;
  meta?: Record<string, unknown>;
};

function normalizeEstateEventType(type: EstateEventType | LegacyEstateEventType): EstateEventType {
  // Back-compat: older routes used DOCUMENT_ADDED, but the canonical type is DOCUMENT_CREATED.
  if (type === "DOCUMENT_ADDED") return "DOCUMENT_CREATED";

  return type;
}

export async function logEstateEvent(input: LogEstateEventInput) {
  const { ownerId, estateId, type, summary, detail, meta } = input;
  const normalizedType = normalizeEstateEventType(type);

  await connectToDatabase();

  const safeSummary = truncateText(summary, 120) ?? "";
  const safeDetail = truncateText(detail, 800);

  await EstateEvent.create({
    ownerId,
    estateId,
    type: normalizedType,
    summary: safeSummary,
    detail: safeDetail ?? undefined,
    meta: meta ?? undefined,
  });
}

export type EstateEventRow = {
  id: string;
  ownerId: string;
  estateId: string;
  type: EstateEventType;
  summary: string;
  detail?: string | null;
  meta?: Record<string, unknown>;
  createdAt?: Date;
};

export type GetEstateEventsOptions = {
  estateId: string;
  ownerId?: string;
  types?: EstateEventType[];
  limit?: number;
  cursor?: string; // createdAt ISO string (exclusive)
};

/**
 * Read helper for activity timelines.
 * - Cursor pagination is based on createdAt (descending)
 */
export async function getEstateEvents(options: GetEstateEventsOptions) {
  const { estateId, ownerId, types, cursor } = options;

  const limitRaw = options.limit ?? 25;
  const limit = Math.max(1, Math.min(100, limitRaw));

  await connectToDatabase();

  const query: Record<string, unknown> = { estateId };

  if (typeof ownerId === "string" && ownerId.trim().length > 0) {
    query.ownerId = ownerId.trim();
  }

  if (Array.isArray(types) && types.length > 0) {
    query.type = { $in: types.map((t) => String(t)) };
  }

  if (typeof cursor === "string" && cursor.trim().length > 0) {
    const dt = new Date(cursor);
    if (!Number.isNaN(dt.getTime())) {
      query.createdAt = { $lt: dt };
    }
  }

  const docs = await EstateEvent.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean()
    .exec();

  const rows: EstateEventRow[] = docs.map((d) => ({
    id: String((d as { _id: unknown })._id),
    ownerId: String((d as { ownerId: unknown }).ownerId),
    estateId: String((d as { estateId: unknown }).estateId),
    type: String((d as { type: unknown }).type) as EstateEventType,
    summary: String((d as { summary: unknown }).summary ?? ""),
    detail: (d as { detail?: string | null }).detail ?? null,
    meta: (d as { meta?: Record<string, unknown> }).meta,
    createdAt: (d as { createdAt?: Date }).createdAt,
  }));

  const nextCursor =
    rows.length > 0 ? rows[rows.length - 1].createdAt?.toISOString() : null;

  return { rows, nextCursor };
}