import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Best-effort in-memory rate limit (works in long-lived runtimes; may reset on serverless cold starts).
// Tight enough to slow bots, loose enough not to annoy real users.
const RATE_LIMIT_WINDOW_MS = 60_000;

// Per-client/IP bucket
const RATE_LIMIT_MAX = 10;
const registerAttempts = new Map<string, { count: number; resetAt: number }>();

// Per-email bucket (prevents a single client from hammering one address)
const EMAIL_RATE_LIMIT_MAX = 5;
const emailAttempts = new Map<string, { count: number; resetAt: number }>();

function getClientKey(req: NextRequest): string {
  const xfwd = req.headers.get("x-forwarded-for");
  const ip = xfwd ? xfwd.split(",")[0]?.trim() : "";
  const realIp = req.headers.get("x-real-ip")?.trim() ?? "";
  // Fall back to UA bucket if no IP is present (dev / odd proxies)
  const ua = req.headers.get("user-agent")?.slice(0, 64) ?? "";
  return ip || realIp || `ua:${ua}`;
}

function checkRateLimit(
  map: Map<string, { count: number; resetAt: number }>,
  key: string,
  max: number,
): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const now = Date.now();
  const entry = map.get(key);

  if (!entry || entry.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { ok: true };
  }

  if (entry.count >= max) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
  }

  entry.count += 1;
  map.set(key, entry);
  return { ok: true };
}

function json(resBody: unknown, init?: { status?: number; headers?: Record<string, string> }) {
  const res = NextResponse.json(resBody, { status: init?.status ?? 200 });

  // Security / caching hygiene
  res.headers.set("Cache-Control", "no-store, max-age=0");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("X-Content-Type-Options", "nosniff");

  if (init?.headers) {
    for (const [k, v] of Object.entries(init.headers)) res.headers.set(k, v);
  }

  return res;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(req: NextRequest) {
  const clientKey = getClientKey(req);
  const rl = checkRateLimit(registerAttempts, clientKey, RATE_LIMIT_MAX);
  if (!rl.ok) {
    return json(
      { error: "Too many requests. Please try again shortly." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rl.retryAfterSeconds),
        },
      },
    );
  }

  // Guard: require JSON requests
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return json({ error: "Content-Type must be application/json." }, { status: 415 });
  }

  try {
    // Guard: basic body size check (read as text first)
    const raw = await req.text();
    if (raw.length > 25_000) {
      return json({ error: "Request body too large." }, { status: 413 });
    }

    const body: unknown = raw ? JSON.parse(raw) : null;

    if (!isObject(body)) {
      return json({ error: "Invalid request body." }, { status: 400 });
    }

    const name = typeof body.name === "string" ? body.name : undefined;
    const firstName = typeof body.firstName === "string" ? body.firstName : undefined;
    const lastName = typeof body.lastName === "string" ? body.lastName : undefined;
    const email = typeof body.email === "string" ? body.email : "";
    const password = typeof body.password === "string" ? body.password : "";

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password;

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
    const emailKey = `email:${normalizedEmail}`;

    if (!normalizedEmail || !emailOk || !normalizedPassword) {
      // Equalize timing slightly to reduce low-effort enumeration.
      await sleep(150);
      return json({ error: "A valid email and password are required." }, { status: 400 });
    }

    const erl = checkRateLimit(emailAttempts, emailKey, EMAIL_RATE_LIMIT_MAX);
    if (!erl.ok) {
      return json(
        { error: "Too many requests. Please try again shortly." },
        {
          status: 429,
          headers: {
            "Retry-After": String(erl.retryAfterSeconds),
          },
        },
      );
    }

    if (normalizedPassword.length < 8) {
      return json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    if (normalizedPassword.length > 200) {
      return json({ error: "Password is too long." }, { status: 400 });
    }

    // Normalize name into firstName / lastName for schema compatibility
    let normalizedFirstName: string | undefined = firstName?.trim() || undefined;
    let normalizedLastName: string | undefined = lastName?.trim() || undefined;

    if (!normalizedFirstName && name) {
      const parts = String(name).trim().split(/\s+/).filter(Boolean);
      if (parts.length === 1) {
        normalizedFirstName = parts[0];
      } else if (parts.length > 1) {
        normalizedFirstName = parts[0];
        normalizedLastName = parts.slice(1).join(" ");
      }
    }

    // Reasonable bounds
    if (normalizedFirstName && normalizedFirstName.length > 80) {
      return json({ error: "First name is too long." }, { status: 400 });
    }
    if (normalizedLastName && normalizedLastName.length > 120) {
      return json({ error: "Last name is too long." }, { status: 400 });
    }

    await connectToDatabase();

    // Avoid returning different errors that could enable account enumeration.
    // We still use 409 to help legitimate UX, but keep message generic.
    const existing = await User.findOne({ email: normalizedEmail }).select({ _id: 1 }).lean().exec();
    if (existing) {
      await sleep(150);
      return json({ error: "Unable to create account with these details." }, { status: 409 });
    }

    const hashedPassword = await bcrypt.hash(normalizedPassword, 10);

    const user = await User.create({
      firstName: normalizedFirstName,
      lastName: normalizedLastName,
      email: normalizedEmail,
      password: hashedPassword,
    });

    // Cast to lean object to satisfy TypeScript
    const u = user.toObject() as {
      _id: { toString(): string } | string;
      firstName?: string;
      lastName?: string;
      email: string;
    };

    return json(
      {
        user: {
          id: typeof u._id === "string" ? u._id : u._id.toString(),
          firstName: u.firstName || null,
          lastName: u.lastName || null,
          email: u.email,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    // Handle duplicate key errors cleanly (unique email index)
    if (
      typeof error === "object" &&
      error &&
      "code" in error &&
      (error as { code?: unknown }).code === 11000
    ) {
      return json({ error: "Unable to create account with these details." }, { status: 409 });
    }

    console.error("Error registering user:", error);
    return json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}