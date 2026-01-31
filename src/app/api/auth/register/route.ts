// src/app/api/auth/register/route.ts
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";

export const runtime = "nodejs";
// Auth & user creation should never be cached
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS: HeadersInit = {
  "Cache-Control": "no-store",
};

type RegisterBody = {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
};

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function isLikelyEmail(value: string): boolean {
  // pragmatic check (not full RFC validation)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return NextResponse.json(
        { ok: false, error: "Unsupported content type" },
        { status: 415, headers: NO_STORE_HEADERS },
      );
    }

    let body: RegisterBody;
    try {
      body = (await req.json()) as RegisterBody;
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const emailRaw = normalizeNullableString(body.email);
    const email = emailRaw ? emailRaw.toLowerCase() : null;
    const password = normalizeNullableString(body.password) ?? "";

    if (email && !isLikelyEmail(email)) {
      return NextResponse.json(
        { ok: false, error: "Invalid email address" },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const firstName = normalizeNullableString(body.firstName);
    const lastName = normalizeNullableString(body.lastName);
    const providedName = normalizeNullableString(body.name);

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, error: "Email and password are required" },
        {
          status: 400,
          headers: NO_STORE_HEADERS,
        }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { ok: false, error: "Password must be at least 8 characters" },
        {
          status: 400,
          headers: NO_STORE_HEADERS,
        }
      );
    }

    await connectToDatabase();

    // Prevent duplicates (normalized)
    const existing = await User.findOne({ email }).lean();
    if (existing) {
      return NextResponse.json(
        { ok: false, error: "Email already registered" },
        {
          status: 409,
          headers: NO_STORE_HEADERS,
        }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const computedName = [firstName, lastName].filter(Boolean).join(" ");

    const created = await User.create({
      email,
      passwordHash,
      authProvider: "password",
      firstName,
      lastName,
      name: providedName ?? (computedName.length ? computedName : null),
      onboardingCompleted: false,
      subscriptionStatus: "free",
    });

    return NextResponse.json(
      { ok: true, data: { id: String(created._id), email: created.email } },
      {
        status: 201,
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (err: unknown) {
    // Duplicate key error (Mongo)
    const e = err as { code?: number } | null;
    if (e?.code === 11000) {
      return NextResponse.json(
        { ok: false, error: "Email already registered" },
        {
          status: 409,
          headers: NO_STORE_HEADERS,
        }
      );
    }

    console.error("POST /api/auth/register error", err);
    return NextResponse.json(
      { ok: false, error: "Unable to register user" },
      {
        status: 500,
        headers: NO_STORE_HEADERS,
      }
    );
  }
}