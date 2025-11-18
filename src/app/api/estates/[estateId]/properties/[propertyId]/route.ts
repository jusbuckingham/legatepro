import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { EstateProperty } from "@/models/EstateProperty";

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
      { error: "Missing estateId or propertyId" },
      { status: 400 }
    );
  }

  try {
    await connectToDatabase();

    const property = await EstateProperty.findOne({
      _id: propertyId,
      estateId
    }).lean();

    if (!property) {
      return NextResponse.json(
        { error: "Property not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ property }, { status: 200 });
  } catch (error) {
    console.error("[GET /api/estates/[estateId]/properties/[propertyId]]", error);
    return NextResponse.json(
      { error: "Failed to load property" },
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
      { error: "Missing estateId or propertyId" },
      { status: 400 }
    );
  }

  try {
    await connectToDatabase();

    const body = (await req.json()) as PropertyUpdateBody;

    const update: PropertyUpdateBody & { label?: string } = {
      ...body,
    };

    if (Object.prototype.hasOwnProperty.call(body, "name")) {
      update.label = body.name ?? body.address ?? "Untitled property";
    }

    const updated = await EstateProperty.findOneAndUpdate(
      { _id: propertyId, estateId },
      update,
      { new: true }
    ).lean();

    if (!updated) {
      return NextResponse.json(
        { error: "Property not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ property: updated }, { status: 200 });
  } catch (error) {
    console.error("[PATCH /api/estates/[estateId]/properties/[propertyId]]", error);
    return NextResponse.json(
      { error: "Failed to update property" },
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
      { error: "Missing estateId or propertyId" },
      { status: 400 }
    );
  }

  try {
    await connectToDatabase();

    const deleted = await EstateProperty.findOneAndDelete({
      _id: propertyId,
      estateId
    }).lean();

    if (!deleted) {
      return NextResponse.json(
        { error: "Property not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("[DELETE /api/estates/[estateId]/properties/[propertyId]]", error);
    return NextResponse.json(
      { error: "Failed to delete property" },
      { status: 500 }
    );
  }
}