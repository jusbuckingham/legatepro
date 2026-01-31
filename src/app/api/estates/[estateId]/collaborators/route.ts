import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { getEstateAccess } from "@/lib/estateAccess";
import {
  Estate,
  type EstateCollaborator,
  type EstateRole,
} from "@/models/Estate";
import { logEstateEvent } from "@/lib/estateEvents";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AddCollaboratorBody = {
  userId: string;
  role: EstateRole;
};

type UpdateCollaboratorBody = {
  userId: string;
  role: EstateRole;
};

type RemoveCollaboratorBody = {
  userId: string;
};

function toObjectId(id: string) {
  return mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : null;
}

function isValidObjectIdString(id: unknown): id is string {
  return typeof id === "string" && mongoose.Types.ObjectId.isValid(id);
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

async function loadEstateForCollaborators(estateObjectId: mongoose.Types.ObjectId) {
  return Estate.findById(estateObjectId, { ownerId: 1, collaborators: 1 })
    .lean<{ ownerId: unknown; collaborators?: EstateCollaborator[] }>()
    .exec();
}

/**
 * GET: list collaborators
 * - Any estate member can view
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ estateId: string }> }
) {
  const { estateId } = await ctx.params;

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
    atLeastRole: "VIEWER",
  });

  if (!access) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const estate = await loadEstateForCollaborators(estateObjectId);
  if (!estate) {
    return NextResponse.json({ ok: false, error: "Estate not found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      ok: true,
      estateId,
      ownerId: toIdString(estate.ownerId),
      collaborators: estate.collaborators ?? [],
    },
    { status: 200 }
  );
}

/**
 * POST: add or upsert collaborator
 * - OWNER only
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ estateId: string }> }
) {
  const { estateId } = await ctx.params;

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

  let body: Partial<AddCollaboratorBody>;
  try {
    body = (await req.json()) as Partial<AddCollaboratorBody>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!isValidObjectIdString(body?.userId) || !isAssignableRole(body.role)) {
    return NextResponse.json(
      { ok: false, error: "Missing/invalid userId or role (EDITOR|VIEWER)" },
      { status: 400 }
    );
  }

  const estate = await Estate.findById(estateObjectId);
  if (!estate) {
    return NextResponse.json({ ok: false, error: "Estate not found" }, { status: 404 });
  }

  const estateOwnerId = toIdString(estate.ownerId);

  // Prevent adding the owner as an explicit collaborator
  if (estateOwnerId && body.userId === estateOwnerId) {
    return NextResponse.json(
      { ok: false, error: "Owner already has access" },
      { status: 400 }
    );
  }

  const existing = estate.collaborators?.find((c) => idsEqual(c.userId, body.userId));

  // Upsert behavior with guardrails:
  // - New collaborator => add + log added
  // - Existing collaborator with role change => update + log role changed
  // - Existing collaborator with same role => no-op
  if (existing) {
    const previousRole = existing.role;

    if (previousRole === body.role) {
      return NextResponse.json(
        { ok: true, collaborators: estate.collaborators ?? [] },
        { status: 200 }
      );
    }

    existing.role = body.role;
    existing.addedAt = existing.addedAt ?? new Date();

    await estate.save();

    await logEstateEvent({
      ownerId: estateOwnerId,
      estateId,
      type: "COLLABORATOR_ROLE_CHANGED",
      summary: "Collaborator role changed",
      detail: `Changed collaborator ${body.userId} from ${previousRole} to ${body.role}`,
      meta: { userId: body.userId, previousRole, role: body.role },
    });

    return NextResponse.json(
      { ok: true, collaborators: estate.collaborators ?? [] },
      { status: 200 }
    );
  }

  estate.collaborators = estate.collaborators ?? [];
  estate.collaborators.push({
    userId: body.userId,
    role: body.role,
    addedAt: new Date(),
  });

  await estate.save();

  await logEstateEvent({
    ownerId: estateOwnerId,
    estateId,
    type: "COLLABORATOR_ADDED",
    summary: "Collaborator added",
    detail: `Added collaborator ${body.userId} as ${body.role}`,
    meta: { userId: body.userId, role: body.role },
  });

  return NextResponse.json(
    { ok: true, collaborators: estate.collaborators ?? [] },
    { status: 200 }
  );
}

/**
 * PATCH: change role
 * - OWNER only
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ estateId: string }> }
) {
  const { estateId } = await ctx.params;

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

  let body: Partial<UpdateCollaboratorBody>;
  try {
    body = (await req.json()) as Partial<UpdateCollaboratorBody>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!isValidObjectIdString(body?.userId) || !isAssignableRole(body.role)) {
    return NextResponse.json(
      { ok: false, error: "Missing/invalid userId or role (EDITOR|VIEWER)" },
      { status: 400 }
    );
  }

  const estate = await Estate.findById(estateObjectId);
  if (!estate) {
    return NextResponse.json({ ok: false, error: "Estate not found" }, { status: 404 });
  }

  const estateOwnerId = toIdString(estate.ownerId);

  const collab = estate.collaborators?.find((c) => idsEqual(c.userId, body.userId));
  if (!collab) {
    return NextResponse.json(
      { ok: false, error: "Collaborator not found" },
      { status: 404 }
    );
  }

  const previousRole = collab.role;

  if (previousRole === body.role) {
    return NextResponse.json(
      { ok: true, collaborators: estate.collaborators ?? [] },
      { status: 200 }
    );
  }

  collab.role = body.role;
  await estate.save();

  await logEstateEvent({
    ownerId: estateOwnerId,
    estateId,
    type: "COLLABORATOR_ROLE_CHANGED",
    summary: "Collaborator role changed",
    detail: `Changed collaborator ${body.userId} from ${previousRole} to ${body.role}`,
    meta: { userId: body.userId, previousRole, role: body.role },
  });

  return NextResponse.json(
    { ok: true, collaborators: estate.collaborators ?? [] },
    { status: 200 }
  );
}

/**
 * DELETE: remove collaborator
 * - OWNER only
 */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ estateId: string }> }
) {
  const { estateId } = await ctx.params;

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

  let body: Partial<RemoveCollaboratorBody>;
  try {
    body = (await req.json()) as Partial<RemoveCollaboratorBody>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!isValidObjectIdString(body?.userId)) {
    return NextResponse.json({ ok: false, error: "Missing/invalid userId" }, { status: 400 });
  }

  if (body.userId === session.user.id) {
    return NextResponse.json(
      { ok: false, error: "Cannot remove yourself" },
      { status: 400 }
    );
  }

  const estate = await Estate.findById(estateObjectId);
  if (!estate) {
    return NextResponse.json({ ok: false, error: "Estate not found" }, { status: 404 });
  }

  const estateOwnerId = toIdString(estate.ownerId);

  const removed = (estate.collaborators ?? []).find((c) => idsEqual(c.userId, body.userId));
  if (!removed) {
    return NextResponse.json({ ok: false, error: "Collaborator not found" }, { status: 404 });
  }

  estate.collaborators = (estate.collaborators ?? []).filter(
    (c) => !idsEqual(c.userId, body.userId)
  );

  await estate.save();

  await logEstateEvent({
    ownerId: estateOwnerId,
    estateId,
    type: "COLLABORATOR_REMOVED",
    summary: "Collaborator removed",
    detail: `Removed collaborator ${body.userId}`,
    meta: { userId: body.userId, previousRole: removed?.role },
  });

  return NextResponse.json(
    { ok: true, collaborators: estate.collaborators ?? [] },
    { status: 200 }
  );
}