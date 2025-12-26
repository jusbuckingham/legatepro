// src/app/api/documents/route.ts
// Global estate document index API for LegatePro (metadata only — not file upload yet)

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { requireEstateAccess, requireEstateEditAccess } from "@/lib/estateAccess";
import { Estate } from "@/models/Estate";
import { EstateDocument } from "@/models/EstateDocument";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DocumentFilter = {
  estateId?: { $in: string[] };
  subject?: string;
  $or?: Array<Record<string, unknown>>;
};

interface CreateDocumentPayload {
  estateId: string;
  subject: string;
  label: string;
  location?: string;
  url?: string;
  tags?: string | string[];
  notes?: string;
  isSensitive?: boolean;
  fileName?: string;
  fileType?: string;
  fileSizeBytes?: number;
}

function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

function isValidId(id: string) {
  return mongoose.Types.ObjectId.isValid(id);
}

async function listAccessibleEstateIds(userId: string) {
  const estates = await Estate.find(
    { $or: [{ ownerId: userId }, { "collaborators.userId": userId }] },
    { _id: 1 }
  )
    .lean()
    .exec();

  return estates.map((e) => String((e as { _id: unknown })._id));
}

async function enforceViewerAccess(estateId: string, userId: string) {
  try {
    await requireEstateAccess({ estateId, userId });
    return null;
  } catch {
    return jsonError(403, "Forbidden");
  }
}

async function enforceEditorAccess(estateId: string, userId: string) {
  try {
    await requireEstateEditAccess({ estateId, userId });
    return null;
  } catch {
    return jsonError(403, "Insufficient role");
  }
}

// GET /api/documents
// Optional query params:
//   estateId: string              -> filter documents for a specific estate
//   subject: string               -> filter by subject/category
//   q: string                     -> search by label, location, tags, or notes
export async function GET(request: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return jsonError(401, "Unauthorized");

  try {
    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const estateId = searchParams.get("estateId");
    const subject = searchParams.get("subject") ?? undefined;
    const q = searchParams.get("q")?.trim() ?? "";

    if (estateId && !isValidId(estateId)) {
      return jsonError(400, "Invalid estateId");
    }

    // If a specific estateId is requested, enforce viewer access on that estate.
    if (estateId) {
      const res = await enforceViewerAccess(estateId, userId);
      if (res) return res;
    }

    // Otherwise, only return docs for estates the user can access.
    const accessibleEstateIds = estateId ? [estateId] : await listAccessibleEstateIds(userId);

    const filter: DocumentFilter = {
      estateId: { $in: accessibleEstateIds },
    };

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
      .sort({ createdAt: -1, updatedAt: -1 })
      .lean()
      .exec();

    return NextResponse.json({ ok: true, documents }, { status: 200 });
  } catch (error) {
    console.error("GET /api/documents error", error);
    return NextResponse.json({ error: "Unable to load documents" }, { status: 500 });
  }
}

// POST /api/documents
// Creates a new estate document index entry (metadata only)
export async function POST(request: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return jsonError(401, "Unauthorized");

  try {
    await connectToDatabase();

    const rawBody = (await request.json()) as Partial<CreateDocumentPayload> | null;

    const {
      estateId,
      subject,
      label,
      location,
      url,
      tags: incomingTags,
      notes,
      isSensitive: incomingIsSensitive,
      fileName,
      fileType,
      fileSizeBytes,
    } = rawBody ?? {};

    if (!estateId) return jsonError(400, "estateId is required");
    if (!isValidId(estateId)) return jsonError(400, "Invalid estateId");
    if (!subject) return jsonError(400, "subject is required");
    if (!label) return jsonError(400, "label is required");

    // Creating documents requires Owner/Editor on the estate.
    const res = await enforceEditorAccess(estateId, userId);
    if (res) return res;

    const tags = Array.isArray(incomingTags)
      ? incomingTags.map((t) => String(t))
      : incomingTags
        ? [String(incomingTags)]
        : [];

    const isSensitive = Boolean(incomingIsSensitive);

    // Keep ownerId consistent with the estate owner (Estate.ownerId is a string in this project).
    let ownerId = userId;
    try {
      const estate = await Estate.findById(estateId).select({ ownerId: 1 }).lean().exec();
      const o = (estate as { ownerId?: unknown } | null)?.ownerId;
      if (o != null) ownerId = String(o);
    } catch {
      // ignore
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

    return NextResponse.json({ ok: true, document }, { status: 201 });
  } catch (error) {
    console.error("POST /api/documents error", error);
    return NextResponse.json({ error: "Unable to create document" }, { status: 500 });
  }
}
