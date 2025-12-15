// src/lib/activity.ts
import mongoose, { Model, Types } from "mongoose";

import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";

/**
 * NOTE:
 * We intentionally do NOT import a model file here, because projects differ on the
 * exact filename (Activity.ts vs EstateActivity.ts, etc.). Instead, we rely on the
 * model having been registered somewhere else (e.g. in a models import).
 */

function getActivityModel(): Model<unknown> {
  const existing = mongoose.models.Activity as Model<unknown> | undefined;
  if (!existing) {
    throw new Error(
      "Mongoose model 'Activity' is not registered. Ensure your Activity model file is imported at least once (e.g. in a route/page) so it runs and registers the schema."
    );
  }
  return existing;
}

export type ActivityTone = "rose" | "emerald" | "amber" | "slate";

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

function toObjectId(id: string): Types.ObjectId {
  return new Types.ObjectId(id);
}

function asIdString(id: Types.ObjectId | string | undefined): string | undefined {
  if (!id) return undefined;
  return typeof id === "string" ? id : id.toString();
}

function mapTone(kind: string, action: string): ActivityTone {
  const k = kind.toLowerCase();
  const a = action.toLowerCase();

  if (k.includes("invoice") || a.includes("invoice")) return "amber";
  if (k.includes("document") || a.includes("document")) return "emerald";
  if (k.includes("note") || a.includes("note")) return "slate";
  if (k.includes("collab") || a.includes("invite") || a.includes("collaborator"))
    return "rose";

  return "slate";
}

function buildHref(estateId: string, doc: ActivityLean): string | undefined {
  const action = doc.action.toUpperCase();
  const kind = doc.kind.toUpperCase();
  const entityId = asIdString(doc.entityId);

  // Adjust these to match your app routes.
  if ((kind.includes("DOCUMENT") || action.includes("DOCUMENT")) && entityId) {
    return `/app/estates/${estateId}/documents/${entityId}`;
  }
  if ((kind.includes("NOTE") || action.includes("NOTE")) && entityId) {
    return `/app/estates/${estateId}/notes?focus=${entityId}`;
  }
  if ((kind.includes("TASK") || action.includes("TASK")) && entityId) {
    return `/app/estates/${estateId}/tasks?focus=${entityId}`;
  }
  if ((kind.includes("INVOICE") || action.includes("INVOICE")) && entityId) {
    return `/app/estates/${estateId}/invoices?focus=${entityId}`;
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

  // Optional: badge by action/kind
  const badge = doc.action ? doc.action.replace(/_/g, " ") : undefined;

  return {
    id: doc._id.toString(),
    at: doc.createdAt,
    label,
    sublabel: doc.entityType ? doc.entityType : undefined,
    href: buildHref(estateIdStr, doc),
    tone: mapTone(doc.kind, doc.action),
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
  input: FetchActivityInput
): Promise<FetchActivityResult> {
  const limit = Math.max(1, Math.min(input.limit ?? 25, 100));
  const cursor = decodeCursor(input.cursor);

  await connectToDatabase();

  // Determine estate scope
  let estateIds: Types.ObjectId[] = [];

  if (input.estateId) {
    estateIds = [toObjectId(input.estateId)];
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