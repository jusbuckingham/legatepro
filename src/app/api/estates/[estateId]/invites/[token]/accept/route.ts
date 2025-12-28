import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";
import type { EstateInvite } from "@/models/Estate";
import { logEstateEvent } from "@/lib/estateEvents";

function isExpired(invite: EstateInvite): boolean {
  if (invite.status !== "PENDING") return false;
  if (!invite.expiresAt) return false;
  return invite.expiresAt.getTime() <= Date.now();
}

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ estateId: string; token: string }> }
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { estateId, token } = await ctx.params;

  await connectToDatabase();

  const estate = await Estate.findOne({
    _id: estateId,
    invites: { $elemMatch: { token } },
  });

  if (!estate) {
    return NextResponse.json({ ok: false, error: "Invite not found" }, { status: 404 });
  }

  const invite = (estate.invites ?? []).find(
    (i: EstateInvite) => i.token === token
  );

  if (!invite) {
    return NextResponse.json({ ok: false, error: "Invite not found" }, { status: 404 });
  }

  if (invite.status !== "PENDING") {
    return NextResponse.json(
      { error: `Invite is ${invite.status.toLowerCase()}` },
      { status: 400 }
    );
  }

  if (isExpired(invite)) {
    invite.status = "EXPIRED";
    await estate.save();

    return NextResponse.json({ ok: false, error: "Invite expired" }, { status: 400 });
  }

  const userEmail = session.user.email.toLowerCase();
  const inviteEmail = String(invite.email ?? "").toLowerCase();

  // Email must match the invited email
  if (!inviteEmail || inviteEmail !== userEmail) {
    return NextResponse.json(
      { error: "Invite email does not match your account" },
      { status: 403 }
    );
  }

  // Add or update collaborator
  const existing = (estate.collaborators ?? []).find(
    (c) => c.userId === session.user.id
  );

  if (existing) {
    // Upgrade/downgrade role only if different
    if (existing.role !== invite.role) {
      const previousRole = existing.role;
      existing.role = invite.role;

      await logEstateEvent({
        ownerId: estate.ownerId,
        estateId: estate.id,
        type: "COLLABORATOR_ROLE_CHANGED",
        summary: "Collaborator role updated",
        detail: `Updated ${userEmail} from ${previousRole} to ${invite.role}`,
        meta: {
          userId: session.user.id,
          previousRole,
          role: invite.role,
        },
      });
    }
  } else {
    estate.collaborators = estate.collaborators ?? [];
    estate.collaborators.push({
      userId: session.user.id,
      role: invite.role,
      addedAt: new Date(),
    });

    await logEstateEvent({
      ownerId: estate.ownerId,
      estateId: estate.id,
      type: "COLLABORATOR_ADDED",
      summary: "Collaborator added",
      detail: `Accepted invite: ${userEmail} as ${invite.role}`,
      meta: {
        userId: session.user.id,
        role: invite.role,
      },
    });
  }

  // Mark invite accepted
  invite.status = "ACCEPTED";
  invite.acceptedBy = session.user.id;
  invite.acceptedAt = new Date();

  await estate.save();

  await logEstateEvent({
    ownerId: estate.ownerId,
    estateId: estate.id,
    type: "COLLABORATOR_ADDED",
    summary: "Invite accepted",
    detail: `${userEmail} accepted an invite (link)`,
    meta: {
      userId: session.user.id,
      email: inviteEmail,
      role: invite.role,
    },
  });

  return NextResponse.json(
    {
      ok: true,
      estateId: estate.id,
      role: invite.role,
    },
    { status: 200 }
  );
}