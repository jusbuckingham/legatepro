import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Contact } from "@/models/Contact";

interface RouteParams {
  params: Promise<{
    estateId: string;
  }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { estateId } = await params;
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const contacts = await Contact.find({
      estateId,
      ownerId: session.user.id,
    })
      .sort({ name: 1 })
      .lean();

    return NextResponse.json({ contacts }, { status: 200 });
  } catch (error) {
    console.error("[GET /api/estates/[estateId]/contacts] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch contacts" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { estateId } = await params;
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      name?: string;
      relationship?: string;
      role?: string;
      email?: string;
      phone?: string;
      addressLine1?: string;
      addressLine2?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
      notes?: string;
      isPrimary?: boolean;
    };

    if (!body.name || body.name.trim().length === 0) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 },
      );
    }

    await connectToDatabase();

    const contact = await Contact.create({
      ownerId: session.user.id,
      estateId,
      name: body.name.trim(),
      relationship: body.relationship?.trim(),
      role: body.role,
      email: body.email?.trim(),
      phone: body.phone?.trim(),
      addressLine1: body.addressLine1?.trim(),
      addressLine2: body.addressLine2?.trim(),
      city: body.city?.trim(),
      state: body.state?.trim(),
      postalCode: body.postalCode?.trim(),
      country: body.country?.trim(),
      notes: body.notes?.trim(),
      isPrimary: body.isPrimary ?? false,
    });

    return NextResponse.json({ contact }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/estates/[estateId]/contacts] Error:", error);
    return NextResponse.json(
      { error: "Failed to create contact" },
      { status: 500 },
    );
  }
}