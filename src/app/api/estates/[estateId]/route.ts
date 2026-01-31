// src/app/api/estates/[estateId]/route.ts
import { NextRequest } from "next/server";
import mongoose from "mongoose";

import { auth } from "@/lib/auth";
import {
  jsonErr,
  jsonOk,
  noStoreHeaders,
  safeErrorMessage,
} from "@/lib/apiResponse";
import { connectToDatabase, serializeMongoDoc } from "@/lib/db";
import { requireEstateEditAccess } from "@/lib/estateAccess";
import { logEstateEvent } from "@/lib/estateEvents";
import { Estate } from "@/models/Estate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{ estateId: string }>;
};

type UpdateEstateBody = Partial<{
  displayName: string;
  name: string;
  estateName: string;
  caseNumber: string;
  courtCaseNumber: string;
  status: "OPEN" | "CLOSED" | string;
  county: string;
  jurisdiction: string;
  decedentName: string;
  decedentDateOfDeath: string;
  notes: string;
}>;

function toObjectId(id: string): mongoose.Types.ObjectId | null {
  return mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : null;
}

function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[],
): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) {
    if (k in obj) out[k] = obj[k];
  }
  return out;
}

export async function PATCH(
  req: NextRequest,
  { params }: RouteParams,
): Promise<Response> {
  const headers = noStoreHeaders();
  const { estateId } = await params;

  if (!estateId) {
    return jsonErr("Missing estateId", 400, headers);
  }

  const session = await auth();
  if (!session?.user?.id) {
    return jsonErr("Unauthorized", 401, headers, "UNAUTHORIZED");
  }

  await connectToDatabase();

  // Permission: must be able to edit this estate
  await requireEstateEditAccess({ estateId, userId: session.user.id });

  const estateObjectId = toObjectId(estateId);
  if (!estateObjectId) {
    return jsonErr("Invalid id", 400, headers);
  }

  let data: UpdateEstateBody;
  try {
    data = (await req.json()) as UpdateEstateBody;
  } catch {
    return jsonErr("Invalid JSON", 400, headers);
  }

  // Only allow a safe subset to be updated (prevents accidental schema corruption)
  const allowed = pick(data as Record<string, unknown>, [
    "displayName",
    "name",
    "estateName",
    "caseNumber",
    "courtCaseNumber",
    "status",
    "county",
    "jurisdiction",
    "decedentName",
    "decedentDateOfDeath",
    "notes",
  ] as const);

  try {
    // Estate.ownerId is a string in this project. Keep scoping tight to the owner.
    const updated = await Estate.findOneAndUpdate(
      { _id: estateObjectId },
      { $set: allowed },
      { new: true },
    )
      .lean()
      .exec();

    if (!updated) {
      return jsonErr("Estate not found", 404, headers);
    }

    try {
      await logEstateEvent({
        ownerId: session.user.id,
        estateId: String(estateObjectId),
        type: "ESTATE_UPDATED",
        summary: "Estate updated",
        meta: { fields: Object.keys(allowed) },
      });
    } catch (err) {
      console.warn("[ESTATE_UPDATED] log failed:", err);
    }

    const estate = serializeMongoDoc(updated);
    return jsonOk({ estate }, 200, headers);
  } catch (error) {
    console.error("[PATCH /api/estates/[estateId]] Error:", error);
    return jsonErr(
      safeErrorMessage(error, "Failed to update estate"),
      500,
      headers,
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: RouteParams,
): Promise<Response> {
  const headers = noStoreHeaders();
  const { estateId } = await params;

  if (!estateId) {
    return jsonErr("Missing estateId", 400, headers);
  }

  const session = await auth();
  if (!session?.user?.id) {
    return jsonErr("Unauthorized", 401, headers, "UNAUTHORIZED");
  }

  await connectToDatabase();

  // Permission: must be able to edit this estate
  await requireEstateEditAccess({ estateId, userId: session.user.id });

  const estateObjectId = toObjectId(estateId);
  if (!estateObjectId) {
    return jsonErr("Invalid id", 400, headers);
  }

  try {
    const deleted = await Estate.findOneAndDelete({
      _id: estateObjectId,
    })
      .lean()
      .exec();

    if (!deleted) {
      return jsonErr("Estate not found", 404, headers);
    }

    try {
      await logEstateEvent({
        ownerId: session.user.id,
        estateId: String(estateObjectId),
        type: "ESTATE_DELETED",
        summary: "Estate deleted",
      });
    } catch (err) {
      console.warn("[ESTATE_DELETED] log failed:", err);
    }

    const estate = serializeMongoDoc(deleted);
    return jsonOk({ estate }, 200, headers);
  } catch (error) {
    console.error("[DELETE /api/estates/[estateId]] Error:", error);
    return jsonErr(
      safeErrorMessage(error, "Failed to delete estate"),
      500,
      headers,
    );
  }
}