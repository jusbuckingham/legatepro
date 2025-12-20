// src/app/api/documents/route.ts
// Global estate document index API for LegatePro (metadata only — not file upload yet)

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import * as EstateAccess from "@/lib/estateAccess";
import { Estate } from "@/models/Estate";
import { EstateDocument } from "@/models/EstateDocument";

type EstateRole = "OWNER" | "EDITOR" | "VIEWER";

type CollaboratorLean = {
  userId: unknown;
  role?: unknown;
};

type EstateLean = {
  _id: unknown;
  ownerId?: unknown;
  collaborators?: CollaboratorLean[];
};

type EstateIdOnlyLean = {
  _id: unknown;
};

type DocumentFilter = {
  estateId?: string | { $in: string[] };
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

function normalizeRole(input: unknown): EstateRole | null {
  if (input === "OWNER" || input === "EDITOR" || input === "VIEWER") return input;
  return null;
}

function getUserEstateRole(estate: EstateLean, userId: string): EstateRole | null {
  const ownerId = estate?.ownerId != null ? String(estate.ownerId) : null;
  if (ownerId && ownerId === userId) return "OWNER";

  const collaborators: CollaboratorLean[] = Array.isArray(estate?.collaborators)
    ? estate.collaborators
    : [];

  const match = collaborators.find((c) => String(c.userId) === userId);
  return normalizeRole(match?.role);
}

async function getAccessibleEstateIds(userId: string) {
  const estates = (await Estate.find(
    {
      $or: [{ ownerId: userId }, { "collaborators.userId": userId }],
    },
    { _id: 1 }
  )
    .lean()
    .exec()) as unknown as EstateIdOnlyLean[];

  return estates.map((e) => String(e._id));
}

async function requireEstateRole(
  estateId: string,
  userId: string,
  allowed: EstateRole[]
): Promise<{ ok: true; estate: EstateLean; role: EstateRole } | { ok: false; res: NextResponse }> {
  const estate = (await Estate.findById(estateId).lean().exec()) as unknown as EstateLean | null;
  if (!estate) return { ok: false, res: jsonError(404, "Estate not found") };

  const role = getUserEstateRole(estate, userId);
  if (!role) return { ok: false, res: jsonError(403, "Forbidden") };
  if (!allowed.includes(role)) return { ok: false, res: jsonError(403, "Insufficient role") };

  return { ok: true, estate, role };
}

// --- Centralized/fallback estate access helpers ---
type RequireAccessFn = (args: { estateId: string; userId?: string }) => Promise<unknown>;

function pickAccessFns() {
  const mod = EstateAccess as unknown as {
    requireEstateAccess?: RequireAccessFn;
    requireEstateEditAccess?: RequireAccessFn;
    listAccessibleEstateIds?: (userId: string) => Promise<string[]>;
  };

  return {
    requireView: mod.requireEstateAccess,
    requireEdit: mod.requireEstateEditAccess,
    listIds: mod.listAccessibleEstateIds,
  };
}

async function enforceViewerAccess(estateId: string, userId: string): Promise<NextResponse | null> {
  const { requireView } = pickAccessFns();

  // Prefer centralized access helpers when present.
  if (typeof requireView === "function") {
    try {
      await requireView({ estateId, userId });
      return null;
    } catch {
      return jsonError(403, "Forbidden");
    }
  }

  // Fallback to local role checks.
  const access = await requireEstateRole(estateId, userId, ["OWNER", "EDITOR", "VIEWER"]);
  return access.ok ? null : access.res;
}

async function enforceEditorAccess(estateId: string, userId: string): Promise<NextResponse | null> {
  const { requireEdit } = pickAccessFns();

  if (typeof requireEdit === "function") {
    try {
      await requireEdit({ estateId, userId });
      return null;
    } catch {
      return jsonError(403, "Insufficient role");
    }
  }

  const access = await requireEstateRole(estateId, userId, ["OWNER", "EDITOR"]);
  return access.ok ? null : access.res;
}

async function listAccessibleIds(userId: string): Promise<string[]> {
  const { listIds } = pickAccessFns();
  if (typeof listIds === "function") {
    try {
      const ids = await listIds(userId);
      return Array.isArray(ids) ? ids : [];
    } catch {
      // fall through
    }
  }
  return getAccessibleEstateIds(userId);
}

// GET /api/documents
// Optional query params:
//   estateId: string              -> filter documents for a specific estate
//   subject: string               -> filter by subject/category
//   q: string                     -> search by label, location, tags, or notes
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return jsonError(401, "Unauthorized");

    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const estateId = searchParams.get("estateId");
    const subject = searchParams.get("subject");
    const q = searchParams.get("q")?.trim() ?? "";

    // If a specific estateId is requested, enforce viewer access on that estate.
    if (estateId) {
      const res = await enforceViewerAccess(estateId, userId);
      if (res) return res;
    }

    // Otherwise, only return docs for estates the user can access.
    const accessibleEstateIds = estateId ? [estateId] : await listAccessibleIds(userId);

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

    return NextResponse.json({ documents }, { status: 200 });
  } catch (error) {
    console.error("GET /api/documents error", error);
    return NextResponse.json({ error: "Unable to load documents" }, { status: 500 });
  }
}

// POST /api/documents
// Creates a new estate document index entry (metadata only)
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return jsonError(401, "Unauthorized");

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
    if (!subject) return jsonError(400, "subject is required");
    if (!label) return jsonError(400, "label is required");

    // Creating documents requires Owner/Editor on the estate.
    const res = await enforceEditorAccess(estateId, userId);
    if (res) return res;

    // For consistent ownership semantics, align ownerId with the estate owner when possible.
    // (Fallback: use the current userId.)
    let ownerId = userId;
    try {
      const estate = (await Estate.findById(estateId).select({ ownerId: 1 }).lean().exec()) as unknown as {
        ownerId?: unknown;
      } | null;
      if (estate?.ownerId != null) ownerId = String(estate.ownerId);
    } catch {
      // ignore
    }

    const tags = Array.isArray(incomingTags)
      ? incomingTags
      : incomingTags
        ? [String(incomingTags)]
        : [];

    const isSensitive = Boolean(incomingIsSensitive);

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
    return NextResponse.json({ error: "Unable to create document" }, { status: 500 });
  }
}
