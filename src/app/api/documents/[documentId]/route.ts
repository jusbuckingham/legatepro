import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { EstateDocument } from "@/models/EstateDocument";
import { auth } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

type RouteParams = { documentId: string };

export async function GET(
  _req: NextRequest,
  context: { params: Promise<RouteParams> }
) {
  try {
    const { documentId } = await context.params;

    await connectToDatabase();
    const document = await EstateDocument.findById(documentId);

    if (!document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ document }, { status: 200 });
  } catch (error) {
    console.error("[DOCUMENT_GET]", error);
    return NextResponse.json(
      { error: "Failed to fetch document" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<RouteParams> }
) {
  try {
    const { documentId } = await context.params;
    const body = await req.json();

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();
    const existing = await EstateDocument.findById(documentId);
    if (!existing) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const previousSnapshot = {
      label: existing.label ?? null,
      subject: existing.subject ?? null,
      isSensitive: Boolean(existing.isSensitive),
    };

    Object.assign(existing, body);
    const document = await existing.save();

    // Activity log: document updated
    try {
      await logActivity({
        ownerId: session.user.id,
        estateId: String(document.estateId),
        kind: "document",
        action: "updated",
        entityId: String(document._id),
        message: `Document updated: ${String(document.label ?? "Untitled")}`,
        snapshot: {
          previous: previousSnapshot,
          current: {
            label: document.label ?? null,
            subject: document.subject ?? null,
            isSensitive: Boolean(document.isSensitive),
          },
        },
      });
    } catch {
      // Don't block document update if activity logging fails
    }

    return NextResponse.json({ document }, { status: 200 });
  } catch (error) {
    console.error("[DOCUMENT_PUT]", error);
    return NextResponse.json(
      { error: "Failed to update document" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<RouteParams> }
) {
  try {
    const { documentId } = await context.params;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();
    const document = await EstateDocument.findById(documentId);
    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    await document.deleteOne();

    // Activity log: document deleted
    try {
      await logActivity({
        ownerId: session.user.id,
        estateId: String(document.estateId),
        kind: "document",
        action: "deleted",
        entityId: String(document._id),
        message: `Document deleted: ${String(document.label ?? "Untitled")}`,
        snapshot: {
          label: document.label ?? null,
          subject: document.subject ?? null,
          isSensitive: Boolean(document.isSensitive),
        },
      });
    } catch {
      // Don't block document deletion if activity logging fails
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("[DOCUMENT_DELETE]", error);
    return NextResponse.json(
      { error: "Failed to delete document" },
      { status: 500 }
    );
  }
}