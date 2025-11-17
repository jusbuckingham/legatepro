// src/app/api/estates/[estateId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";

type RouteParams = {
  params: Promise<{ estateId: string }>;
};

type UpdateEstateBody = Partial<{
  name: string;
  estateName: string;
  caseNumber: string;
  courtCaseNumber: string;
  status: string;
  county: string;
  jurisdiction: string;
  decedentName: string;
  decedentDateOfDeath: string;
  notes: string;
}>;

export async function PATCH(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { estateId } = await params;

  if (!estateId) {
    return NextResponse.json({ error: "Missing estateId" }, { status: 400 });
  }

  try {
    await connectToDatabase();

    const data = (await req.json()) as UpdateEstateBody;

    const updated = await Estate.findByIdAndUpdate(estateId, data, {
      new: true
    }).lean();

    if (!updated) {
      return NextResponse.json(
        { error: "Estate not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ estate: updated }, { status: 200 });
  } catch (error) {
    console.error("[PATCH /api/estates/[estateId]] Error:", error);
    return NextResponse.json(
      { error: "Failed to update estate" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { estateId } = await params;

  if (!estateId) {
    return NextResponse.json({ error: "Missing estateId" }, { status: 400 });
  }

  try {
    await connectToDatabase();

    const deleted = await Estate.findByIdAndDelete(estateId).lean();

    if (!deleted) {
      return NextResponse.json(
        { error: "Estate not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("[DELETE /api/estates/[estateId]] Error:", error);
    return NextResponse.json(
      { error: "Failed to delete estate" },
      { status: 500 }
    );
  }
}