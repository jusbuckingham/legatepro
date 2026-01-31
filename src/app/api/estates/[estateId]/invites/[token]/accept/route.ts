import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";
import type { EstateInvite } from "@/models/Estate";
import { logEstateEvent } from "@/lib/estateEvents";

export const dynamic = "force-dynamic";

function json(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
  const res = NextResponse.json(body, { status: init?.status ?? 200 });

  // Prevent caching (invite links are sensitive).
  res.headers.set("Cache-Control", "no-store, max-age=0");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");

  // Basic security headers.
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "same-origin");

  if (init?.headers) {
    for (const [k, v] of Object.entries(init.headers)) res.headers.set(k, v);
  }

  return res;
}

// Best-effort in-memory rate limit (works in long-lived runtimes; may reset on serverless cold starts).
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const attempts = new Map<string, { count: number; resetAt: number }>();

function getClientKey(req: NextRequest): string {
  const xfwd = req.headers.get("x-forwarded-for");
  const ip = xfwd ? xfwd.split(",")[0]?.trim() : "";
  const realIp = req.headers.get("x-real-ip")?.trim() ?? "";
  const ua = req.headers.get("user-agent")?.slice(0, 64) ?? "";
  return ip || realIp || `ua:${ua}`;
}

function checkRateLimit(key: string): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || entry.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { ok: true };
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
  }

  entry.count += 1;
  attempts.set(key, entry);
  return { ok: true };
}

function isExpired(invite: EstateInvite): boolean {
  if (invite.status !== "PENDING") return false;
  if (!invite.expiresAt) return false;
  return invite.expiresAt.getTime() <= Date.now();
}

function isValidObjectId(id: unknown): id is string {
  return typeof id === "string" && mongoose.Types.ObjectId.isValid(id);
}

function normalizeToken(token: string): string {
  return token.trim();
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ estateId: string; token: string }> },
) {
  // Rate limit by client + route bucket
  const clientKey = `invite-accept:${getClientKey(req)}`;
  const rl = checkRateLimit(clientKey);
  if (!rl.ok) {
    return json(
      { ok: false, error: "Too many requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { estateId: rawEstateId, token: rawToken } = await ctx.params;
  const estateId = String(rawEstateId ?? "").trim();
  const token = normalizeToken(String(rawToken ?? ""));

  // Param guardrails
  if (!estateId || !isValidObjectId(estateId)) {
    return json({ ok: false, error: "Invalid invite" }, { status: 400 });
  }

  if (!token || token.length < 16 || token.length > 256) {
    return json({ ok: false, error: "Invalid invite" }, { status: 400 });
  }

  try {
    await connectToDatabase();

    const estate = await Estate.findOne({
      _id: estateId,
      invites: { $elemMatch: { token } },
    });

    // Keep message generic to reduce invite enumeration.
    if (!estate) {
      return json({ ok: false, error: "Invite not found" }, { status: 404 });
    }

    const invite = (estate.invites ?? []).find((i: EstateInvite) => i.token === token);

    if (!invite) {
      return json({ ok: false, error: "Invite not found" }, { status: 404 });
    }

    // Idempotency: if this user already accepted, return OK.
    if (invite.status === "ACCEPTED" && invite.acceptedBy === session.user.id) {
      return json(
        {
          ok: true,
          estateId: estate.id,
          role: invite.role,
        },
        { status: 200 },
      );
    }

    if (invite.status !== "PENDING") {
      return json(
        { ok: false, error: `Invite is ${String(invite.status).toLowerCase()}` },
        { status: 400 },
      );
    }

    if (isExpired(invite)) {
      invite.status = "EXPIRED";
      await estate.save();
      return json({ ok: false, error: "Invite expired" }, { status: 400 });
    }

    const now = new Date();
    const userEmail = session.user.email.toLowerCase();
    const inviteEmail = String(invite.email ?? "").toLowerCase();

    // Email must match the invited email
    if (!inviteEmail || inviteEmail !== userEmail) {
      return json({ ok: false, error: "Invite email does not match your account" }, { status: 403 });
    }

    // Add or update collaborator
    // Removed in-memory mutation block per instructions.

    // Mark invite accepted (atomic) to prevent double-accept races
    const acceptRes = await Estate.updateOne(
      {
        _id: estateId,
        invites: {
          $elemMatch: {
            token,
            status: "PENDING",
            email: userEmail,
            $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }],
          },
        },
      },
      {
        $set: {
          "invites.$[inv].status": "ACCEPTED",
          "invites.$[inv].acceptedBy": session.user.id,
          "invites.$[inv].acceptedAt": now,
        },
      },
      {
        arrayFilters: [{ "inv.token": token, "inv.status": "PENDING" }],
      },
    );

    if (acceptRes.modifiedCount !== 1) {
      // Someone else may have processed this invite; re-read and respond idempotently.
      const latest = await Estate.findOne({ _id: estateId, invites: { $elemMatch: { token } } })
        .select({ invites: 1 })
        .lean();

      const latestInvite = (latest as { invites?: EstateInvite[] } | null)?.invites?.find(
        (i) => i.token === token,
      );

      if (latestInvite?.status === "ACCEPTED" && latestInvite.acceptedBy === session.user.id) {
        return json({ ok: true, estateId, role: latestInvite.role }, { status: 200 });
      }

      return json(
        { ok: false, error: "Invite has already been processed." },
        { status: 409 },
      );
    }

    // Persist collaborator membership/role.
    // 1) Try to update an existing collaborator entry
    const updateExisting = await Estate.updateOne(
      { _id: estateId, "collaborators.userId": session.user.id },
      { $set: { "collaborators.$.role": invite.role } }
    );

    let collaboratorAdded = false;
    let previousRole: string | undefined;

    if (updateExisting.matchedCount === 0) {
      // 2) No collaborator entry exists; push a new one
      await Estate.updateOne(
        { _id: estateId },
        {
          $push: {
            collaborators: {
              userId: session.user.id,
              role: invite.role,
              addedAt: now,
            },
          },
        }
      );
      collaboratorAdded = true;
    } else {
      // Derive previous role from the earlier read
      const existingCollab = (estate.collaborators ?? []).find((c) => c.userId === session.user.id);
      previousRole = existingCollab?.role;
    }

    // Best-effort event logging
    try {
      if (collaboratorAdded) {
        await logEstateEvent({
          ownerId: estate.ownerId,
          estateId: estate.id,
          type: "COLLABORATOR_INVITE_ACCEPTED",
          summary: "Collaborator invite accepted",
          detail: `${userEmail} accepted a collaborator invite`,
          meta: {
            userId: session.user.id,
            email: inviteEmail,
            role: invite.role,
            actorId: session.user.id,
          },
        });
      } else if (previousRole && previousRole !== invite.role) {
        // Log acceptance and the resulting role change as two distinct events.
        await logEstateEvent({
          ownerId: estate.ownerId,
          estateId: estate.id,
          type: "COLLABORATOR_INVITE_ACCEPTED",
          summary: "Collaborator invite accepted",
          detail: `${userEmail} accepted a collaborator invite`,
          meta: {
            userId: session.user.id,
            email: inviteEmail,
            role: invite.role,
            actorId: session.user.id,
          },
        });

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
            actorId: session.user.id,
          },
        });
      } else {
        await logEstateEvent({
          ownerId: estate.ownerId,
          estateId: estate.id,
          type: "COLLABORATOR_INVITE_ACCEPTED",
          summary: "Collaborator invite accepted",
          detail: `${userEmail} accepted a collaborator invite`,
          meta: {
            userId: session.user.id,
            email: inviteEmail,
            role: invite.role,
            actorId: session.user.id,
          },
        });
      }
    } catch (e) {
      console.warn(
        "[POST /api/estates/[estateId]/invites/[token]/accept] Failed to log event:",
        e
      );
    }

    return json(
      {
        ok: true,
        estateId: estate.id,
        role: invite.role,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error accepting invite:", error);
    return json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 });
  }
}