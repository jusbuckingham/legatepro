// src/app/api/documents/route.ts
// Estate document index API for LegatePro (metadata only — not file upload yet)

import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/db";
import { EstateDocument } from "../../../models/EstateDocument";

// GET /api/documents
// Optional query params:
//   estateId: string              -> filter documents for a specific estate
//   subject: string               -> filter by subject/category
//   q: string                     -> search by label, location, tags, or notes
export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();

    // TODO: replace with real ownerId from auth/session
    const ownerId = "demo-user";

    const { searchParams } = new URL(request.url);
    const estateId = searchParams.get("estateId");
    const subject = searchParams.get("subject");
    const q = searchParams.get("q")?.trim() ?? "";

    const filter: Record<string, unknown> = { ownerId };

    if (estateId) {
      filter.estateId = estateId;
    }

    if (subject) {
      filter.subject = subject;
    }

    if (q) {
      filter.$or = [
        { label: { $regex: q, $options: "i" } },
        { location: { $regex: q, $options: "i" } },
        { notes: { $regex: q, $options: "i" } },
        { tags: { $elemMatch: { $regex: q, $options: "i" } } },
      ];
    }

    const documents = await EstateDocument.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ documents }, { status: 200 });
  } catch (error) {
    console.error("GET /api/documents error", error);
    return NextResponse.json(
      { error: "Unable to load documents" },
      { status: 500 }
    );
  }
}

// POST /api/documents
// Creates a new estate document index entry (metadata only)
export async function POST(request: NextRequest) {
  try {
    await connectToDatabase();

    // TODO: replace with real ownerId from auth/session
    const ownerId = "demo-user";

    const body = await request.json();

    const {
      estateId,
      subject,
      label,
      location,
      url,
      tags,
      notes,
      isSensitive,
      fileName,
      fileType,
      fileSizeBytes,
    } = body ?? {};

    if (!estateId) {
      return NextResponse.json(
        { error: "estateId is required" },
        { status: 400 }
      );
    }

    if (!subject) {
      return NextResponse.json(
        { error: "subject is required" },
        { status: 400 }
      );
    }

    if (!label) {
      return NextResponse.json(
        { error: "label is required" },
        { status: 400 }
      );
    }

    const document = await EstateDocument.create({
      ownerId,
      estateId,
      subject,
      label,
      location,
      url,
      tags,
      notes,
      isSensitive,
      fileName,
      fileType,
      fileSizeBytes,
    });

    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    console.error("POST /api/documents error", error);
    return NextResponse.json(
      { error: "Unable to create document" },
      { status: 500 }
    );
  }
}
