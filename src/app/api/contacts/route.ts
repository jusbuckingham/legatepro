// src/app/api/contacts/route.ts
// Directory / contacts API for LegatePro

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase, serializeMongoDoc } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Contact } from "@/models/Contact";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function toObjectId(id: string) {
  return mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : null;
}

// GET /api/contacts
// Optional query params:
//   estateId: string  -> filter contacts for a specific estate
//   q: string         -> search by name, organization, role, or email
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const ownerObjectId = toObjectId(session.user.id);
  if (!ownerObjectId) {
    return NextResponse.json({ ok: false, error: "Invalid user id" }, { status: 400 });
  }

  try {
    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const estateId = searchParams.get("estateId");
    const q = searchParams.get("q")?.trim() ?? "";

    const filter: Record<string, unknown> = {
      ownerId: ownerObjectId,
    };

    if (estateId) {
      const estateObjectId = toObjectId(estateId);
      if (!estateObjectId) {
        return NextResponse.json({ ok: false, error: "Invalid estateId" }, { status: 400 });
      }
      // Contacts store linked estates as string IDs array in this project
      filter.estates = String(estateObjectId);
    }

    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { organization: { $regex: q, $options: "i" } },
        { roleOrRelationship: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
      ];
    }

    const contactsRaw = await Contact.find(filter)
      .sort({ name: 1 })
      .lean()
      .exec();

    const contacts = contactsRaw.map((c) =>
      serializeMongoDoc(c as Record<string, unknown>),
    );

    return NextResponse.json({ ok: true, contacts }, { status: 200 });
  } catch (error) {
    console.error("GET /api/contacts error", error);
    return NextResponse.json(
      { ok: false, error: "Unable to load contacts" },
      { status: 500 }
    );
  }
}

// POST /api/contacts
// Creates a new contact in the directory
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const ownerObjectId = toObjectId(session.user.id);
  if (!ownerObjectId) {
    return NextResponse.json({ ok: false, error: "Invalid user id" }, { status: 400 });
  }

  try {
    await connectToDatabase();

    const body = (await request.json()) as Record<string, unknown> | null;

    if (!body) {
      return NextResponse.json(
        { error: "Request body is required" },
        { status: 400 }
      );
    }

    const {
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
    } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json(
        { error: "Name is required for a contact" },
        { status: 400 }
      );
    }

    const created = await Contact.create({
      ownerId: ownerObjectId,
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
      estates: [], // linked later via /api/estates/[estateId]/contacts
    });

    const contact = serializeMongoDoc(
      (created.toObject?.() ?? (created as unknown as Record<string, unknown>)) as Record<
        string,
        unknown
      >,
    );

    return NextResponse.json({ ok: true, contact }, { status: 201 });
  } catch (error) {
    console.error("POST /api/contacts error", error);
    return NextResponse.json(
      { ok: false, error: "Unable to create contact" },
      { status: 500 }
    );
  }
}
