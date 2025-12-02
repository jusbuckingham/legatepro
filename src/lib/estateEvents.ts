import { connectToDatabase } from "@/lib/db";
import {
  EstateEvent,
  type EstateEventType,
} from "@/models/EstateEvent";

type LogEstateEventInput = {
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