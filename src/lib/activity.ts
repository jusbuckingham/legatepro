// src/lib/activity.ts
import mongoose, { Model, Types } from "mongoose";

import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";

/**
 * Activity model registration
 *
 * We register the Activity schema here to eliminate the runtime "model is not registered" crash.
 * If a model named `Activity` is already registered elsewhere, we reuse it.
 */

export interface ActivityDocument {
  estateId: Types.ObjectId;
  kind: string;
  action: string;
  message: string;
  entityId?: Types.ObjectId;
  entityType?: string;
  href?: string;
  sublabel?: string;
  snapshot?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

type ActivityModel = Model<ActivityDocument>;

function registerActivityModel(): ActivityModel {
  const existing = mongoose.models.Activity as Model<ActivityDocument> | undefined;
  if (existing) return existing;

  const ActivitySchema = new mongoose.Schema<ActivityDocument>(
    {
      estateId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Estate",
        required: true,
        index: true,
      },
      kind: { type: String, required: true, default: "OTHER", index: true },
      action: { type: String, required: true, default: "UNKNOWN" },
      message: { type: String, required: true, default: "" },

      entityId: {
        type: mongoose.Schema.Types.ObjectId,
        required: false,
        index: true,
      },
      entityType: { type: String, required: false, index: true },

      // Optional fields that some pages may add for nicer UI
      href: { type: String, required: false },
      sublabel: { type: String, required: false },

      snapshot: { type: mongoose.Schema.Types.Mixed, required: false, default: null },
    },
    {
      timestamps: true,
      minimize: true,
    }
  );

  ActivitySchema.index({ estateId: 1, createdAt: -1, _id: -1 });

  return mongoose.model<ActivityDocument>("Activity", ActivitySchema);
}

function getActivityModel(): ActivityModel {
  // Ensure a stable model exists (registered here or elsewhere).
  return registerActivityModel();
}

export type ActivityTone = "rose" | "emerald" | "amber" | "slate";

export type ActivityKind =
  | "TASK"
  | "INVOICE"
  | "EXPENSE"
  | "RENT"
  | "NOTE"
  | "DOCUMENT"
  | "CONTACT"
  | "COLLAB"
  | "ESTATE"
  | "OTHER";

function normalizeKind(kind: string, action: string, entityType?: string): ActivityKind {
  const k = (kind ?? "").toLowerCase();
  const a = (action ?? "").toLowerCase();
  const e = (entityType ?? "").toLowerCase();

  // Prefer explicit entityType when present
  if (e.includes("task")) return "TASK";
  if (e.includes("invoice")) return "INVOICE";
  if (e.includes("expense")) return "EXPENSE";
  if (e.includes("rent")) return "RENT";
  if (e.includes("note")) return "NOTE";
  if (e.includes("document") || e.includes("doc")) return "DOCUMENT";
  if (e.includes("contact")) return "CONTACT";
  if (
    e.includes("collab") ||
    e.includes("invite") ||
    e.includes("collaborator")
  )
    return "COLLAB";

  // Otherwise infer from kind/action
  if (k.includes("task") || a.includes("task")) return "TASK";
  if (k.includes("invoice") || a.includes("invoice")) return "INVOICE";
  if (k.includes("expense") || a.includes("expense")) return "EXPENSE";
  if (k.includes("rent") || a.includes("rent")) return "RENT";
  if (k.includes("note") || a.includes("note")) return "NOTE";
  if (k.includes("document") || a.includes("document") || k.includes("doc") || a.includes("doc")) return "DOCUMENT";
  if (k.includes("contact") || a.includes("contact")) return "CONTACT";
  if (k.includes("collab") || a.includes("invite") || a.includes("collaborator")) return "COLLAB";
  if (k.includes("estate") || a.includes("estate")) return "ESTATE";

  return "OTHER";
}

export interface ActivityItem {
  id: string;
  at: Date;
  label: string;
  sublabel?: string;
  href?: string;
  tone: ActivityTone;
  badge?: string;
}

export interface ActivityCursor {
  at: string; // ISO string
  id: string; // activity id
}

export interface FetchActivityResult {
  items: ActivityItem[];
  nextCursor?: string; // base64 cursor
}

export interface FetchActivityInput {
  userId: string;
  limit?: number; // default 25
  cursor?: string; // base64 cursor from previous page
  estateId?: string; // if present, fetch for a single estate
}

/** Minimal shape from Activity model (lean) */
interface ActivityLean {
  _id: Types.ObjectId;
  estateId: Types.ObjectId | string;
  kind: string;
  action: string;
  message: string;
  entityId?: Types.ObjectId | string;
  entityType?: string;
  href?: string;
  sublabel?: string;
  createdAt: Date;
  snapshot?: Record<string, unknown> | null;
}

/** Decode base64 cursor safely */
function decodeCursor(cursor?: string): ActivityCursor | null {
  if (!cursor) return null;
  try {
    const json = Buffer.from(cursor, "base64").toString("utf8");
    const parsed = JSON.parse(json) as Partial<ActivityCursor>;
    if (!parsed.at || !parsed.id) return null;
    return { at: String(parsed.at), id: String(parsed.id) };
  } catch {
    return null;
  }
}

/** Encode cursor as base64 */
function encodeCursor(cur: ActivityCursor): string {
  return Buffer.from(JSON.stringify(cur), "utf8").toString("base64");
}

function isValidObjectId(id: string): boolean {
  return Types.ObjectId.isValid(id);
}

function toObjectId(id: string): Types.ObjectId {
  // Keep strict for required ids, but validate so we fail fast with a clearer error.
  if (!isValidObjectId(id)) {
    throw new Error(`Invalid ObjectId: ${id}`);
  }
  return new Types.ObjectId(id);
}

function maybeObjectId(id?: string): Types.ObjectId | undefined {
  if (!id) return undefined;
  return isValidObjectId(id) ? new Types.ObjectId(id) : undefined;
}

function asIdString(id: Types.ObjectId | string | undefined): string | undefined {
  if (!id) return undefined;
  return typeof id === "string" ? id : id.toString();
}

function mapTone(kind: string, action: string, entityType?: string): ActivityTone {
  const normalized = normalizeKind(kind, action, entityType);

  switch (normalized) {
    case "INVOICE":
    case "EXPENSE":
    case "RENT":
      return "amber";
    case "DOCUMENT":
      return "emerald";
    case "TASK":
    case "COLLAB":
      return "rose";
    case "NOTE":
    case "CONTACT":
    case "ESTATE":
    case "OTHER":
    default:
      return "slate";
  }
}

function buildHref(estateId: string, doc: ActivityLean): string | undefined {
  const entityId = asIdString(doc.entityId);
  const kind = normalizeKind(doc.kind, doc.action, doc.entityType);

  if (typeof doc.href === "string" && doc.href.trim()) {
    return doc.href;
  }

  // Adjust these to match your app routes.
  if (kind === "DOCUMENT" && entityId) {
    return `/app/estates/${estateId}/documents/${entityId}`;
  }
  if (kind === "NOTE" && entityId) {
    return `/app/estates/${estateId}/notes?focus=${entityId}`;
  }
  if (kind === "TASK" && entityId) {
    return `/app/estates/${estateId}/tasks?focus=${entityId}`;
  }
  if (kind === "INVOICE" && entityId) {
    return `/app/estates/${estateId}/invoices?focus=${entityId}`;
  }
  if (kind === "CONTACT" && entityId) {
    return `/app/contacts/${entityId}`;
  }

  // Default: estate overview
  return `/app/estates/${estateId}`;
}

function toActivityItem(doc: ActivityLean): ActivityItem {
  const estateIdStr =
    typeof doc.estateId === "string" ? doc.estateId : doc.estateId.toString();

  const label = doc.message?.trim()
    ? doc.message.trim()
    : `${doc.kind}: ${doc.action}`;

  const kind = normalizeKind(doc.kind, doc.action, doc.entityType);

  // Badge: prefer the normalized kind, otherwise fall back to action.
  const badge = kind !== "OTHER" ? kind : doc.action ? doc.action.replace(/_/g, " ") : undefined;

  return {
    id: doc._id.toString(),
    at: doc.createdAt,
    label,
    sublabel: doc.sublabel ? doc.sublabel : doc.entityType ? doc.entityType : undefined,
    href: buildHref(estateIdStr, doc),
    tone: mapTone(doc.kind, doc.action, doc.entityType),
    badge,
  };
}

/**
 * Fetch activity for:
 * - a specific estate (if estateId provided), OR
 * - all estates the user has access to (global feed)
 *
 * Returns cursor-based pagination: newest first.
 */
export async function fetchActivityFeed(
  input: FetchActivityInput,
): Promise<FetchActivityResult> {
  const limit = Math.max(1, Math.min(input.limit ?? 25, 100));
  const cursor = decodeCursor(input.cursor);

  await connectToDatabase();

  // Determine estate scope
  let estateIds: Types.ObjectId[] = [];

  if (input.estateId) {
    // Defensive: if an invalid id is passed, return empty rather than crashing the dashboard.
    const parsed = maybeObjectId(input.estateId);
    if (!parsed) return { items: [] };
    estateIds = [parsed];
  } else {
    // Global feed: estates user owns OR is a collaborator on
    const estates = await Estate.find(
      {
        $or: [
          { ownerId: input.userId },
          { "collaborators.userId": input.userId },
        ],
      },
      { _id: 1 }
    )
      .lean<{ _id: Types.ObjectId }[]>()
      .exec();

    estateIds = estates.map((e) => e._id);
  }

  if (estateIds.length === 0) {
    return { items: [] };
  }

  // Cursor pagination:
  // fetch items with (createdAt < cursor.at) OR (createdAt == cursor.at AND _id < cursor.id)
  const cursorFilter =
    cursor?.at && cursor?.id
      ? {
          $or: [
            { createdAt: { $lt: new Date(cursor.at) } },
            {
              createdAt: new Date(cursor.at),
              _id: { $lt: toObjectId(cursor.id) },
            },
          ],
        }
      : {};

  const Activity = getActivityModel();

  const docs = await Activity.find(
    {
      estateId: { $in: estateIds },
      ...cursorFilter,
    },
    {}
  )
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean<ActivityLean[]>()
    .exec();

  const hasMore = docs.length > limit;
  const page = hasMore ? docs.slice(0, limit) : docs;

  const items = page.map(toActivityItem);

  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({ at: last.createdAt.toISOString(), id: last._id.toString() })
      : undefined;

  return { items, nextCursor };
}

export type { FetchActivityInput as ListActivityInput };

export async function listGlobalActivity(args: { ownerId: string; limit?: number; cursor?: string }) {
  return fetchActivityFeed({
    userId: args.ownerId,
    limit: args.limit,
    cursor: args.cursor,
  });
}

export async function listEstateActivity(args: {
  ownerId: string;
  estateId: string;
  limit?: number;
  cursor?: string;
}) {
  return fetchActivityFeed({
    userId: args.ownerId,
    estateId: args.estateId,
    limit: args.limit,
    cursor: args.cursor,
  });
}

// -----------------------------------------------------------------------------
// Back-compat exports (older routes/pages may import these names)
// -----------------------------------------------------------------------------

// Some callers historically used `getGlobalActivity` / `fetchGlobalActivity`.
// Keep these aliases so builds don't break during refactors.
export const getGlobalActivity = listGlobalActivity;
export const fetchGlobalActivity = listGlobalActivity;

// -----------------------------------------------------------------------------
// Activity write helper (used by API routes)
// -----------------------------------------------------------------------------

export type LogActivityInput = {
  estateId: string;
  kind: ActivityKind;
  action: string;
  message: string;
  entityId?: string;
  entityType?: string;
  href?: string;
  sublabel?: string;

  // Back-compat: older routes may pass these actor identifiers.
  // We persist them into `snapshot` so we don't need schema changes.
  actorId?: string;
  userId?: string;
  ownerId?: string;

  snapshot?: Record<string, unknown> | null;
};

export async function logActivity(input: LogActivityInput): Promise<{ id: string }> {
  await connectToDatabase();

  const Activity = getActivityModel();

  const resolvedActorId =
    input.actorId ?? (input.userId ? String(input.userId) : undefined) ?? (input.ownerId ? String(input.ownerId) : undefined);

  const mergedSnapshot: Record<string, unknown> | null = (() => {
    const base = input.snapshot && typeof input.snapshot === "object" ? { ...input.snapshot } : {};

    // Only add if not already present
    if (resolvedActorId && base.actorId == null) base.actorId = resolvedActorId;
    if (input.userId && base.userId == null) base.userId = String(input.userId);
    if (input.ownerId && base.ownerId == null) base.ownerId = String(input.ownerId);

    return Object.keys(base).length ? base : null;
  })();

  const doc = await Activity.create({
    estateId: toObjectId(input.estateId),
    kind: input.kind ?? "OTHER",
    action: input.action ?? "UNKNOWN",
    message: input.message ?? "",

    entityId: maybeObjectId(input.entityId),
    entityType: input.entityType,

    href: input.href,
    sublabel: input.sublabel,

    snapshot: mergedSnapshot,
  });

  return { id: doc._id.toString() };
}