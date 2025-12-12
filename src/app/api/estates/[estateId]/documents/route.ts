import { NextRequest, NextResponse } from "next/server";

import { connectToDatabase } from "@/lib/db";
import { auth } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { EstateDocument } from "@/models/EstateDocument";

interface RouteParams {
  params: Promise<{
    estateId: string;
  }>;
}

export async function GET(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { estateId } = await params;

    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const documents = await EstateDocument.find({
      estateId,
      ownerId: session.user.id,
    })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ documents }, { status: 200 });
  } catch (error) {
    console.error("[GET /api/estates/[estateId]/documents] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch documents" },
      { status: 500 }
    );
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

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

    if (!label || typeof label !== "string") {
      return NextResponse.json(
        { error: "Label is required" },
        { status: 400 }
      );
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
        ownerId: session.user.id,
        estateId: String(estateId),
        kind: "document",
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

    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/estates/[estateId]/documents] Error:", error);
    return NextResponse.json(
      { error: "Failed to create document" },
      { status: 500 }
    );
  }
}