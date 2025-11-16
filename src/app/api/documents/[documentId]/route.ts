import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { EstateDocument } from "@/models/EstateDocument";

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

    await connectToDatabase();
    const document = await EstateDocument.findByIdAndUpdate(documentId, body, {
      new: true,
      runValidators: true,
    });

    if (!document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
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

    await connectToDatabase();
    const document = await EstateDocument.findByIdAndDelete(documentId);

    if (!document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
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