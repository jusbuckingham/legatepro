import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { auth } from "@/lib/auth";
import { EstateDocument } from "@/models/EstateDocument";
import mongoose from "mongoose";

interface RouteParams {
  params: Promise<{
    estateId: string;
    documentId: string;
  }>;
}

function isValidObjectId(value: unknown): value is string {
  return typeof value === "string" && mongoose.Types.ObjectId.isValid(value);
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { estateId, documentId } = await params;
    const session = await auth();

    if (!isValidObjectId(estateId) || !isValidObjectId(documentId)) {
      return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    }

    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const document = await EstateDocument.findOne({
      _id: documentId,
      estateId,
      ownerId: session.user.id,
    }).lean();

    if (!document) {
      return NextResponse.json({ ok: false, error: "Document not found" }, { status: 404 });
    }

    return NextResponse.json({ document }, { status: 200 });
  } catch (error) {
    console.error("[GET /api/estates/[estateId]/documents/[documentId]] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch document" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { estateId, documentId } = await params;
    const session = await auth();

    if (!isValidObjectId(estateId) || !isValidObjectId(documentId)) {
      return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    }

    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const updates: unknown = await request.json();
    const updateObj = (updates && typeof updates === "object") ? (updates as Record<string, unknown>) : {};

    const allowedFields = [
      "label",
      "subject",
      "notes",
      "location",
      "url",
      "tags",
      "isSensitive",
    ];

    const filteredUpdates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in updateObj) {
        filteredUpdates[key] = updateObj[key];
      }
    }

    if (Object.keys(filteredUpdates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields provided" },
        { status: 400 }
      );
    }

    const updated = await EstateDocument.findOneAndUpdate(
      {
        _id: documentId,
        estateId,
        ownerId: session.user.id,
      },
      filteredUpdates,
      { new: true, runValidators: true }
    ).lean();

    if (!updated) {
      return NextResponse.json({ ok: false, error: "Document not found" }, { status: 404 });
    }

    return NextResponse.json({ document: updated }, { status: 200 });
  } catch (error) {
    console.error("[PATCH /api/estates/[estateId]/documents/[documentId]] Error:", error);
    return NextResponse.json(
      { error: "Failed to update document" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { estateId, documentId } = await params;
    const session = await auth();

    if (!isValidObjectId(estateId) || !isValidObjectId(documentId)) {
      return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    }

    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const deleted = await EstateDocument.findOneAndDelete({
      _id: documentId,
      estateId,
      ownerId: session.user.id,
    }).lean();

    if (!deleted) {
      return NextResponse.json({ ok: false, error: "Document not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("[DELETE /api/estates/[estateId]/documents/[documentId]] Error:", error);
    return NextResponse.json(
      { error: "Failed to delete document" },
      { status: 500 }
    );
  }
}