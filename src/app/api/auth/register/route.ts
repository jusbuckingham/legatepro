import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";

export async function POST(req: NextRequest) {
  try {
    const {
      name,
      firstName,
      lastName,
      email,
      password
    } = await req.json();

    const normalizedEmail = String(email).trim().toLowerCase();

    if (!normalizedEmail || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      );
    }

    // Normalize name into firstName / lastName for schema compatibility
    let normalizedFirstName: string | undefined = firstName;
    let normalizedLastName: string | undefined = lastName;

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

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      firstName: normalizedFirstName,
      lastName: normalizedLastName,
      email: normalizedEmail,
      password: hashedPassword
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
          email: u.email
        }
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