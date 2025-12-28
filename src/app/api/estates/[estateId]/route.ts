// src/app/api/estates/[estateId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { requireEstateEditAccess } from "@/lib/estateAccess";
import { Estate } from "@/models/Estate";
import { logEstateEvent } from "@/lib/estateEvents";

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

function toObjectId(id: string) {
  return mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : null;
}

function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
) {
  const out = {} as Pick<T, K>;
  for (const k of keys) {
    if (k in obj) out[k] = obj[k];
  }
  return out;
}

export async function PATCH(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { estateId } = await params;

  if (!estateId) {
    return NextResponse.json({ ok: false, error: "Missing estateId" }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Permission: must be able to edit this estate
  await requireEstateEditAccess({ estateId, userId: session.user.id });

  const estateObjectId = toObjectId(estateId);
  if (!estateObjectId) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }

  let data: UpdateEstateBody;
  try {
    data = (await req.json()) as UpdateEstateBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
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
  ]);

  try {
    await connectToDatabase();

    // Estate.ownerId is a string in this project. Keep scoping tight to the owner.
    const updated = await Estate.findOneAndUpdate(
      { _id: estateObjectId, ownerId: session.user.id },
      { $set: allowed },
      { new: true }
    )
      .lean()
      .exec();

    if (!updated) {
      return NextResponse.json({ ok: false, error: "Estate not found" }, { status: 404 });
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

    return NextResponse.json({ ok: true, estate: updated }, { status: 200 });
  } catch (error) {
    console.error("[PATCH /api/estates/[estateId]] Error:", error);
    return NextResponse.json(
      { error: "Failed to update estate" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { estateId } = await params;

  if (!estateId) {
    return NextResponse.json({ ok: false, error: "Missing estateId" }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Permission: must be able to edit this estate
  await requireEstateEditAccess({ estateId, userId: session.user.id });

  const estateObjectId = toObjectId(estateId);
  if (!estateObjectId) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }

  try {
    await connectToDatabase();

    const deleted = await Estate.findOneAndDelete({
      _id: estateObjectId,
      ownerId: session.user.id,
    })
      .lean()
      .exec();

    if (!deleted) {
      return NextResponse.json({ ok: false, error: "Estate not found" }, { status: 404 });
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

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("[DELETE /api/estates/[estateId]] Error:", error);
    return NextResponse.json(
      { error: "Failed to delete estate" },
      { status: 500 }
    );
  }
}