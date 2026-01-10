// src/app/api/estates/[estateId]/properties/route.ts
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase, serializeMongoDoc } from "@/lib/db";
import { requireEstateAccess, requireEstateEditAccess } from "@/lib/estateAccess";
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

function toObjectId(id: string) {
  return mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : null;
}

export async function GET(
  _req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { estateId } = await params;

  if (!estateId || typeof estateId !== "string") {
    return NextResponse.json({ ok: false, error: "Missing estateId" }, { status: 400 });
  }

  try {
    await connectToDatabase();
    // Permission: must be able to view this estate (collaborators allowed)
    await requireEstateAccess({ estateId });

    const estateObjectId = toObjectId(estateId);
    if (!estateObjectId) {
      return NextResponse.json({ ok: false, error: "Invalid estateId" }, { status: 400 });
    }

    const propertiesRaw = await EstateProperty.find({ estateId: estateObjectId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    const properties = Array.isArray(propertiesRaw)
      ? propertiesRaw.map((p) => serializeMongoDoc(p))
      : [];

    return NextResponse.json({ ok: true, properties }, { status: 200 });
  } catch (error) {
    console.error("[GET /api/estates/[estateId]/properties] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to load properties" },
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
    return NextResponse.json({ ok: false, error: "Missing estateId" }, { status: 400 });
  }

  try {
    await connectToDatabase();
    // Permission: must be able to edit this estate
    await requireEstateEditAccess({ estateId });

    const estateObjectId = toObjectId(estateId);
    if (!estateObjectId) {
      return NextResponse.json({ ok: false, error: "Invalid estateId" }, { status: 400 });
    }

    const body = (await req.json()) as PropertyCreateBody;

    const payload = {
      estateId: estateObjectId,
      label: (body.name ?? body.address ?? "Untitled property")
        .toString()
        .trim(),
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
    const property = serializeMongoDoc(created);

    return NextResponse.json({ ok: true, property }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/estates/[estateId]/properties] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to create property" },
      { status: 500 }
    );
  }
}