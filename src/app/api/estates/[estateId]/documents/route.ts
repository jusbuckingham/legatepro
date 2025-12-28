import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { EstateDocument } from "@/models/EstateDocument";
import { requireEstateAccess, requireEstateEditAccess } from "@/lib/estateAccess";

interface RouteParams {
  params: Promise<{
    estateId: string;
  }>;
}

type RequireAccessArgs = { estateId: string; userId?: string };

type RequireAccessFn = (args: RequireAccessArgs) => Promise<unknown>;

function isResponseLike(value: unknown): value is Response {
  return typeof value === "object" && value !== null && value instanceof Response;
}

function getRoleFromAccess(access: unknown): string | undefined {
  if (!access || typeof access !== "object") return undefined;
  const anyAccess = access as Record<string, unknown>;
  const role = anyAccess.role;
  return typeof role === "string" ? role : undefined;
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

export async function GET(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { estateId } = await params;

    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const access = await (requireEstateAccess as unknown as RequireAccessFn)({
      estateId,
      userId: session.user.id,
    });
    const failure = getFailureResponse(access);
    if (failure) return failure;

    const role = getRoleFromAccess(access);

    const where: Record<string, unknown> = { estateId };

    // VIEWER cannot view sensitive docs regardless of query params
    if (role === "VIEWER") {
      where.isSensitive = false;
    }

    const documents = await EstateDocument.find(where)
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ ok: true, documents }, { status: 200 });
  } catch (error) {
    console.error("[GET /api/estates/[estateId]/documents] Error:", error);
    return NextResponse.json({ ok: false, error: "Failed to fetch documents" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { estateId } = await params;

    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const access = await (requireEstateEditAccess as unknown as RequireAccessFn)({
      estateId,
      userId: session.user.id,
    });
    const failure = getFailureResponse(access);
    if (failure) return failure;

    const role = getRoleFromAccess(access);

    const body = await request.json();

    const {
      label,
      subject,
      notes,
      location,
      url,
      tags,
      isSensitive,
      fileName,
      fileType,
      fileSizeBytes,
    } = body ?? {};

    // Defense in depth: do not allow VIEWER access (should already be blocked by requireEditor)
    // and keep the policy that only non-VIEWER roles may create sensitive docs.
    if (Boolean(isSensitive) && role === "VIEWER") {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    if (!label || typeof label !== "string") {
      return NextResponse.json({ ok: false, error: "Label is required" }, { status: 400 });
    }

    const normalizedTags = Array.isArray(tags)
      ? tags.filter((t: unknown) => typeof t === "string")
      : [];

    const document = await EstateDocument.create({
      label,
      subject: subject || "OTHER",
      notes: notes ?? "",
      location: location ?? "",
      url: url ?? "",
      tags: normalizedTags,
      isSensitive: Boolean(isSensitive),
      fileName: fileName ?? "",
      fileType: fileType ?? "",
      fileSizeBytes: typeof fileSizeBytes === "number" ? fileSizeBytes : 0,
      ownerId: session.user.id,
      estateId,
    });

    // Activity log: document created
    try {
      const subjectLabel = typeof subject === "string" && subject.trim() ? subject.trim() : "OTHER";
      const safeLabel = typeof label === "string" && label.trim() ? label.trim() : "Untitled";

      await logActivity({
        estateId: String(estateId),
        kind: "DOCUMENT",
        action: "created",
        entityId: String(document._id),
        message: `Document created: ${safeLabel}`,
        snapshot: {
          label: document.label ?? null,
          subject: document.subject ?? subjectLabel,
          isSensitive: Boolean(document.isSensitive),
          url: document.url ?? null,
          fileName: document.fileName ?? null,
          fileType: document.fileType ?? null,
          fileSizeBytes: document.fileSizeBytes ?? null,
          tags: Array.isArray(document.tags) ? document.tags : null,
        },
      });
    } catch {
      // Don't block document creation if activity logging fails
    }

    return NextResponse.json({ ok: true, document }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/estates/[estateId]/documents] Error:", error);
    return NextResponse.json({ ok: false, error: "Failed to create document" }, { status: 500 });
  }
}