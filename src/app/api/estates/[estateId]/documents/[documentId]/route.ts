import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { requireEstateAccess, requireEstateEditAccess } from "@/lib/estateAccess";
import { EstateDocument } from "@/models/EstateDocument";

interface RouteParams {
  params: Promise<{
    estateId: string;
    documentId: string;
  }>;
}

type EstateDocumentLean = Record<string, unknown>;

function toObjectId(id: string) {
  return mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : null;
}

function safeJson(request: NextRequest): Promise<{ ok: true; value: unknown } | { ok: false }> {
  return request
    .json()
    .then((value) => ({ ok: true as const, value }))
    .catch(() => ({ ok: false as const }));
}

function getRoleFromAccess(access: unknown): string | undefined {
  if (!access || typeof access !== "object") return undefined;
  const role = (access as Record<string, unknown>).role;
  return typeof role === "string" ? role : undefined;
}

function isSensitiveDocument(doc: unknown): boolean {
  if (!doc || typeof doc !== "object") return false;
  return Boolean((doc as Record<string, unknown>).isSensitive);
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { estateId, documentId } = await params;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const estateObjectId = toObjectId(estateId);
    const documentObjectId = toObjectId(documentId);
    if (!estateObjectId || !documentObjectId) {
      return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    }

    await connectToDatabase();

    // Any estate member can view documents (VIEWER is read-only).
    const access = await requireEstateAccess({ estateId, userId: session.user.id });

    const document = await EstateDocument.findOne({
      _id: documentObjectId,
      estateId: estateObjectId,
    })
      .lean<EstateDocumentLean>()
      .exec();

    if (!document) {
      return NextResponse.json({ ok: false, error: "Document not found" }, { status: 404 });
    }

    const role = getRoleFromAccess(access);

    // Viewers cannot see sensitive documents.
    if (role === "VIEWER" && isSensitiveDocument(document)) {
      return NextResponse.json({ ok: false, error: "Document not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, document }, { status: 200 });
  } catch (error) {
    console.error("[GET /api/estates/[estateId]/documents/[documentId]] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch document" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { estateId, documentId } = await params;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const estateObjectId = toObjectId(estateId);
    const documentObjectId = toObjectId(documentId);
    if (!estateObjectId || !documentObjectId) {
      return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    }

    await connectToDatabase();

    // Editors/owners only.
    const access = await requireEstateEditAccess({ estateId, userId: session.user.id });
    const role = getRoleFromAccess(access);

    // `requireEstateEditAccess` should only allow OWNER/EDITOR.
    // If it ever returns an unexpected shape, fail closed.
    if (!role) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const parsed = await safeJson(request);
    if (!parsed.ok || !parsed.value || typeof parsed.value !== "object") {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const updateObj = parsed.value as Record<string, unknown>;

    const allowedFields = [
      "label",
      "subject",
      "notes",
      "location",
      "url",
      "tags",
      "isSensitive",
    ] as const;

    const filteredUpdates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in updateObj) {
        filteredUpdates[key] = updateObj[key];
      }
    }

    // Normalize tags if provided
    if ("tags" in filteredUpdates) {
      const raw = filteredUpdates.tags;
      const normalized = Array.isArray(raw)
        ? raw
            .filter((t: unknown): t is string => typeof t === "string")
            .map((t) => t.trim())
            .filter(Boolean)
        : typeof raw === "string"
        ? raw
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [];

      filteredUpdates.tags = normalized;
    }

    if (Object.keys(filteredUpdates).length === 0) {
      return NextResponse.json(
        { ok: false, error: "No valid fields provided" },
        { status: 400 }
      );
    }

    const updated = await EstateDocument.findOneAndUpdate(
      {
        _id: documentObjectId,
        estateId: estateObjectId,
      },
      filteredUpdates,
      { new: true, runValidators: true }
    )
      .lean<EstateDocumentLean>()
      .exec();

    if (!updated) {
      return NextResponse.json({ ok: false, error: "Document not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, document: updated }, { status: 200 });
  } catch (error) {
    console.error("[PATCH /api/estates/[estateId]/documents/[documentId]] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to update document" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { estateId, documentId } = await params;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const estateObjectId = toObjectId(estateId);
    const documentObjectId = toObjectId(documentId);
    if (!estateObjectId || !documentObjectId) {
      return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    }

    await connectToDatabase();

    // Editors/owners only.
    const access = await requireEstateEditAccess({ estateId, userId: session.user.id });
    const role = getRoleFromAccess(access);

    // `requireEstateEditAccess` should only allow OWNER/EDITOR.
    // If it ever returns an unexpected shape, fail closed.
    if (!role) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const deleted = await EstateDocument.findOneAndDelete({
      _id: documentObjectId,
      estateId: estateObjectId,
    })
      .lean<EstateDocumentLean>()
      .exec();

    if (!deleted) {
      return NextResponse.json({ ok: false, error: "Document not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("[DELETE /api/estates/[estateId]/documents/[documentId]] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to delete document" },
      { status: 500 }
    );
  }
}