// src/app/api/estates/route.ts
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";
import { logEstateEvent } from "@/lib/estateEvents";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CreateEstateBody = Partial<{
  displayName: string;
  name: string;
  estateName: string;
  caseNumber: string;
  courtCaseNumber: string;
  status: "OPEN" | "CLOSED" | string;
  county: string;
  jurisdiction: string;
  decedentName: string;
  decedentDateOfDeath: string;
  notes: string;
}>;

/**
 * GET /api/estates
 * List estates owned by the logged-in user
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectToDatabase();

    // IMPORTANT: scope to ownerId (Estate.ownerId is a string)
    const estates = await Estate.find({ ownerId: session.user.id })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return NextResponse.json({ ok: true, estates }, { status: 200 });
  } catch (error) {
    console.error("[GET /api/estates] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch estates" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/estates
 * Create a new estate owned by the logged-in user
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: CreateEstateBody;
  try {
    body = (await req.json()) as CreateEstateBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  try {
    await connectToDatabase();

    const payload = {
      ...body,
      ownerId: session.user.id,
      status: body.status ?? "OPEN",
    };

    const estate = await Estate.create(payload);

    try {
      await logEstateEvent({
        ownerId: session.user.id,
        estateId: String(estate._id),
        type: "ESTATE_CREATED",
        summary: "Estate created",
      });
    } catch (err) {
      console.warn("[ESTATE_CREATED] log failed:", err);
    }

    return NextResponse.json({ ok: true, estate }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/estates] Error:", error);
    return NextResponse.json(
      { error: "Failed to create estate" },
      { status: 500 }
    );
  }
}