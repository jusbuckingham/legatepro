import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import mongoose from "mongoose";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";
import type { EstateInvite, InviteRole } from "@/models/Estate";
import { logEstateEvent } from "@/lib/estateEvents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toObjectId(id: string) {
  return mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : null;
}

function asTrimmedString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function isInviteRole(v: unknown): v is InviteRole {
  return v === "EDITOR" || v === "VIEWER";
}

function normalizeEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const email = v.trim().toLowerCase();
  // Minimal sanity check (we keep it lightweight; full validation can be added later)
  if (!email || !email.includes("@") || email.startsWith("@") || email.endsWith("@")) return null;
  return email;
}

function makeToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

function getOrigin(req: NextRequest): string {
  // Prefer Next.js computed origin.
  const fromNextUrl = req.nextUrl?.origin;
  if (typeof fromNextUrl === "string" && fromNextUrl.startsWith("http")) return fromNextUrl;

  // Fallback for some proxy setups.
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

function isExpired(invite: Pick<EstateInvite, "status" | "expiresAt">): boolean {
  if (invite.status !== "PENDING") return false;
  if (!invite.expiresAt) return false;
  return invite.expiresAt.getTime() <= Date.now();
}

async function requireOwner(estateObjectId: mongoose.Types.ObjectId, userId: string) {
  const estate = await Estate.findById(estateObjectId);
  if (!estate) {
    return {
      ok: false as const,
      res: NextResponse.json({ error: "Estate not found" }, { status: 404 }),
    };
  }

  // Owner guardrail: only owner can manage invites.
  if (String(estate.ownerId) !== String(userId)) {
    return {
      ok: false as const,
      res: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true as const, estate };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ estateId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { estateId } = await ctx.params;

  const estateObjectId = toObjectId(estateId);
  if (!estateObjectId) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  await connectToDatabase();

  const result = await requireOwner(estateObjectId, session.user.id);
  if (!result.ok) return result.res;

  // Persist expiration so the UI and stored state stay aligned.
  let didExpire = false;
  const estateInvites = (result.estate.invites ?? []) as EstateInvite[];
  for (const inv of estateInvites) {
    if (isExpired(inv)) {
      inv.status = "EXPIRED";
      didExpire = true;
    }
  }
  if (didExpire) {
    result.estate.invites = estateInvites;
    await result.estate.save();
  }

  type InviteDTO = {
    token: string;
    email: string;
    role: InviteRole;
    status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
    createdBy: string;
    createdAt?: Date;
    expiresAt?: Date;
    acceptedBy?: string;
    acceptedAt?: Date;
    revokedAt?: Date;
  };

  const invites: InviteDTO[] = estateInvites.map((inv: EstateInvite) => {
    const expired = isExpired(inv);
    return {
      token: inv.token,
      email: inv.email,
      role: inv.role,
      status: expired ? "EXPIRED" : inv.status,
      createdBy: String(inv.createdBy),
      createdAt: inv.createdAt,
      expiresAt: inv.expiresAt,
      acceptedBy: inv.acceptedBy,
      acceptedAt: inv.acceptedAt,
      revokedAt: inv.revokedAt,
    };
  });

  // Most recent first
  invites.sort((a: InviteDTO, b: InviteDTO) => {
    const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bt - at;
  });

  return NextResponse.json({ ok: true, invites }, { status: 200 });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ estateId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { estateId } = await ctx.params;

  const estateObjectId = toObjectId(estateId);
  if (!estateObjectId) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  await connectToDatabase();

  const result = await requireOwner(estateObjectId, session.user.id);
  if (!result.ok) return result.res;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = normalizeEmail((body as { email?: unknown })?.email);
  const role = (body as { role?: unknown })?.role;

  if (!email || !isInviteRole(role)) {
    return NextResponse.json(
      { error: "Missing/invalid email or role (EDITOR|VIEWER)" },
      { status: 400 }
    );
  }

  const token = makeToken();
  const origin = getOrigin(req);
  const inviteUrl = `${origin}/app/estates/${estateId}/invites/${token}`;

  const now = new Date();
  const defaultExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // Reuse/rotate an existing pending invite for this email if present.
  const invites: EstateInvite[] = (result.estate.invites ?? []) as EstateInvite[];
  const existing = invites.find((i) => i.email === email && i.status === "PENDING" && !isExpired(i));

  if (existing) {
    const previousRole = existing.role;
    existing.token = token;
    existing.role = role;
    existing.createdBy = session.user.id;
    existing.createdAt = now;
    existing.expiresAt = existing.expiresAt ?? defaultExpiresAt;

    await result.estate.save();

    await logEstateEvent({
      ownerId: result.estate.ownerId,
      estateId: String(result.estate._id),
      type: "COLLABORATOR_INVITE_SENT",
      summary: "Collaborator invite link created",
      detail: `Invite link created for ${email} (${role})`,
      meta: {
        email,
        role,
        token,
        inviteUrl,
        expiresAt: existing.expiresAt,
        reused: true,
        previousRole,
        createdBy: String(session.user.id),
      },
    });

    return NextResponse.json(
      {
        ok: true,
        inviteUrl,
        token,
        email,
        role,
        previousRole,
        status: existing.status,
        expiresAt: existing.expiresAt,
      },
      { status: 200 }
    );
  }

  invites.push({
    token,
    email,
    role,
    status: "PENDING",
    createdBy: session.user.id,
    createdAt: now,
    expiresAt: defaultExpiresAt,
  });

  result.estate.invites = invites;
  await result.estate.save();

  await logEstateEvent({
    ownerId: result.estate.ownerId,
    estateId: String(result.estate._id),
    type: "COLLABORATOR_INVITE_SENT",
    summary: "Collaborator invite link created",
    detail: `Invite link created for ${email} (${role})`,
    meta: {
      email,
      role,
      token,
      inviteUrl,
      expiresAt: defaultExpiresAt,
      reused: false,
      createdBy: String(session.user.id),
    },
  });

  return NextResponse.json(
    {
      ok: true,
      inviteUrl,
      token,
      email,
      role,
      status: "PENDING",
      expiresAt: defaultExpiresAt,
    },
    { status: 201 }
  );
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ estateId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { estateId } = await ctx.params;

  const estateObjectId = toObjectId(estateId);
  if (!estateObjectId) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  await connectToDatabase();

  const result = await requireOwner(estateObjectId, session.user.id);
  if (!result.ok) return result.res;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = asTrimmedString((body as { token?: unknown })?.token);
  const email = normalizeEmail((body as { email?: unknown })?.email);

  if (!token && !email) {
    return NextResponse.json({ error: "Provide token or email" }, { status: 400 });
  }

  const invites: EstateInvite[] = (result.estate.invites ?? []) as EstateInvite[];

  const target = invites.find((i) => {
    if (token && i.token === token) return true;
    if (!token && email && i.email === email) return true;
    return false;
  });

  if (!target) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  // Only revoke pending invites (non-expired).
  if (target.status !== "PENDING") {
    return NextResponse.json({ error: `Invite is ${target.status.toLowerCase()}` }, { status: 400 });
  }

  if (isExpired(target)) {
    target.status = "EXPIRED";
    await result.estate.save();
    return NextResponse.json({ error: "Invite already expired" }, { status: 400 });
  }

  target.status = "REVOKED";
  target.revokedAt = new Date();

  await result.estate.save();

  await logEstateEvent({
    ownerId: result.estate.ownerId,
    estateId: String(result.estate._id),
    type: "COLLABORATOR_INVITE_REVOKED",
    summary: "Collaborator invite revoked",
    detail: `Invite revoked for ${target.email} (${target.role})`,
    meta: {
      email: target.email,
      role: target.role,
      token: target.token,
      revokedAt: target.revokedAt,
      revokedBy: session.user.id,
    },
  });

  return NextResponse.json(
    {
      ok: true,
      token: target.token,
      email: target.email,
      status: target.status,
      revokedAt: target.revokedAt,
    },
    { status: 200 }
  );
}