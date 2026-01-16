// src/app/api/auth/register/route.ts
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";

type RegisterBody = {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RegisterBody;

    const email = body.email?.trim().toLowerCase();
    const password = body.password?.trim() ?? "";

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, error: "Email and password are required" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { ok: false, error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    await connectToDatabase();

    // Prevent duplicates (normalized)
    const existing = await User.findOne({ email }).lean();
    if (existing) {
      return NextResponse.json(
        { ok: false, error: "Email already registered" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const created = await User.create({
      email,
      passwordHash,
      firstName: body.firstName ?? null,
      lastName: body.lastName ?? null,
      name:
        body.name ??
        ([body.firstName, body.lastName].filter(Boolean).join(" ") || null),
      onboardingCompleted: false,
      subscriptionStatus: "free",
    });

    return NextResponse.json(
      { ok: true, data: { id: String(created._id), email: created.email } },
      { status: 201 }
    );
  } catch (err: unknown) {
    // Duplicate key error (Mongo)
    const e = err as { code?: number } | null;
    if (e?.code === 11000) {
      return NextResponse.json(
        { ok: false, error: "Email already registered" },
        { status: 409 }
      );
    }

    console.error("POST /api/auth/register error", err);
    return NextResponse.json(
      { ok: false, error: "Unable to register user" },
      { status: 500 }
    );
  }
}