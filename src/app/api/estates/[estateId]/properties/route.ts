// src/app/api/estates/[estateId]/properties/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { EstateProperty } from "@/models/EstateProperty";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{ estateId: string }>;
};

type PropertyCreateBody = Partial<{
  name: string;
  type: string;
  category: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  estimatedValue: number;
  ownershipPercentage: number;
  notes: string;
}>;

export async function GET(
  _req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { estateId } = await params;

  if (!estateId || typeof estateId !== "string") {
    return NextResponse.json({ error: "Missing estateId" }, { status: 400 });
  }

  try {
    await connectToDatabase();

    const properties = await EstateProperty.find({ estateId })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ properties }, { status: 200 });
  } catch (error) {
    console.error("[GET /api/estates/[estateId]/properties] Error:", error);
    return NextResponse.json(
      { error: "Failed to load properties" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { estateId } = await params;

  if (!estateId || typeof estateId !== "string") {
    return NextResponse.json({ error: "Missing estateId" }, { status: 400 });
  }

  try {
    await connectToDatabase();

    const body = (await req.json()) as PropertyCreateBody;

    const payload = {
      estateId,
      label: (body.name ?? body.address ?? "Untitled property").toString().trim(),
      name: (body.name ?? "").toString().trim(),
      type: (body.type ?? "Real estate").toString().trim(),
      category: (body.category ?? "").toString().trim(),
      address: (body.address ?? "").toString().trim(),
      city: (body.city ?? "").toString().trim(),
      state: (body.state ?? "").toString().trim(),
      postalCode: (body.postalCode ?? "").toString().trim(),
      country: (body.country ?? "").toString().trim(),
      estimatedValue: Math.max(0, Number(body.estimatedValue ?? 0) || 0),
      ownershipPercentage: Math.min(
        100,
        Math.max(0, Number(body.ownershipPercentage ?? 100) || 0)
      ),
      notes: (body.notes ?? "").toString().trim(),
    };

    const created = await EstateProperty.create(payload);

    return NextResponse.json({ property: created }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/estates/[estateId]/properties] Error:", error);
    return NextResponse.json(
      { error: "Failed to create property" },
      { status: 500 }
    );
  }
}