import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase, serializeMongoDoc } from "@/lib/db";
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

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function isInvalidIdError(err: unknown): boolean {
  const message = getErrorMessage(err);
  return (
    message.includes("Invalid estateId") ||
    message.includes("Invalid contactId") ||
    isCastError(err)
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

    const contactRaw = await Contact.findOne({
      _id: contactObjectId,
      ownerId: session.user.id,
      $or: [{ estateId: estateObjectId }, { estates: estateObjectId }],
    })
      .lean()
      .exec();

    const contact = contactRaw ? (serializeMongoDoc(contactRaw) as Record<string, unknown>) : null;

    if (!contact) {
      return NextResponse.json({ ok: false, error: "Contact not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, contact }, { status: 200 });
  } catch (error) {
    if (isInvalidIdError(error)) {
      return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    }
    console.error("[GET /api/estates/[estateId]/contacts/[contactId]] Error:", error);
    return NextResponse.json({ ok: false, error: "Failed to fetch contact" }, { status: 500 });
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

    let updates: unknown;
    try {
      updates = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    if (typeof updates !== "object" || updates === null) {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }
    const updatesObj = updates as Record<string, unknown>;

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
      if (key in updatesObj) {
        const v = updatesObj[key];
        // Avoid accidentally writing `undefined` into the document.
        if (v !== undefined) {
          filteredUpdates[key] = v;
        }
      }
    }

    if (Object.keys(filteredUpdates).length === 0) {
      return NextResponse.json({ ok: false, error: "No valid fields to update" }, { status: 400 });
    }

    await connectToDatabase();

    const updatedRaw = await Contact.findOneAndUpdate(
      {
        _id: contactObjectId,
        ownerId: session.user.id,
        $or: [{ estateId: estateObjectId }, { estates: estateObjectId }],
      },
      filteredUpdates,
      { new: true, runValidators: true },
    )
      .lean()
      .exec();

    const updated = updatedRaw ? (serializeMongoDoc(updatedRaw) as Record<string, unknown>) : null;

    if (!updated) {
      return NextResponse.json({ ok: false, error: "Contact not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, contact: updated }, { status: 200 });
  } catch (error) {
    if (isInvalidIdError(error)) {
      return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    }
    if (typeof error === "object" && error !== null && "name" in error) {
      const name = (error as { name?: unknown }).name;
      if (name === "ValidationError") {
        return NextResponse.json(
          { ok: false, error: "Invalid contact fields" },
          { status: 400 }
        );
      }
    }
    console.error("[PATCH /api/estates/[estateId]/contacts/[contactId]] Error:", error);
    return NextResponse.json({ ok: false, error: "Failed to update contact" }, { status: 500 });
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

    const deletedRaw = await Contact.findOneAndDelete({
      _id: contactObjectId,
      ownerId: session.user.id,
      $or: [{ estateId: estateObjectId }, { estates: estateObjectId }],
    })
      .lean()
      .exec();

    const deleted = deletedRaw ? (serializeMongoDoc(deletedRaw) as Record<string, unknown>) : null;

    if (!deleted) {
      return NextResponse.json({ ok: false, error: "Contact not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    if (isInvalidIdError(error)) {
      return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    }
    console.error("[DELETE /api/estates/[estateId]/contacts/[contactId]] Error:", error);
    return NextResponse.json({ ok: false, error: "Failed to delete contact" }, { status: 500 });
  }
}