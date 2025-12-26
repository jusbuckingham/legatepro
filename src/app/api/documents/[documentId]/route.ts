import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { EstateDocument } from "@/models/EstateDocument";
import { logActivity } from "@/lib/activity";
import { requireEstateAccess, requireEstateEditAccess } from "@/lib/estateAccess";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteParams = { documentId: string };

function toObjectId(id: string) {
  return mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : null;
}

function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

function pick<T extends Record<string, unknown>>(obj: T, keys: Array<keyof T>) {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (k in obj) out[String(k)] = obj[k];
  }
  return out;
}

async function loadDocumentOr404(documentId: string) {
  const docObjectId = toObjectId(documentId);
  if (!docObjectId) return { res: jsonError(400, "Invalid id") };

  await connectToDatabase();

  const document = await EstateDocument.findById(docObjectId);
  if (!document) return { res: jsonError(404, "Document not found") };

  return { document };
}

async function enforceViewerAccessForDocument(
  estateId: string,
  userId: string,
  isSensitive: boolean
) {
  let access: { role?: string } | undefined;

  try {
    access = await requireEstateAccess({ estateId, userId });
  } catch {
    return { res: jsonError(403, "Forbidden") };
  }

  // VIEWER cannot access sensitive docs; return 404 to avoid leaking existence
  if (isSensitive && access.role === "VIEWER") {
    return { res: jsonError(404, "Document not found") };
  }

  return { access };
}

async function enforceEditorAccessForDocument(
  estateId: string,
  userId: string,
  isSensitive: boolean
) {
  let access: { role?: string } | undefined;

  try {
    access = await requireEstateEditAccess({ estateId, userId });
  } catch {
    return { res: jsonError(403, "Forbidden") };
  }

  // Defense in depth: VIEWER should never reach this, but keep consistent behavior.
  if (isSensitive && access.role === "VIEWER") {
    return { res: jsonError(404, "Document not found") };
  }

  return { access };
}

/**
 * GET /api/documents/[documentId]
 * - Estate members can view
 * - VIEWER cannot view sensitive docs (404)
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<RouteParams> }
) {
  try {
    const { documentId } = await context.params;

    const session = await auth();
    if (!session?.user?.id) return jsonError(401, "Unauthorized");

    const loaded = await loadDocumentOr404(documentId);
    if ("res" in loaded) return loaded.res;

    const document = loaded.document;
    const estateId = String(document.estateId);

    const accessCheck = await enforceViewerAccessForDocument(
      estateId,
      session.user.id,
      Boolean(document.isSensitive)
    );
    if ("res" in accessCheck) return accessCheck.res;

    return NextResponse.json({ ok: true, document }, { status: 200 });
  } catch (error) {
    console.error("[DOCUMENT_GET]", error);
    return jsonError(500, "Failed to fetch document");
  }
}

/**
 * PATCH /api/documents/[documentId]
 * - Requires editor/owner
 * - Uses allowlist updates to avoid accidental schema corruption
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<RouteParams> }
) {
  try {
    const { documentId } = await context.params;

    const session = await auth();
    if (!session?.user?.id) return jsonError(401, "Unauthorized");

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return jsonError(400, "Invalid JSON");
    }

    const loaded = await loadDocumentOr404(documentId);
    if ("res" in loaded) return loaded.res;

    const existing = loaded.document;
    const estateId = String(existing.estateId);

    const accessCheck = await enforceEditorAccessForDocument(
      estateId,
      session.user.id,
      Boolean(existing.isSensitive)
    );
    if ("res" in accessCheck) return accessCheck.res;

    // Prevent VIEWER from making a doc sensitive, even if access code changes later.
    if (body?.isSensitive === true && accessCheck.access?.role === "VIEWER") {
      return jsonError(403, "Forbidden");
    }

    // Keep consistent with GET/DELETE: VIEWER gets 404 for sensitive docs
    if (Boolean(existing.isSensitive) && accessCheck.access?.role === "VIEWER") {
      return jsonError(404, "Document not found");
    }

    const previousSnapshot = {
      label: existing.label ?? null,
      subject: existing.subject ?? null,
      isSensitive: Boolean(existing.isSensitive),
      tags: Array.isArray(existing.tags) ? existing.tags : [],
    };

    // Allowlist fields only
    const updates = pick(body, [
      "subject",
      "label",
      "location",
      "url",
      "tags",
      "notes",
      "isSensitive",
      "fileName",
      "fileType",
      "fileSizeBytes",
    ]);

    Object.assign(existing, updates);
    const document = await existing.save();

    // Activity log: document updated (best-effort)
    try {
      await logActivity({
        estateId: String(document.estateId),
        kind: "DOCUMENT",
        action: "updated",
        entityId: String(document._id),
        message: `Document updated: ${String(document.label ?? "Untitled")}`,
        snapshot: {
          previous: previousSnapshot,
          current: {
            label: document.label ?? null,
            subject: document.subject ?? null,
            isSensitive: Boolean(document.isSensitive),
            tags: Array.isArray(document.tags) ? document.tags : [],
          },
        },
      });
    } catch {
      // no-op
    }

    return NextResponse.json({ ok: true, document }, { status: 200 });
  } catch (error) {
    console.error("[DOCUMENT_PATCH]", error);
    return jsonError(500, "Failed to update document");
  }
}

/**
 * PUT /api/documents/[documentId]
 * Alias to PATCH for backward compatibility with existing callers.
 */
export async function PUT(
  req: NextRequest,
  context: { params: Promise<RouteParams> }
) {
  return PATCH(req, context);
}

/**
 * DELETE /api/documents/[documentId]
 * - Requires editor/owner
 */
export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<RouteParams> }
) {
  try {
    const { documentId } = await context.params;

    const session = await auth();
    if (!session?.user?.id) return jsonError(401, "Unauthorized");

    const loaded = await loadDocumentOr404(documentId);
    if ("res" in loaded) return loaded.res;

    const document = loaded.document;
    const estateId = String(document.estateId);

    const accessCheck = await enforceEditorAccessForDocument(
      estateId,
      session.user.id,
      Boolean(document.isSensitive)
    );
    if ("res" in accessCheck) return accessCheck.res;

    if (Boolean(document.isSensitive) && accessCheck.access?.role === "VIEWER") {
      return jsonError(404, "Document not found");
    }

    await document.deleteOne();

    // Activity log: document deleted (best-effort)
    try {
      await logActivity({
        estateId: String(document.estateId),
        kind: "DOCUMENT",
        action: "deleted",
        entityId: String(document._id),
        message: `Document deleted: ${String(document.label ?? "Untitled")}`,
        snapshot: {
          label: document.label ?? null,
          subject: document.subject ?? null,
          isSensitive: Boolean(document.isSensitive),
          tags: Array.isArray(document.tags) ? document.tags : [],
        },
      });
    } catch {
      // no-op
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("[DOCUMENT_DELETE]", error);
    return jsonError(500, "Failed to delete document");
  }
}