// src/app/api/auth/route.ts
// Temporary, minimal auth endpoint for LegatePro MVP.
// In production, replace this with a real auth solution (NextAuth, Clerk, custom JWT, etc.).

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";

// GET /api/auth
// Returns a mock "current user" for development.
export async function GET() {
  try {
    await connectToDatabase();

    const demoEmail = process.env.LEGATEPRO_DEMO_EMAIL || "demo@legatepro.test";

    const asRecord = (v: unknown): Record<string, unknown> | null => {
      if (v && typeof v === "object") return v as Record<string, unknown>;
      return null;
    };

    const asString = (v: unknown): string | null => (typeof v === "string" ? v : null);

    const asBool = (v: unknown, fallback = false): boolean =>
      typeof v === "boolean" ? v : fallback;

    // Try to load a demo user
    let user = asRecord(await User.findOne({ email: demoEmail }).lean());

    // If the demo user doesn't exist yet, create it.
    if (!user) {
      const created = await User.create({
        email: demoEmail,
        firstName: "Demo",
        lastName: "User",
        authProvider: "password",
        onboardingCompleted: false,
      });
      user = asRecord(created.toObject());
    }

    // Only send safe fields to the client
    const safeUser = {
      id: user?._id != null ? String(user._id) : "",
      email: asString(user?.email) ?? demoEmail,
      firstName: asString(user?.firstName),
      lastName: asString(user?.lastName),
      onboardingCompleted: asBool(user?.onboardingCompleted, false),
      subscriptionStatus: asString(user?.subscriptionStatus),
    };

    return NextResponse.json({ user: safeUser }, { status: 200 });
  } catch (error) {
    console.error("GET /api/auth error", error);
    return NextResponse.json({ error: "Unable to load current user" }, { status: 500 });
  }
}
