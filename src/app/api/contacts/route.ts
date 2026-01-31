// src/app/api/contacts/route.ts
// Directory / contacts API for LegatePro

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase, serializeMongoDoc } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Contact } from "@/models/Contact";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeId(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return v.length > 0 ? v : null;
}

function buildOwnerOr(userId: string): Record<string, unknown>[] {
  // Support both string IDs and legacy ObjectId storage.
  const clauses: Record<string, unknown>[] = [{ ownerId: userId }];
  if (mongoose.Types.ObjectId.isValid(userId)) {
    clauses.push({ ownerId: new mongoose.Types.ObjectId(userId) });
  }
  return clauses;
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/contacts
// Optional query params:
//   estateId: string  -> filter contacts for a specific estate
//   q: string         -> search by name, organization, role, or email
export async function GET(request: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const estateId = normalizeId(searchParams.get("estateId"));

    const qRaw = normalizeId(searchParams.get("q"));
    const q = qRaw ? qRaw.slice(0, 120) : ""; // keep it small & predictable

    const filter: Record<string, unknown> = {
      $or: buildOwnerOr(userId),
    };

    if (estateId) {
      // Contacts store linked estates as string IDs array in this project.
      // If you only ever store ObjectId hex strings, this validation keeps things tidy.
      if (!mongoose.Types.ObjectId.isValid(estateId)) {
        return NextResponse.json(
          { ok: false, error: "Invalid estateId" },
          { status: 400 },
        );
      }
      filter.estates = estateId;
    }

    if (q) {
      const pattern = new RegExp(escapeRegex(q), "i");
      filter.$or = [
        { name: pattern },
        { organization: pattern },
        { roleOrRelationship: pattern },
        { email: pattern },
      ];
    }

    const contactsRaw = await Contact.find(filter).sort({ name: 1 }).lean().exec();

    const contacts = contactsRaw.map((c) =>
      serializeMongoDoc(c as Record<string, unknown>),
    );

    return NextResponse.json({ ok: true, contacts }, { status: 200 });
  } catch (error) {
    console.error("GET /api/contacts error", error);
    return NextResponse.json(
      { ok: false, error: "Unable to load contacts" },
      { status: 500 },
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

  const ownerId = session.user.id;

  try {
    await connectToDatabase();

    const body = (await request.json()) as Record<string, unknown> | null;

    if (!body) {
      return NextResponse.json(
        { ok: false, error: "Request body is required" },
        { status: 400 },
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

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: "Name is required for a contact" },
        { status: 400 },
      );
    }

    const created = await Contact.create({
      ownerId,
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
      { status: 500 },
    );
  }
}
