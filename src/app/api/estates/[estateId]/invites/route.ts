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

// --- Response helpers ---
function json(
  body: unknown,
  init?: { status?: number; headers?: Record<string, string> },
) {
  const res = NextResponse.json(body, { status: init?.status ?? 200 });

  // Prevent caching (invite links & invite metadata are sensitive).
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

// --- Best-effort rate limit (in-memory; may reset on serverless cold starts) ---
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_WRITE = 40; // POST/DELETE combined
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

  if (entry.count >= RATE_LIMIT_MAX_WRITE) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
  }

  entry.count += 1;
  attempts.set(key, entry);
  return { ok: true };
}

// --- Utilities ---
function toObjectId(id: unknown) {
  return typeof id === "string" && mongoose.Types.ObjectId.isValid(id)
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

  // Lightweight sanity check.
  // (Avoid overly strict regex; we just want obvious bad inputs rejected.)
  if (!email || email.length > 254) return null;
  if (!email.includes("@") || email.startsWith("@") || email.endsWith("@")) return null;
  if (email.includes(" ")) return null;

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
      res: json({ ok: false, error: "Estate not found" }, { status: 404 }),
    };
  }

  // Owner guardrail: only owner can manage invites.
  if (String(estate.ownerId) !== String(userId)) {
    return {
      ok: false as const,
      res: json({ ok: false, error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true as const, estate };
}

async function readJsonBody(req: NextRequest): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; res: NextResponse }>
{
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return { ok: false, res: json({ ok: false, error: "Content-Type must be application/json." }, { status: 415 }) };
  }

  try {
    const raw = await req.text();
    if (raw.length > 25_000) {
      return { ok: false, res: json({ ok: false, error: "Request body too large." }, { status: 413 }) };
    }

    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, res: json({ ok: false, error: "Invalid JSON" }, { status: 400 }) };
    }

    return { ok: true, body: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, res: json({ ok: false, error: "Invalid JSON" }, { status: 400 }) };
  }
}

const MAX_ACTIVE_INVITES_PER_ESTATE = 50;

export async function GET(req: NextRequest, ctx: { params: Promise<{ estateId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { estateId } = await ctx.params;

  const estateObjectId = toObjectId(estateId);
  if (!estateObjectId) {
    return json({ ok: false, error: "Invalid id" }, { status: 400 });
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

  return json({ ok: true, invites }, { status: 200 });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ estateId: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit write actions
  const rlKey = `estate-invites:${getClientKey(req)}`;
  const rl = checkRateLimit(rlKey);
  if (!rl.ok) {
    return json(
      { ok: false, error: "Too many requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  const { estateId } = await ctx.params;

  const estateObjectId = toObjectId(estateId);
  if (!estateObjectId) {
    return json({ ok: false, error: "Invalid id" }, { status: 400 });
  }

  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.res;

  const email = normalizeEmail(parsed.body.email);
  const role = parsed.body.role;

  if (!email || !isInviteRole(role)) {
    return json(
      { ok: false, error: "Missing/invalid email or role (EDITOR|VIEWER)" },
      { status: 400 },
    );
  }

  // Prevent inviting yourself.
  const selfEmail = session.user.email.toLowerCase();
  if (email === selfEmail) {
    return json({ ok: false, error: "You cannot invite yourself." }, { status: 400 });
  }

  await connectToDatabase();

  const result = await requireOwner(estateObjectId, session.user.id);
  if (!result.ok) return result.res;

  // Cap pending invites (anti-abuse)
  const invites: EstateInvite[] = (result.estate.invites ?? []) as EstateInvite[];
  const activeCount = invites.filter((i) => i.status === "PENDING" && !isExpired(i)).length;
  if (activeCount >= MAX_ACTIVE_INVITES_PER_ESTATE) {
    return json(
      { ok: false, error: "Invite limit reached. Revoke or wait for existing invites to expire." },
      { status: 429 },
    );
  }

  // NOTE: We can't reliably check collaborator email without a user lookup.
  // We skip this check intentionally; acceptance enforces email match.

  const origin = getOrigin(req);

  const now = new Date();
  const defaultExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // Reuse/rotate an existing pending invite for this email if present.
  const existing = invites.find((i) => i.email === email && i.status === "PENDING" && !isExpired(i));

  // Generate a token and avoid extremely unlikely collision with existing invite tokens on this estate.
  let token = makeToken();
  for (let i = 0; i < 3; i++) {
    if (!invites.some((x) => x.token === token)) break;
    token = makeToken();
  }

  const inviteUrl = `${origin}/app/estates/${estateId}/invites/${token}`;

  if (existing) {
    const previousRole = existing.role;
    existing.token = token;
    existing.role = role;
    existing.createdBy = session.user.id;
    existing.createdAt = now;
    existing.expiresAt = existing.expiresAt ?? defaultExpiresAt;

    await result.estate.save();

    try {
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
          actorId: String(session.user.id),
        },
      });
    } catch (e) {
      console.warn(
        "[POST /api/estates/[estateId]/invites] Failed to log event (reused invite):",
        e
      );
    }

    return json(
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
      { status: 200 },
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

  try {
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
        actorId: String(session.user.id),
      },
    });
  } catch (e) {
    console.warn(
      "[POST /api/estates/[estateId]/invites] Failed to log event (new invite):",
      e
    );
  }

  return json(
    {
      ok: true,
      inviteUrl,
      token,
      email,
      role,
      status: "PENDING",
      expiresAt: defaultExpiresAt,
    },
    { status: 201 },
  );
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ estateId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit write actions
  const rlKey = `estate-invites:${getClientKey(req)}`;
  const rl = checkRateLimit(rlKey);
  if (!rl.ok) {
    return json(
      { ok: false, error: "Too many requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  const { estateId } = await ctx.params;

  const estateObjectId = toObjectId(estateId);
  if (!estateObjectId) {
    return json({ ok: false, error: "Invalid id" }, { status: 400 });
  }

  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.res;

  const token = asTrimmedString(parsed.body.token);
  const email = normalizeEmail(parsed.body.email);

  if (!token && !email) {
    return json({ ok: false, error: "Provide token or email" }, { status: 400 });
  }

  await connectToDatabase();

  const result = await requireOwner(estateObjectId, session.user.id);
  if (!result.ok) return result.res;

  const invites: EstateInvite[] = (result.estate.invites ?? []) as EstateInvite[];

  const target = invites.find((i) => {
    if (token && i.token === token) return true;
    if (!token && email && i.email === email) return true;
    return false;
  });

  if (!target) {
    // Idempotent delete: token/email already gone or never existed.
    return json({ ok: true, status: "NOT_FOUND" }, { status: 200 });
  }

  // Only revoke pending invites (non-expired). If already revoked/expired, return OK.
  if (target.status === "REVOKED") {
    return json(
      { ok: true, token: target.token, email: target.email, status: target.status, revokedAt: target.revokedAt },
      { status: 200 },
    );
  }

  if (isExpired(target)) {
    target.status = "EXPIRED";
    await result.estate.save();
    return json(
      { ok: true, token: target.token, email: target.email, status: target.status, expiresAt: target.expiresAt },
      { status: 200 },
    );
  }

  if (target.status !== "PENDING") {
    return json(
      { ok: false, error: `Invite is ${target.status.toLowerCase()}` },
      { status: 400 },
    );
  }

  target.status = "REVOKED";
  target.revokedAt = new Date();

  await result.estate.save();

  try {
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
        actorId: String(session.user.id),
      },
    });
  } catch (e) {
    console.warn(
      "[DELETE /api/estates/[estateId]/invites] Failed to log event:",
      e
    );
  }

  return json(
    {
      ok: true,
      token: target.token,
      email: target.email,
      status: target.status,
      revokedAt: target.revokedAt,
    },
    { status: 200 },
  );
}