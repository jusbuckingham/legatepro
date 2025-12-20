import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid request body." },
        { status: 400 }
      );
    }

    const b = body as Record<string, unknown>;

    const name = typeof b.name === "string" ? b.name : undefined;
    const firstName = typeof b.firstName === "string" ? b.firstName : undefined;
    const lastName = typeof b.lastName === "string" ? b.lastName : undefined;
    const email = typeof b.email === "string" ? b.email : "";
    const password = typeof b.password === "string" ? b.password : "";

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password;

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);

    if (!normalizedEmail || !emailOk || !normalizedPassword) {
      return NextResponse.json(
        { error: "A valid email and password are required." },
        { status: 400 }
      );
    }

    if (normalizedPassword.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    // Normalize name into firstName / lastName for schema compatibility
    let normalizedFirstName: string | undefined = firstName?.trim() || undefined;
    let normalizedLastName: string | undefined = lastName?.trim() || undefined;

    if (!normalizedFirstName && name) {
      const parts = String(name).trim().split(" ");
      if (parts.length === 1) {
        normalizedFirstName = parts[0];
      } else if (parts.length > 1) {
        normalizedFirstName = parts[0];
        normalizedLastName = parts.slice(1).join(" ");
      }
    }

    await connectToDatabase();

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
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

    return NextResponse.json(
      {
        user: {
          id: typeof u._id === "string" ? u._id : u._id.toString(),
          firstName: u.firstName || null,
          lastName: u.lastName || null,
          email: u.email,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error registering user:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}