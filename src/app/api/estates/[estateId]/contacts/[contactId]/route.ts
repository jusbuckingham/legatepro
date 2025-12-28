import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Contact } from "@/models/Contact";
import mongoose from "mongoose";

interface RouteParams {
  params: Promise<{
    estateId: string;
    contactId: string;
  }>;
}

function toObjectId(value: string, label: string): mongoose.Types.ObjectId {
  if (!mongoose.isValidObjectId(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return new mongoose.Types.ObjectId(value);
}

function isCastError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as { name?: unknown }).name === "CastError"
  );
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { estateId, contactId } = await params;
    const estateObjectId = toObjectId(estateId, "estateId");
    const contactObjectId = toObjectId(contactId, "contactId");
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const contact = await Contact.findOne({
      _id: contactObjectId,
      ownerId: session.user.id,
      $or: [{ estateId: estateObjectId }, { estates: estateObjectId }],
    }).lean();

    if (!contact) {
      return NextResponse.json({ ok: false, error: "Contact not found" }, { status: 404 });
    }

    return NextResponse.json({ contact }, { status: 200 });
  } catch (error) {
    if (String(error).includes("Invalid estateId") || String(error).includes("Invalid contactId") || isCastError(error)) {
      return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    }
    console.error(
      "[GET /api/estates/[estateId]/contacts/[contactId]] Error:",
      error,
    );
    return NextResponse.json(
      { error: "Failed to fetch contact" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { estateId, contactId } = await params;
    const estateObjectId = toObjectId(estateId, "estateId");
    const contactObjectId = toObjectId(contactId, "contactId");
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const updates = await request.json();

    const allowedFields = [
      "name",
      "relationship",
      "role",
      "email",
      "phone",
      "addressLine1",
      "addressLine2",
      "city",
      "state",
      "postalCode",
      "country",
      "notes",
      "isPrimary",
    ];

    const filteredUpdates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in updates) {
        filteredUpdates[key] = updates[key];
      }
    }

    if (Object.keys(filteredUpdates).length === 0) {
      return NextResponse.json({ ok: false, error: "No valid fields to update" }, { status: 400 });
    }

    await connectToDatabase();

    const updated = await Contact.findOneAndUpdate(
      {
        _id: contactObjectId,
        ownerId: session.user.id,
        $or: [{ estateId: estateObjectId }, { estates: estateObjectId }],
      },
      filteredUpdates,
      { new: true },
    ).lean();

    if (!updated) {
      return NextResponse.json({ ok: false, error: "Contact not found" }, { status: 404 });
    }

    return NextResponse.json({ contact: updated }, { status: 200 });
  } catch (error) {
    if (String(error).includes("Invalid estateId") || String(error).includes("Invalid contactId") || isCastError(error)) {
      return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    }
    console.error(
      "[PATCH /api/estates/[estateId]/contacts/[contactId]] Error:",
      error,
    );
    return NextResponse.json(
      { error: "Failed to update contact" },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { estateId, contactId } = await params;
    const estateObjectId = toObjectId(estateId, "estateId");
    const contactObjectId = toObjectId(contactId, "contactId");
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const deleted = await Contact.findOneAndDelete({
      _id: contactObjectId,
      ownerId: session.user.id,
      $or: [{ estateId: estateObjectId }, { estates: estateObjectId }],
    }).lean();

    if (!deleted) {
      return NextResponse.json({ ok: false, error: "Contact not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    if (String(error).includes("Invalid estateId") || String(error).includes("Invalid contactId") || isCastError(error)) {
      return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    }
    console.error(
      "[DELETE /api/estates/[estateId]/contacts/[contactId]] Error:",
      error,
    );
    return NextResponse.json(
      { error: "Failed to delete contact" },
      { status: 500 },
    );
  }
}