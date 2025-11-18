import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Contact } from "@/models/Contact";

interface RouteParams {
  params: Promise<{
    estateId: string;
    contactId: string;
  }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { estateId, contactId } = await params;
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const contact = await Contact.findOne({
      _id: contactId,
      estateId,
      ownerId: session.user.id,
    }).lean();

    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    return NextResponse.json({ contact }, { status: 200 });
  } catch (error) {
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
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    await connectToDatabase();

    const updated = await Contact.findOneAndUpdate(
      {
        _id: contactId,
        estateId,
        ownerId: session.user.id,
      },
      filteredUpdates,
      { new: true },
    ).lean();

    if (!updated) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    return NextResponse.json({ contact: updated }, { status: 200 });
  } catch (error) {
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
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const deleted = await Contact.findOneAndDelete({
      _id: contactId,
      estateId,
      ownerId: session.user.id,
    }).lean();

    if (!deleted) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
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