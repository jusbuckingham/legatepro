

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { getEstateAccess } from "@/lib/estateAccess";
import { Estate, type EstateRole } from "@/models/Estate";
import { logEstateEvent } from "@/lib/estateEvents";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function toObjectId(id: string) {
  return mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : null;
}

function toIdString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (value instanceof mongoose.Types.ObjectId) return value.toString();

  try {
    return String(value);
  } catch {
    return "";
  }
}

function idsEqual(a: unknown, b: unknown): boolean {
  const aStr = toIdString(a);
  const bStr = toIdString(b);
  return aStr.length > 0 && aStr === bStr;
}

function isAssignableRole(role: unknown): role is Exclude<EstateRole, "OWNER"> {
  return role === "EDITOR" || role === "VIEWER";
}

type PatchBody = {
  role: EstateRole;
};

/**
 * PATCH: change collaborator role
 * - OWNER only
 * - collaborator identified by [userId] param
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ estateId: string; userId: string }> }
) {
  const { estateId, userId } = await ctx.params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const estateObjectId = toObjectId(estateId);
  if (!estateObjectId) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }

  await connectToDatabase();

  const access = await getEstateAccess({
    estateId,
    userId: session.user.id,
    atLeastRole: "OWNER",
  });

  if (!access || access.role !== "OWNER") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let body: Partial<PatchBody>;
  try {
    body = (await req.json()) as Partial<PatchBody>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!isAssignableRole(body.role)) {
    return NextResponse.json(
      { ok: false, error: "Missing/invalid role (EDITOR|VIEWER)" },
      { status: 400 }
    );
  }

  const estate = await Estate.findById(estateObjectId);
  if (!estate) {
    return NextResponse.json({ ok: false, error: "Estate not found" }, { status: 404 });
  }

  const estateOwnerId = toIdString(estate.ownerId);

  // Guard: cannot change the owner's role
  if (estateOwnerId && userId === estateOwnerId) {
    return NextResponse.json(
      { ok: false, error: "Cannot change owner role" },
      { status: 400 }
    );
  }

  const collab = (estate.collaborators ?? []).find((c) => idsEqual(c.userId, userId));
  if (!collab) {
    return NextResponse.json({ ok: false, error: "Collaborator not found" }, { status: 404 });
  }

  const previousRole = collab.role;

  if (previousRole === body.role) {
    return NextResponse.json(
      { ok: true, collaborators: estate.collaborators ?? [] },
      { status: 200 }
    );
  }

  collab.role = body.role;
  collab.addedAt = collab.addedAt ?? new Date();

  await estate.save();

  await logEstateEvent({
    ownerId: estateOwnerId,
    estateId,
    type: "COLLABORATOR_ROLE_CHANGED",
    summary: "Collaborator role changed",
    detail: `Changed collaborator ${userId} from ${previousRole} to ${body.role}`,
    meta: { userId, previousRole, role: body.role },
  });

  return NextResponse.json(
    { ok: true, collaborators: estate.collaborators ?? [] },
    { status: 200 }
  );
}

/**
 * DELETE: remove collaborator
 * - OWNER only
 * - collaborator identified by [userId] param
 */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ estateId: string; userId: string }> }
) {
  const { estateId, userId } = await ctx.params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const estateObjectId = toObjectId(estateId);
  if (!estateObjectId) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }

  await connectToDatabase();

  const access = await getEstateAccess({
    estateId,
    userId: session.user.id,
    atLeastRole: "OWNER",
  });

  if (!access || access.role !== "OWNER") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const estate = await Estate.findById(estateObjectId);
  if (!estate) {
    return NextResponse.json({ ok: false, error: "Estate not found" }, { status: 404 });
  }

  const estateOwnerId = toIdString(estate.ownerId);

  // Guard: cannot remove the owner
  if (estateOwnerId && userId === estateOwnerId) {
    return NextResponse.json(
      { ok: false, error: "Cannot remove owner" },
      { status: 400 }
    );
  }

  const removed = (estate.collaborators ?? []).find((c) => idsEqual(c.userId, userId));
  if (!removed) {
    return NextResponse.json({ ok: false, error: "Collaborator not found" }, { status: 404 });
  }

  estate.collaborators = (estate.collaborators ?? []).filter(
    (c) => !idsEqual(c.userId, userId)
  );

  await estate.save();

  await logEstateEvent({
    ownerId: estateOwnerId,
    estateId,
    type: "COLLABORATOR_REMOVED",
    summary: "Collaborator removed",
    detail: `Removed collaborator ${userId}`,
    meta: { userId, previousRole: removed.role },
  });

  return NextResponse.json(
    { ok: true, collaborators: estate.collaborators ?? [] },
    { status: 200 }
  );
}