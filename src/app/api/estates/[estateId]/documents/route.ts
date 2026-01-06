import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { requireEstateAccess, requireEstateEditAccess } from "@/lib/estateAccess";
import { EstateDocument } from "@/models/EstateDocument";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{ estateId: string }>;
};

type RequireAccessArgs = { estateId: string; userId?: string };
type RequireAccessFn = (args: RequireAccessArgs) => Promise<unknown>;

type Role = "OWNER" | "EDITOR" | "VIEWER";

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

    const role = getRoleFromAccess(access);

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const subject = searchParams.get("subject")?.trim() ?? "";
    const tag = searchParams.get("tag")?.trim() ?? "";
    const sensitiveOnly =
      searchParams.get("sensitive") === "1" || searchParams.get("sensitive") === "true";

    const where: Record<string, unknown> = { estateId };

    if (subject) where.subject = subject;

    if (tag) {
      // Store/search tags as lowercase for predictable filtering
      where.tags = tag.toLowerCase();
    }

    if (q) {
      where.$or = [
        { label: { $regex: q, $options: "i" } },
        { notes: { $regex: q, $options: "i" } },
        { location: { $regex: q, $options: "i" } },
        { fileName: { $regex: q, $options: "i" } },
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
      .limit(250)
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

    const parsed = await safeJson(request);
    if (!parsed.ok) {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const body = parsed.value;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const b = body as Record<string, unknown>;

    const label = typeof b.label === "string" ? b.label.trim() : "";
    const subject = typeof b.subject === "string" ? b.subject.trim() : "OTHER";
    const notes = typeof b.notes === "string" ? b.notes.trim() : "";
    const location = typeof b.location === "string" ? b.location.trim() : "";
    const url = typeof b.url === "string" ? b.url.trim() : "";
    const isSensitive = Boolean(b.isSensitive);

    const fileName = typeof b.fileName === "string" ? b.fileName.trim() : "";
    const fileType = typeof b.fileType === "string" ? b.fileType.trim() : "";
    const fileSizeBytes = typeof b.fileSizeBytes === "number" ? b.fileSizeBytes : 0;

    if (!label) {
      return NextResponse.json({ ok: false, error: "Label is required" }, { status: 400 });
    }

    const normalizedTags = Array.isArray(b.tags)
      ? b.tags
          .filter((t: unknown): t is string => typeof t === "string")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
      : [];

    const document = await EstateDocument.create({
      estateId,
      ownerId: session.user.id,
      label,
      subject: subject || "OTHER",
      notes,
      location,
      url,
      tags: normalizedTags,
      isSensitive,
      fileName,
      fileType,
      fileSizeBytes,
    });

    return NextResponse.json({ ok: true, document }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/estates/[estateId]/documents] Error:", error);
    return NextResponse.json({ ok: false, error: "Failed to create document" }, { status: 500 });
  }
}