// src/app/api/estates/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";
import { auth } from "@/lib/auth";

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

    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    const payload = {
      ...body,
      ownerId: userId,
    };

    const estate = await Estate.create(payload);

    return NextResponse.json({ estate }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/estates] Error:", error);
    return NextResponse.json(
      { error: "Failed to create estate" },
      { status: 500 }
    );
  }
}