import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { requireEstateAccess, requireEstateEditAccess } from "@/lib/estateAccess";
import { EstateDocument } from "@/models/EstateDocument";
import { logEstateEvent } from "@/lib/estateEvents";

interface RouteParams {
  params: Promise<{
    estateId: string;
    documentId: string;
  }>;
}

type EstateDocumentSubject =
  | "BANKING"
  | "AUTO"
  | "MEDICAL"
  | "INCOME_TAX"
  | "PROPERTY"
  | "INSURANCE"
  | "IDENTITY"
  | "LEGAL"
  | "ESTATE_ACCOUNTING"
  | "RECEIPTS"
  | "OTHER";

type EstateDocumentLean = {
  _id: unknown;
  estateId?: string;
  ownerId?: string;
  subject?: EstateDocumentSubject | string | null;
  label?: string | null;
  location?: string | null;
  url?: string | null;
  tags?: string[] | null;
  notes?: string | null;
  isSensitive?: boolean | null;
  fileName?: string | null;
  fileType?: string | null;
  fileSizeBytes?: number | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
};

const SUBJECT_ALLOWLIST: ReadonlySet<string> = new Set([
  "BANKING",
  "AUTO",
  "MEDICAL",
  "INCOME_TAX",
  "PROPERTY",
  "INSURANCE",
  "IDENTITY",
  "LEGAL",
  "ESTATE_ACCOUNTING",
  "RECEIPTS",
  "OTHER",
]);

function normalizeSubject(value: unknown): EstateDocumentSubject {
  if (typeof value !== "string") return "OTHER";
  const v = value.trim().toUpperCase();
  return SUBJECT_ALLOWLIST.has(v) ? (v as EstateDocumentSubject) : "OTHER";
}

function normalizeOptionalString(value: unknown, maxLen: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  if (!v) return undefined;
  return v.length > maxLen ? v.slice(0, maxLen) : v;
}

function normalizeTags(value: unknown, maxTags = 25, maxLen = 32): string[] {
  const raw: string[] = Array.isArray(value)
    ? value.filter((t: unknown): t is string => typeof t === "string")
    : typeof value === "string"
    ? value.split(",")
    : [];

  const out: string[] = [];
  const seen = new Set<string>();

  for (const t of raw) {
    const v = t.trim().toLowerCase();
    if (!v) continue;
    if (v.length > maxLen) continue;
    if (seen.has(v)) continue;

    seen.add(v);
    out.push(v);

    if (out.length >= maxTags) break;
  }

  return out;
}

function toObjectId(id: string) {
  return mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : null;
}

type EstateRole = "OWNER" | "EDITOR" | "VIEWER";

function getRoleFromAccess(access: unknown): EstateRole | undefined {
  if (!access || typeof access !== "object") return undefined;
  const role = (access as Record<string, unknown>).role;

  if (role === "OWNER" || role === "EDITOR" || role === "VIEWER") {
    return role;
  }

  return undefined;
}

function isResponseLike(value: unknown): value is Response {
  return typeof value === "object" && value !== null && value instanceof Response;
}

function getFailureResponse(access: unknown): NextResponse | undefined {
  if (!access || typeof access !== "object") return undefined;
  const anyAccess = access as Record<string, unknown>;

  // Support older helper shape: { ok: boolean; res: NextResponse }
  if (anyAccess.ok === false && isResponseLike(anyAccess.res)) {
    return anyAccess.res as NextResponse;
  }

  // Support newer helper shape: may directly return a Response/NextResponse on failure
  if (isResponseLike(access)) {
    return access as NextResponse;
  }

  return undefined;
}

function isSensitiveDocument(doc: unknown): boolean {
  if (!doc || typeof doc !== "object") return false;
  return Boolean((doc as Record<string, unknown>).isSensitive);
}

async function safeJson(
  request: NextRequest
): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    const value = await request.json();
    return { ok: true, value };
  } catch {
    return { ok: false };
  }
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { estateId, documentId } = await params;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const documentObjectId = toObjectId(documentId);
    if (!documentObjectId) {
      return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    }

    await connectToDatabase();

    // Any estate member can view documents (VIEWER is read-only).
    const access = await requireEstateAccess({ estateId, userId: session.user.id });
    const failure = getFailureResponse(access);
    if (failure) return failure;

    const document = await EstateDocument.findOne({
      _id: documentObjectId,
      estateId,
    })
      .lean<EstateDocumentLean>()
      .exec();

    if (!document) {
      return NextResponse.json({ ok: false, error: "Document not found" }, { status: 404 });
    }

    const role = getRoleFromAccess(access) ?? "VIEWER";

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

    const documentObjectId = toObjectId(documentId);
    if (!documentObjectId) {
      return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    }

    await connectToDatabase();

    // Editors/owners only.
    const access = await requireEstateEditAccess({ estateId, userId: session.user.id });
    const failure = getFailureResponse(access);
    if (failure) return failure;
    const role = getRoleFromAccess(access);

    // `requireEstateEditAccess` should only allow OWNER/EDITOR.
    // If it ever returns an unexpected shape, fail closed.
    if (role !== "OWNER" && role !== "EDITOR") {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const parsed = await safeJson(request);
    if (!parsed.ok || !parsed.value || typeof parsed.value !== "object") {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const updateObj = parsed.value as Record<string, unknown>;
    const filteredUpdates: Record<string, unknown> = {};

    // Normalize/sanitize each supported field.
    if ("label" in updateObj) {
      const v = normalizeOptionalString(updateObj.label, 200);
      if (v) filteredUpdates.label = v;
    }

    if ("subject" in updateObj) {
      filteredUpdates.subject = normalizeSubject(updateObj.subject);
    }

    if ("notes" in updateObj) {
      const v = normalizeOptionalString(updateObj.notes, 5000);
      filteredUpdates.notes = v ?? "";
    }

    if ("location" in updateObj) {
      const v = normalizeOptionalString(updateObj.location, 200);
      filteredUpdates.location = v ?? "";
    }

    if ("url" in updateObj) {
      const v = normalizeOptionalString(updateObj.url, 2000);
      filteredUpdates.url = v ?? "";
    }

    if ("tags" in updateObj) {
      filteredUpdates.tags = normalizeTags(updateObj.tags);
    }

    let requestedIsSensitive: boolean | undefined;
    if ("isSensitive" in updateObj) {
      requestedIsSensitive = Boolean(updateObj.isSensitive);
      filteredUpdates.isSensitive = requestedIsSensitive;
    }

    // Only OWNER can change a document's sensitivity (either direction).
    if (requestedIsSensitive !== undefined && role !== "OWNER") {
      // We need the current value to know whether this is a toggle.
      const current = await EstateDocument.findOne({
        _id: documentObjectId,
        estateId,
      })
        .select({ isSensitive: 1 })
        .lean<{ isSensitive?: boolean | null }>()
        .exec();

      if (!current) {
        return NextResponse.json({ ok: false, error: "Document not found" }, { status: 404 });
      }

      const currentIsSensitive = Boolean(current.isSensitive);
      if (currentIsSensitive !== requestedIsSensitive) {
        return NextResponse.json(
          { ok: false, error: "Only the owner can change sensitivity" },
          { status: 403 }
        );
      }

      // If the value is the same, drop it (no-op) so we don't imply a permissioned change.
      delete filteredUpdates.isSensitive;
    }

    // If nothing valid remains after normalization, fail.
    if (Object.keys(filteredUpdates).length === 0) {
      return NextResponse.json(
        { ok: false, error: "No valid fields provided" },
        { status: 400 }
      );
    }

    const updated = await EstateDocument.findOneAndUpdate(
      {
        _id: documentObjectId,
        estateId,
      },
      filteredUpdates,
      { new: true, runValidators: true }
    )
      .lean<EstateDocumentLean>()
      .exec();

    if (!updated) {
      return NextResponse.json({ ok: false, error: "Document not found" }, { status: 404 });
    }

    try {
      await logEstateEvent({
        ownerId: session.user.id,
        estateId,
        type: "DOCUMENT_UPDATED",
        summary: "Document updated",
        detail: `Updated document ${documentId}`,
        meta: {
          documentId,
          updatedFields: Object.keys(filteredUpdates),
          isSensitive: Boolean((updated as EstateDocumentLean | null | undefined)?.isSensitive),
          actorId: session.user.id,
        },
      });
    } catch (error) {
      console.error("[logEstateEvent DOCUMENT_UPDATED] Error:", error);
    }

    return NextResponse.json({ ok: true, document: updated }, { status: 200 });
  } catch (error) {
    if (typeof error === "object" && error !== null && "name" in error) {
      const name = (error as { name?: unknown }).name;
      if (name === "ValidationError") {
        return NextResponse.json(
          { ok: false, error: "Invalid document fields" },
          { status: 400 }
        );
      }
    }
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

    const documentObjectId = toObjectId(documentId);
    if (!documentObjectId) {
      return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    }

    await connectToDatabase();

    // Editors/owners only.
    const access = await requireEstateEditAccess({ estateId, userId: session.user.id });
    const failure = getFailureResponse(access);
    if (failure) return failure;
    const role = getRoleFromAccess(access);

    // `requireEstateEditAccess` should only allow OWNER/EDITOR.
    // If it ever returns an unexpected shape, fail closed.
    if (role !== "OWNER" && role !== "EDITOR") {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const deleted = await EstateDocument.findOneAndDelete({
      _id: documentObjectId,
      estateId,
    })
      .lean<EstateDocumentLean>()
      .exec();

    if (!deleted) {
      return NextResponse.json({ ok: false, error: "Document not found" }, { status: 404 });
    }

    try {
      await logEstateEvent({
        ownerId: session.user.id,
        estateId,
        type: "DOCUMENT_DELETED",
        summary: "Document deleted",
        detail: `Deleted document ${documentId}`,
        meta: {
          documentId,
          wasSensitive: Boolean((deleted as EstateDocumentLean | null | undefined)?.isSensitive),
          actorId: session.user.id,
        },
      });
    } catch (error) {
      console.error("[logEstateEvent DOCUMENT_DELETED] Error:", error);
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