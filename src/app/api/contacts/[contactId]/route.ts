import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Contact } from "@/models/Contact";

type RouteParams = { contactId: string };

export async function GET(
  _req: NextRequest,
  context: { params: Promise<RouteParams> }
) {
  try {
    const { contactId } = await context.params;

    await connectToDatabase();
    const contact = await Contact.findById(contactId);

    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    return NextResponse.json({ contact }, { status: 200 });
  } catch (error) {
    console.error("[CONTACT_GET]", error);
    return NextResponse.json(
      { error: "Failed to fetch contact" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<RouteParams> }
) {
  try {
    const { contactId } = await context.params;
    const body = await req.json();

    await connectToDatabase();
    const contact = await Contact.findByIdAndUpdate(contactId, body, {
      new: true,
      runValidators: true,
    });

    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    return NextResponse.json({ contact }, { status: 200 });
  } catch (error) {
    console.error("[CONTACT_PUT]", error);
    return NextResponse.json(
      { error: "Failed to update contact" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<RouteParams> }
) {
  try {
    const { contactId } = await context.params;

    await connectToDatabase();
    const contact = await Contact.findByIdAndDelete(contactId);

    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("[CONTACT_DELETE]", error);
    return NextResponse.json(
      { error: "Failed to delete contact" },
      { status: 500 }
    );
  }
}