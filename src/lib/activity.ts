import { connectToDatabase } from "@/lib/db";
import { EstateActivity } from "@/models/EstateActivity";

export type ActivityKind = "invoice" | "document" | "task" | "note";

export async function logActivity(input: {
  estateId: string;
  ownerId: string;
  kind: ActivityKind;
  action: string;
  entityId: string;
  message: string;
  snapshot?: Record<string, unknown> | null;
}) {
  await connectToDatabase();

  await EstateActivity.create({
    estateId: input.estateId,
    ownerId: input.ownerId,
    kind: input.kind,
    action: input.action,
    entityId: input.entityId,
    message: input.message,
    snapshot: input.snapshot ?? null,
  });
}