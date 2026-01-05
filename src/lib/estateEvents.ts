import { connectToDatabase } from "@/lib/db";
import { EstateEvent, type EstateEventType } from "@/models/EstateEvent";

export type LogEstateEventInput = {
  ownerId: string;
  estateId: string;
  type: EstateEventType;
  summary: string;
  detail?: string | null;
  meta?: Record<string, unknown>;
};

export async function logEstateEvent(input: LogEstateEventInput) {
  const { ownerId, estateId, type, summary, detail, meta } = input;

  await connectToDatabase();

  await EstateEvent.create({
    ownerId,
    estateId,
    type,
    summary,
    detail: detail ?? undefined,
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
    query.type = { $in: types };
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
    type: (d as { type: EstateEventType }).type,
    summary: String((d as { summary: unknown }).summary ?? ""),
    detail: (d as { detail?: string | null }).detail ?? null,
    meta: (d as { meta?: Record<string, unknown> }).meta,
    createdAt: (d as { createdAt?: Date }).createdAt,
  }));

  const nextCursor = rows.length > 0 ? rows[rows.length - 1].createdAt?.toISOString() : null;

  return { rows, nextCursor };
}