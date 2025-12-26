import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { requireEstateAccess } from "@/lib/estateAccess";
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

function isAssignableRole(role: unknown): role is Exclude<EstateRole, "OWNER"> {
  return role === "EDITOR" || role === "VIEWER";
}

async function loadEstateForCollaborators(estateObjectId: mongoose.Types.ObjectId) {
  return Estate.findById(estateObjectId, { ownerId: 1, collaborators: 1 })
    .lean<{ ownerId: string; collaborators?: EstateCollaborator[] }>()
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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const estateObjectId = toObjectId(estateId);
  if (!estateObjectId) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  // Permission: must be an estate member
  await requireEstateAccess({ estateId, userId: session.user.id });

  await connectToDatabase();

  const estate = await loadEstateForCollaborators(estateObjectId);
  if (!estate) {
    return NextResponse.json({ error: "Estate not found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      ok: true,
      estateId,
      ownerId: estate.ownerId,
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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const estateObjectId = toObjectId(estateId);
  if (!estateObjectId) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const access = await requireEstateAccess({ estateId, userId: session.user.id });
  if (access.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Partial<AddCollaboratorBody>;
  try {
    body = (await req.json()) as Partial<AddCollaboratorBody>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body?.userId || !isAssignableRole(body.role)) {
    return NextResponse.json(
      { error: "Missing/invalid userId or role (EDITOR|VIEWER)" },
      { status: 400 }
    );
  }

  // Owner already has implicit access
  if (body.userId === session.user.id) {
    return NextResponse.json(
      { error: "Owner already has access" },
      { status: 400 }
    );
  }

  await connectToDatabase();

  const estate = await Estate.findById(estateObjectId);
  if (!estate) {
    return NextResponse.json({ error: "Estate not found" }, { status: 404 });
  }

  const existing = estate.collaborators?.find((c) => c.userId === body.userId);

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
      ownerId: session.user.id,
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
    ownerId: session.user.id,
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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const estateObjectId = toObjectId(estateId);
  if (!estateObjectId) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const access = await requireEstateAccess({ estateId, userId: session.user.id });
  if (access.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Partial<UpdateCollaboratorBody>;
  try {
    body = (await req.json()) as Partial<UpdateCollaboratorBody>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body?.userId || !isAssignableRole(body.role)) {
    return NextResponse.json(
      { error: "Missing/invalid userId or role (EDITOR|VIEWER)" },
      { status: 400 }
    );
  }

  await connectToDatabase();

  const estate = await Estate.findById(estateObjectId);
  if (!estate) {
    return NextResponse.json({ error: "Estate not found" }, { status: 404 });
  }

  const collab = estate.collaborators?.find((c) => c.userId === body.userId);
  if (!collab) {
    return NextResponse.json(
      { error: "Collaborator not found" },
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
    ownerId: session.user.id,
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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const estateObjectId = toObjectId(estateId);
  if (!estateObjectId) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const access = await requireEstateAccess({ estateId, userId: session.user.id });
  if (access.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Partial<RemoveCollaboratorBody>;
  try {
    body = (await req.json()) as Partial<RemoveCollaboratorBody>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body?.userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  if (body.userId === session.user.id) {
    return NextResponse.json(
      { error: "Cannot remove yourself" },
      { status: 400 }
    );
  }

  await connectToDatabase();

  const estate = await Estate.findById(estateObjectId);
  if (!estate) {
    return NextResponse.json({ error: "Estate not found" }, { status: 404 });
  }

  const removed = (estate.collaborators ?? []).find((c) => c.userId === body.userId);
  if (!removed) {
    return NextResponse.json({ error: "Collaborator not found" }, { status: 404 });
  }

  estate.collaborators = (estate.collaborators ?? []).filter(
    (c) => c.userId !== body.userId
  );

  await estate.save();

  await logEstateEvent({
    ownerId: session.user.id,
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