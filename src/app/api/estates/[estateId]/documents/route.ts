import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { requireEstateAccess, requireEstateEditAccess } from "@/lib/estateAccess";
import { logEstateEvent } from "@/lib/estateEvents";
import { EstateDocument } from "@/models/EstateDocument";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{ estateId: string }>;
};

type RequireAccessArgs = { estateId: string; userId?: string };
type RequireAccessFn = (args: RequireAccessArgs) => Promise<unknown>;

type Role = "OWNER" | "EDITOR" | "VIEWER";

const SUBJECTS = [
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
] as const;

type Subject = (typeof SUBJECTS)[number];

function normalizeSubject(value: string | undefined | null): Subject {
  const v = (value ?? "").trim().toUpperCase();
  return (SUBJECTS as readonly string[]).includes(v) ? (v as Subject) : "OTHER";
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clampInt(value: string | null, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function isFiniteNonNegativeNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0;
}

function normalizeTags(value: unknown, maxTags = 25, maxLen = 32): string[] {
  const raw: string[] = Array.isArray(value)
    ? value.filter((t: unknown): t is string => typeof t === "string")
    : typeof value === "string"
      ? value.split(",")
      : [];

  const out: string[] = [];
  for (const t of raw) {
    const v = t.trim().toLowerCase();
    if (!v) continue;
    if (v.length > maxLen) continue;
    if (out.includes(v)) continue;
    out.push(v);
    if (out.length >= maxTags) break;
  }
  return out;
}

function isResponseLike(value: unknown): value is Response {
  return typeof value === "object" && value !== null && value instanceof Response;
}

function getFailureResponse(access: unknown): NextResponse | undefined {
  if (!access || typeof access !== "object") return undefined;
  const anyAccess = access as Record<string, unknown>;

  // Older helper shape: { ok: boolean; res: NextResponse }
  if (anyAccess.ok === false && isResponseLike(anyAccess.res)) {
    return anyAccess.res as NextResponse;
  }

  // Newer helper shape: may directly return a Response/NextResponse on failure
  if (isResponseLike(access)) {
    return access as NextResponse;
  }

  return undefined;
}

function getRoleFromAccess(access: unknown): Role | undefined {
  if (!access || typeof access !== "object") return undefined;
  const anyAccess = access as Record<string, unknown>;
  const role = anyAccess.role;
  return role === "OWNER" || role === "EDITOR" || role === "VIEWER" ? role : undefined;
}

async function safeJson(
  request: NextRequest,
): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    const value = await request.json();
    return { ok: true, value };
  } catch {
    return { ok: false };
  }
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { estateId } = await params;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const access = await (requireEstateAccess as unknown as RequireAccessFn)({
      estateId,
      userId: session.user.id,
    });
    const failure = getFailureResponse(access);
    if (failure) return failure;

    const role: Role = getRoleFromAccess(access) ?? "VIEWER";

    const { searchParams } = new URL(request.url);

    const qRaw = searchParams.get("q") ?? "";
    const q = qRaw.trim().slice(0, 200);

    const subject = normalizeSubject(searchParams.get("subject"));

    const tagRaw = (searchParams.get("tag") ?? "").trim();
    const tag = tagRaw ? tagRaw.toLowerCase() : "";

    const sensitiveParam = searchParams.get("sensitive");
    const sensitiveOnly = sensitiveParam === "1" || sensitiveParam === "true" || sensitiveParam === "on";

    const limit = clampInt(searchParams.get("limit"), 250, 1, 250);

    const where: Record<string, unknown> = { estateId };

    if (searchParams.get("subject")) where.subject = subject;

    if (tag) {
      // Match any array element exactly (tags are stored lowercase)
      where.tags = tag;
    }

    if (q) {
      const safe = escapeRegExp(q);
      where.$or = [
        { label: { $regex: safe, $options: "i" } },
        { notes: { $regex: safe, $options: "i" } },
        { location: { $regex: safe, $options: "i" } },
        { fileName: { $regex: safe, $options: "i" } },
      ];
    }

    // VIEWER cannot see sensitive docs
    if (role === "VIEWER") {
      where.isSensitive = false;
    } else if (sensitiveOnly) {
      where.isSensitive = true;
    }

    const documents = await EstateDocument.find(where)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean<Record<string, unknown>[]>()
      .exec();

    return NextResponse.json({ ok: true, documents }, { status: 200 });
  } catch (error) {
    console.error("[GET /api/estates/[estateId]/documents] Error:", error);
    return NextResponse.json({ ok: false, error: "Failed to fetch documents" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { estateId } = await params;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const access = await (requireEstateEditAccess as unknown as RequireAccessFn)({
      estateId,
      userId: session.user.id,
    });
    const failure = getFailureResponse(access);
    if (failure) return failure;

    const role: Role = getRoleFromAccess(access) ?? "VIEWER";

    const parsed = await safeJson(request);
    if (!parsed.ok) {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const body = parsed.value;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const b = body as Record<string, unknown>;

    const label = typeof b.label === "string" ? b.label.trim().slice(0, 200) : "";
    const subject = normalizeSubject(typeof b.subject === "string" ? b.subject : undefined);
    const notes = typeof b.notes === "string" ? b.notes.trim().slice(0, 5000) : "";
    const location = typeof b.location === "string" ? b.location.trim().slice(0, 200) : "";
    const url = typeof b.url === "string" ? b.url.trim().slice(0, 2000) : "";
    const isSensitive = Boolean(b.isSensitive);

    if (role === "VIEWER") {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    // Only OWNER can mark documents as sensitive.
    if (isSensitive && role !== "OWNER") {
      return NextResponse.json(
        { ok: false, error: "Only the owner can mark a document as sensitive" },
        { status: 403 },
      );
    }

    const normalizedTags = normalizeTags(b.tags);

    const fileName = typeof b.fileName === "string" ? b.fileName.trim().slice(0, 255) : "";
    const fileType = typeof b.fileType === "string" ? b.fileType.trim().slice(0, 64) : "";
    const fileSizeBytes = isFiniteNonNegativeNumber(b.fileSizeBytes) ? b.fileSizeBytes : 0;

    if (!label) {
      return NextResponse.json({ ok: false, error: "Label is required" }, { status: 400 });
    }

    const document = await EstateDocument.create({
      estateId,
      ownerId: session.user.id,
      label,
      subject,
      notes,
      location,
      url,
      tags: normalizedTags,
      isSensitive,
      fileName,
      fileType,
      fileSizeBytes,
    });

    // Activity timeline: document created (non-blocking)
    try {
      await logEstateEvent({
        ownerId: session.user.id,
        estateId,
        type: "DOCUMENT_CREATED",
        summary: "Document created",
        detail: `Created document: ${label}`,
        meta: {
          documentId: String((document as { _id?: unknown })._id ?? ""),
          label,
          subject,
          isSensitive,
          tags: normalizedTags,
          url: url || null,
          location: location || null,
          fileName: fileName || null,
          fileType: fileType || null,
          fileSizeBytes,
        },
      });
    } catch {
      // Don't block document creation if event logging fails
    }

    return NextResponse.json({ ok: true, document }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/estates/[estateId]/documents] Error:", error);
    return NextResponse.json({ ok: false, error: "Failed to create document" }, { status: 500 });
  }
}