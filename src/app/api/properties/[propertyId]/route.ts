import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/db";
import { EstateProperty } from "../../../../models/EstateProperty";

/**
 * GET /api/properties/[propertyId]?estateId=...
 * Fetch a single property, optionally scoped to an estate.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { propertyId: string } }
) {
  try {
    const { propertyId } = params;

    if (!propertyId) {
      return NextResponse.json(
        { error: "Property ID is required" },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const url = new URL(request.url);
    const estateId = url.searchParams.get("estateId") ?? undefined;

    const query: Record<string, unknown> = { _id: propertyId };
    if (estateId) {
      query.estateId = estateId;
    }

    const property = await EstateProperty.findOne(query).lean();

    if (!property) {
      return NextResponse.json(
        { error: "Property not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(property);
  } catch (error) {
    console.error("Error fetching property:", error);
    return NextResponse.json(
      { error: "Failed to fetch property" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/properties/[propertyId]
 * Update a single property.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { propertyId: string } }
) {
  try {
    const { propertyId } = params;

    if (!propertyId) {
      return NextResponse.json(
        { error: "Property ID is required" },
        { status: 400 }
      );
    }

    const body = await request.json();

    const {
      estateId,
      label,
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
      propertyType,
      bedrooms,
      bathrooms,
      monthlyRentTarget,
      notes,
      tenantName,
      tenantPhone,
      tenantEmail,
      tenantNotes,
    } = body ?? {};

    if (!estateId) {
      return NextResponse.json(
        { error: "Estate ID is required" },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const update: Record<string, unknown> = {
      label,
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
      propertyType,
      bedrooms,
      bathrooms,
      monthlyRentTarget,
      notes,
      tenantName,
      tenantPhone,
      tenantEmail,
      tenantNotes,
    };

    // Remove undefined keys so we don't overwrite with undefined
    Object.keys(update).forEach((key) => {
      if (update[key] === undefined) {
        delete update[key];
      }
    });

    const property = await EstateProperty.findOneAndUpdate(
      { _id: propertyId, estateId },
      { $set: update },
      { new: true, runValidators: true }
    ).lean();

    if (!property) {
      return NextResponse.json(
        { error: "Property not found or does not belong to this estate" },
        { status: 404 }
      );
    }

    return NextResponse.json(property);
  } catch (error) {
    console.error("Error updating property:", error);
    return NextResponse.json(
      { error: "Failed to update property" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/properties/[propertyId]?estateId=...
 * (Optional) Remove a property from an estate.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { propertyId: string } }
) {
  try {
    const { propertyId } = params;

    if (!propertyId) {
      return NextResponse.json(
        { error: "Property ID is required" },
        { status: 400 }
      );
    }

    const url = new URL(request.url);
    const estateId = url.searchParams.get("estateId");

    if (!estateId) {
      return NextResponse.json(
        { error: "Estate ID is required" },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const result = await EstateProperty.findOneAndDelete({
      _id: propertyId,
      estateId,
    }).lean();

    if (!result) {
      return NextResponse.json(
        { error: "Property not found or already deleted" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting property:", error);
    return NextResponse.json(
      { error: "Failed to delete property" },
      { status: 500 }
    );
  }
}
