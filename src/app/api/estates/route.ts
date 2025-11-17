// src/app/api/estates/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";

export async function GET() {
  try {
    await connectToDatabase();

    // For now, return all estates. We can scope to the logged-in user later.
    const estates = await Estate.find().sort({ createdAt: -1 }).lean();

    return NextResponse.json({ estates }, { status: 200 });
  } catch (error) {
    console.error("[GET /api/estates] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch estates" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();

    const body = await req.json();

    // For now, accept whatever the client sends and let the Mongoose schema
    // enforce required fields. We'll tighten this with explicit validation later.
    const estate = await Estate.create(body);

    return NextResponse.json({ estate }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/estates] Error:", error);
    return NextResponse.json(
      { error: "Failed to create estate" },
      { status: 500 }
    );
  }
}