// src/app/api/contacts/route.ts
// Directory / contacts API for LegatePro

import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/db";
import { Contact } from "../../../models/Contact";

// GET /api/contacts
// Optional query params:
//   estateId: string  -> filter contacts for a specific estate
//   q: string         -> search by name, organization, role, or email
export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();

    // TODO: replace with real ownerId from auth/session
    const ownerId = "demo-user"; // TODO replace with real auth user

    const { searchParams } = new URL(request.url);
    const estateId = searchParams.get("estateId");
    const q = searchParams.get("q")?.trim() ?? "";

    type ContactFilter = {
      ownerId: string;
      estateId?: string;
      $or?: Array<Record<string, unknown>>;
    };
    const filter: ContactFilter = { ownerId };

    if (estateId) {
      filter.estateId = estateId;
    }

    if (q) {
      filter.$or = [
        { name: { $regex: new RegExp(q, "i") } },
        { organization: { $regex: new RegExp(q, "i") } },
        { roleOrRelationship: { $regex: new RegExp(q, "i") } },
        { email: { $regex: new RegExp(q, "i") } },
      ];
    }

    const contacts = await Contact.find(filter).sort({ name: 1 }).lean();

    return NextResponse.json({ contacts }, { status: 200 });
  } catch (error) {
    console.error("GET /api/contacts error", error);
    return NextResponse.json(
      { error: "Unable to load contacts" },
      { status: 500 }
    );
  }
}

// POST /api/contacts
// Creates a new contact in the directory
export async function POST(request: NextRequest) {
  try {
    await connectToDatabase();

    // TODO: replace with real ownerId from auth/session
    const ownerId = "demo-user"; // TODO replace with real auth user

    const body = await request.json();

    const {
      estateId,
      category,
      name,
      organization,
      roleOrRelationship,
      phone,
      email,
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
      notes,
    } = body ?? {};

    if (!name) {
      return NextResponse.json(
        { error: "Name is required for a contact" },
        { status: 400 }
      );
    }

    const contact = await Contact.create({
      ownerId,
      estateId,
      category,
      name,
      organization,
      roleOrRelationship,
      phone,
      email,
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
      notes,
    });

    return NextResponse.json({ contact }, { status: 201 });
  } catch (error) {
    console.error("POST /api/contacts error", error);
    return NextResponse.json(
      { error: "Unable to create contact" },
      { status: 500 }
    );
  }
}
