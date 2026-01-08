import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase, serializeMongoDoc } from "@/lib/db";
import { EstateProperty } from "@/models/EstateProperty";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{ estateId: string; propertyId: string }>;
};

type PropertyUpdateBody = Partial<{
  name: string;
  type: string;
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
  const { estateId, propertyId } = await params;

  if (!estateId || !propertyId) {
    return NextResponse.json(
      { ok: false, error: "Missing estateId or propertyId" },
      { status: 400 }
    );
  }

  try {
    await connectToDatabase();

    const property = await EstateProperty.findOne({
      _id: propertyId,
      estateId,
    }).lean();

    if (!property) {
      return NextResponse.json(
        { ok: false, error: "Property not found" },
        { status: 404 }
      );
    }

    const out = serializeMongoDoc(property) as Record<string, unknown>;
    return NextResponse.json({ ok: true, property: out }, { status: 200 });
  } catch (error) {
    console.error("[GET /api/estates/[estateId]/properties/[propertyId]]", error);
    return NextResponse.json(
      { ok: false, error: "Failed to load property" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { estateId, propertyId } = await params;

  if (!estateId || !propertyId) {
    return NextResponse.json(
      { ok: false, error: "Missing estateId or propertyId" },
      { status: 400 }
    );
  }

  try {
    await connectToDatabase();

    const body = (await req.json()) as PropertyUpdateBody;

    // sanitize + restrict update fields
    const update: PropertyUpdateBody = {};

    const setField = <K extends keyof PropertyUpdateBody>(
      key: K,
      value: PropertyUpdateBody[K]
    ) => {
      update[key] = value;
    };

    const setIfString = <K extends keyof PropertyUpdateBody>(key: K, v: unknown) => {
      if (typeof v !== "string") return;
      const trimmed = v.trim();
      setField(key, (trimmed.length ? trimmed : "") as PropertyUpdateBody[K]);
    };

    const setIfNumber = <K extends keyof PropertyUpdateBody>(key: K, v: unknown) => {
      if (typeof v === "number" && Number.isFinite(v)) {
        setField(key, v as PropertyUpdateBody[K]);
        return;
      }
      if (typeof v === "string") {
        const n = Number(v);
        if (Number.isFinite(n)) setField(key, n as PropertyUpdateBody[K]);
      }
    };

    if (Object.prototype.hasOwnProperty.call(body, "name")) setIfString("name", body.name);
    if (Object.prototype.hasOwnProperty.call(body, "type")) setIfString("type", body.type);
    if (Object.prototype.hasOwnProperty.call(body, "address")) setIfString("address", body.address);
    if (Object.prototype.hasOwnProperty.call(body, "city")) setIfString("city", body.city);
    if (Object.prototype.hasOwnProperty.call(body, "state")) setIfString("state", body.state);
    if (Object.prototype.hasOwnProperty.call(body, "postalCode")) setIfString("postalCode", body.postalCode);
    if (Object.prototype.hasOwnProperty.call(body, "country")) setIfString("country", body.country);
    if (Object.prototype.hasOwnProperty.call(body, "notes")) setIfString("notes", body.notes);

    if (Object.prototype.hasOwnProperty.call(body, "estimatedValue")) {
      setIfNumber("estimatedValue", body.estimatedValue);
      if (typeof update.estimatedValue === "number") {
        update.estimatedValue = Math.max(0, update.estimatedValue);
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, "ownershipPercentage")) {
      setIfNumber("ownershipPercentage", body.ownershipPercentage);
      if (typeof update.ownershipPercentage === "number") {
        update.ownershipPercentage = Math.min(100, Math.max(0, update.ownershipPercentage));
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { ok: false, error: "No valid fields provided" },
        { status: 400 }
      );
    }

    const updated = await EstateProperty.findOneAndUpdate(
      { _id: propertyId, estateId },
      update,
      { new: true, runValidators: true }
    ).lean();

    if (!updated) {
      return NextResponse.json(
        { ok: false, error: "Property not found" },
        { status: 404 }
      );
    }

    const out = serializeMongoDoc(updated) as Record<string, unknown>;
    return NextResponse.json({ ok: true, property: out }, { status: 200 });
  } catch (error) {
    console.error(
      "[PATCH /api/estates/[estateId]/properties/[propertyId]]",
      error
    );
    return NextResponse.json(
      { ok: false, error: "Failed to update property" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { estateId, propertyId } = await params;

  if (!estateId || !propertyId) {
    return NextResponse.json(
      { ok: false, error: "Missing estateId or propertyId" },
      { status: 400 }
    );
  }

  try {
    await connectToDatabase();

    const deleted = await EstateProperty.findOneAndDelete({
      _id: propertyId,
      estateId,
    }).lean();

    if (!deleted) {
      return NextResponse.json(
        { ok: false, error: "Property not found" },
        { status: 404 }
      );
    }
    // Intentionally not returning deleted payload; serialize if needed in the future.
    void deleted;

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("[DELETE /api/estates/[estateId]/properties/[propertyId]]", error);
    return NextResponse.json(
      { ok: false, error: "Failed to delete property" },
      { status: 500 }
    );
  }
}