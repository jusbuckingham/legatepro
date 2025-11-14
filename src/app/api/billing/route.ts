// src/app/api/billing/route.ts
// Minimal billing endpoint for LegatePro MVP.
// In production, replace this with real Stripe-backed billing.

import { NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/db";
import { User, UserDocument } from "../../../models/User";

// Simple in-memory description of the plans used on /app/billing
const PLAN_METADATA: Record<
  string,
  {
    id: string;
    name: string;
    price: number;
    currency: string;
    interval: "month" | "year";
  }
> = {
  free: {
    id: "free",
    name: "Starter",
    price: 0,
    currency: "usd",
    interval: "month",
  },
  pro: {
    id: "pro",
    name: "Pro Personal Representative",
    price: 19,
    currency: "usd",
    interval: "month",
  },
};

// GET /api/billing
// Returns mock subscription/billing info for the "current" user (demo user for now).
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
        subscriptionStatus: "free",
      });
    }

    if (!user) {
      throw new Error("Unable to load or create demo user");
    }

    const planId = user.subscriptionStatus ?? "free";
    const plan = PLAN_METADATA[planId] ?? PLAN_METADATA["free"];

    const subscription = {
      planId: plan.id,
      planName: plan.name,
      price: plan.price,
      currency: plan.currency,
      interval: plan.interval,
      status: planId === "free" ? "inactive" : "active",
      // Eventually, when Stripe is wired up, this will reflect real state
      managedByStripe: false,
      isDemo: true,
    };

    // Mongoose 8 types mark `_id` as `unknown`, so we defensively coerce to string.
    const userId =
      typeof user._id === "string"
        ? user._id
        : (user._id as { toString(): string }).toString();

    const customer = {
      id: userId,
      email: user.email,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
    };

    return NextResponse.json(
      {
        customer,
        subscription,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("GET /api/billing error", error);
    return NextResponse.json(
      { error: "Unable to load billing information" },
      { status: 500 }
    );
  }
}