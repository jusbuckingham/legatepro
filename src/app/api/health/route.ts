// src/app/api/health/route.ts (if you don't already have it)
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";

export async function GET() {
  try {
    await connectToDatabase();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Health check failed:", error);
    return NextResponse.json({ ok: false, error: "DB connection failed" }, { status: 500 });
  }
}