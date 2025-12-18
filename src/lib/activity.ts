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

async function ensureActivityModelRegistered(): Promise<void> {
  // If already registered, nothing to do.
  if (mongoose.models.Activity) return;

  // Try to load common model module paths. If a module exists, its top-level
  // code should register the schema with mongoose.model(...).
  const candidates = [
    "@/models/Activity",
    "@/models/EstateActivity",
    "@/models/activity",
    "@/models/activities/Activity",
    "@/models/activities/EstateActivity",
  ];

  for (const spec of candidates) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _mod = await import(spec);
      if (mongoose.models.Activity) return;
    } catch {
      // ignore
    }
  }
}

async function getActivityModel(): Promise<Model<unknown>> {
  // First attempt: direct registration.
  if (!mongoose.models.Activity) {
    await ensureActivityModelRegistered();
  }

  const direct = mongoose.models.Activity as Model<unknown> | undefined;
  if (direct) return direct;

  // Fallback: some codebases register the collection under a different model name
  // (e.g. "EstateActivity"). Try any registered model that includes "activity".
  const modelNames = Object.keys(mongoose.models);
  const altName = modelNames.find((n) => n.toLowerCase().includes("activity"));
  if (altName) {
    return mongoose.models[altName] as Model<unknown>;
  }

  throw new Error(
    `Mongoose model 'Activity' is not registered. Ensure your Activity model file is imported at least once so it runs and registers the schema. Registered models: ${modelNames.join(", ") || "(none)"}`
  );
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
  if (e.includes("collab") || e.includes("invite") || e.includes("collaborator")) return "COLLAB";

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
    sublabel: doc.entityType ? doc.entityType : undefined,
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

  const Activity = await getActivityModel();

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