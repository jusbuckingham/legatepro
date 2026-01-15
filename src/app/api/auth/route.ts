// src/app/api/auth/route.ts
// Current-user endpoint (NextAuth-backed).
// NOTE: We keep this as a convenience endpoint for the app UI, but it MUST NOT create demo users.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { connectToDatabase, serializeMongoDoc } from "@/lib/db";
import { User } from "@/models/User";

// GET /api/auth
// Returns the current authenticated user (safe fields only).
export async function GET(): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);

    const email = session?.user?.email ?? null;
    if (!email) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        {
          status: 401,
          headers: {
            "Cache-Control": "no-store",
          },
        }
      );
    }

    await connectToDatabase();

    const userDoc = await User.findOne({ email }).lean();
    const user = userDoc ? serializeMongoDoc(userDoc) : null;

    // Only send safe fields to the client
    const safeUser = {
      id: user?.id ?? "",
      email,
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
