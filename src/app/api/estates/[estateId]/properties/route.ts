// src/app/api/estates/[estateId]/properties/route.ts
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

import { auth } from "@/lib/auth";
import { connectToDatabase, serializeMongoDoc } from "@/lib/db";
import { requireEstateAccess, requireEstateEditAccess } from "@/lib/estateAccess";
import { logEstateEvent } from "@/lib/estateEvents";
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

function isValidObjectIdString(id: unknown): id is string {
  return typeof id === "string" && mongoose.Types.ObjectId.isValid(id);
}

function toObjectId(id: unknown) {
  return isValidObjectIdString(id) ? new mongoose.Types.ObjectId(id) : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseLimit(value: string | null, def = 200, max = 500): number {
  if (!value) return def;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), max);
}

export async function GET(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { estateId } = await params;

  if (!estateId || typeof estateId !== "string") {
    return NextResponse.json({ ok: false, error: "Missing estateId" }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const estateObjectId = toObjectId(estateId);
    if (!estateObjectId) {
      return NextResponse.json({ ok: false, error: "Invalid estateId" }, { status: 400 });
    }

    const url = new URL(req.url);
    const limit = parseLimit(url.searchParams.get("limit"), 200, 500);

    await connectToDatabase();
    // Permission: must be able to view this estate (collaborators allowed)
    await requireEstateAccess({ estateId, userId: session.user.id });

    const propertiesRaw = await EstateProperty.find({ estateId: estateObjectId })
      .sort({ createdAt: -1 })
      .limit(limit)
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

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const estateObjectId = toObjectId(estateId);
    if (!estateObjectId) {
      return NextResponse.json({ ok: false, error: "Invalid estateId" }, { status: 400 });
    }

    const raw = await req.json().catch(() => null);
    if (!isPlainObject(raw)) {
      return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
    }

    const body = raw as PropertyCreateBody;

    await connectToDatabase();
    // Permission: must be able to edit this estate
    await requireEstateEditAccess({ estateId, userId: session.user.id });

    const payload = {
      estateId: estateObjectId,
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
    const property = serializeMongoDoc(created);

    try {
      await logEstateEvent({
        ownerId: session.user.id,
        estateId,
        type: "PROPERTY_CREATED",
        summary: "Property created",
        detail: `Created property ${String((created as { _id?: unknown })._id ?? "")}`,
        meta: {
          propertyId: String((created as { _id?: unknown })._id ?? ""),
          actorId: session.user.id,
        },
      });
    } catch (e) {
      console.warn(
        "[POST /api/estates/[estateId]/properties] Failed to log event:",
        e
      );
    }

    return NextResponse.json({ ok: true, property }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/estates/[estateId]/properties] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to create property" },
      { status: 500 }
    );
  }
}