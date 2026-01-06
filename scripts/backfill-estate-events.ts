/**
 * Backfill + normalize EstateEvent.type values to canonical types.
 *
 * Run:
 *   npx tsx scripts/backfill-estate-events.ts
 */
import "dotenv/config";
import type { FilterQuery } from "mongoose";

import { connectToDatabase } from "@/lib/db";
import EstateEvent, {
  ESTATE_EVENT_TYPES,
  ESTATE_EVENT_TYPE_ALIASES,
  normalizeEstateEventType,
} from "@/models/EstateEvent";

const BATCH_SIZE = 500;

async function main() {
  await connectToDatabase();

  const canonicalTypes = Array.from(ESTATE_EVENT_TYPES) as string[];
  const canonical = new Set<string>(canonicalTypes);
  const aliasKeys = Object.keys(ESTATE_EVENT_TYPE_ALIASES);

  // Anything that is:
  // - an alias key, OR
  // - not canonical
  const query: FilterQuery<unknown> = {
    $or: [{ type: { $in: aliasKeys } }, { type: { $nin: canonicalTypes } }],
  };

  const total = await EstateEvent.countDocuments(query);
  console.log(`[backfill] found ${total} events to normalize`);

  let processed = 0;

  while (true) {
    const docs = await EstateEvent.find(query, { _id: 1, type: 1 })
      .sort({ _id: 1 })
      .limit(BATCH_SIZE)
      .lean<{ _id: unknown; type?: string | null }[]>()
      .exec();

    if (!docs.length) break;

    const ops = docs.map((d) => {
      const current = typeof d.type === "string" ? d.type : "";
      const next = normalizeEstateEventType(current);

      // If it already normalizes to itself and is canonical, skip.
      if (current.trim().toUpperCase() === next) return null;

      return {
        updateOne: {
          filter: { _id: d._id },
          update: { $set: { type: next } },
        },
      };
    });

    const bulkOps = ops.filter(Boolean) as Exclude<(typeof ops)[number], null>[];
    if (bulkOps.length) {
      const res = await EstateEvent.bulkWrite(bulkOps, { ordered: false });
      processed += bulkOps.length;
      console.log(
        `[backfill] batch updated=${res.modifiedCount} (processed ${processed}/${total})`,
      );
    } else {
      processed += docs.length;
      console.log(`[backfill] batch had nothing to update (processed ${processed}/${total})`);
    }
  }

  const remaining = await EstateEvent.countDocuments(query);
  console.log(`[backfill] remaining needing normalization: ${remaining}`);

  // Quick sanity: ensure no non-canonical types remain
  const bad = await EstateEvent.countDocuments({ type: { $nin: Array.from(canonical) } });
  console.log(`[backfill] non-canonical types remaining: ${bad}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("[backfill] failed:", err);
  process.exit(1);
});