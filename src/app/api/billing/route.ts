// src/app/api/auth/route.ts
// Temporary, minimal auth endpoint for LegatePro MVP.
// In production, replace this with a real auth solution (NextAuth, Clerk, custom JWT, etc.).

import { NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/db";
import { User, UserDocument } from "../../../models/User";

// GET /api/auth
// Returns a mock "current user" for development.
export async function GET() {
  try {
    await connectToDatabase();

    const demoEmail = process.env.LEGATEPRO_DEMO_EMAIL || "demo@legatepro.test";

    let user: UserDocument | null = await User.findOne({ email: demoEmail });

    // If the demo user doesn't exist yet, create it.
    if (!user) {
      user = await User.create({
        email: demoEmail,
        firstName: "Demo",
        lastName: "User",
        authProvider: "password",
        onboardingCompleted: false,
      });
    }

    // Extra safety: bail if for some reason user is still null
    if (!user) {
      throw new Error("Unable to load or create demo user");
    }

    // Only send safe fields to the client
    const safeUser = {
      id: user._id.toString(),
      email: user.email,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      onboardingCompleted: user.onboardingCompleted ?? false,
      subscriptionStatus: user.subscriptionStatus ?? null,
    };

    return NextResponse.json({ user: safeUser }, { status: 200 });
  } catch (error) {
    console.error("GET /api/auth error", error);
    return NextResponse.json(
      { error: "Unable to load current user" },
      { status: 500 }
    );
  }
}