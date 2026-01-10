// src/app/api/auth/route.ts
// Temporary, minimal auth endpoint for LegatePro MVP.
// In production, replace this with a real auth solution (NextAuth, Clerk, custom JWT, etc.).

import { NextResponse } from "next/server";
import { connectToDatabase, serializeMongoDoc } from "@/lib/db";
import { User } from "@/models/User";

// GET /api/auth
// Returns a mock "current user" for development.
export async function GET(): Promise<NextResponse> {
  try {
    await connectToDatabase();

    const demoEmail = process.env.LEGATEPRO_DEMO_EMAIL || "demo@legatepro.test";

    // Try to load a demo user
    let user = serializeMongoDoc(await User.findOne({ email: demoEmail }).lean());

    // If the demo user doesn't exist yet, create it.
    if (!user) {
      const created = await User.create({
        email: demoEmail,
        firstName: "Demo",
        lastName: "User",
        authProvider: "password",
        onboardingCompleted: false,
      });
      user = serializeMongoDoc(created);
    }

    // Only send safe fields to the client
    const safeUser = {
      id: user?.id ?? "",
      email: user?.email ?? demoEmail,
      firstName: user?.firstName ?? null,
      lastName: user?.lastName ?? null,
      onboardingCompleted: user?.onboardingCompleted ?? false,
      subscriptionStatus: user?.subscriptionStatus ?? null,
    };

    return NextResponse.json(
      { ok: true, data: { user: safeUser } },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("GET /api/auth error", error);
    return NextResponse.json(
      { ok: false, error: "Unable to load current user" },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
