import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";
import { Contact } from "@/models/Contact";

type RouteParams = {
  estateId: string;
};

type LinkBody = {
  contactId?: string;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> },
) {
  const { estateId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();

  let body: LinkBody;
  try {
    body = (await req.json()) as LinkBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const contactId = body.contactId;
  if (!contactId || typeof contactId !== "string") {
    return NextResponse.json(
      { error: "Missing or invalid contactId" },
      { status: 400 },
    );
  }

  const estate = await Estate.findOne({
    _id: estateId,
    ownerId: session.user.id,
  })
    .select("_id ownerId")
    .lean();

  if (!estate) {
    return NextResponse.json({ error: "Estate not found" }, { status: 404 });
  }

  const contact = await Contact.findOne({
    _id: contactId,
    ownerId: session.user.id,
  }).select("_id");

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  await Contact.updateOne(
    { _id: contactId, ownerId: session.user.id },
    { $addToSet: { estates: estate._id } },
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> },
) {
  const { estateId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();

  const url = new URL(req.url);
  const contactId = url.searchParams.get("contactId");

  if (!contactId) {
    return NextResponse.json(
      { error: "Missing contactId query parameter" },
      { status: 400 },
    );
  }

  const estate = await Estate.findOne({
    _id: estateId,
    ownerId: session.user.id,
  })
    .select("_id ownerId")
    .lean();

  if (!estate) {
    return NextResponse.json({ error: "Estate not found" }, { status: 404 });
  }

  const contact = await Contact.findOne({
    _id: contactId,
    ownerId: session.user.id,
  }).select("_id");

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  await Contact.updateOne(
    { _id: contactId, ownerId: session.user.id },
    { $pull: { estates: estate._id } },
  );

  return NextResponse.json({ ok: true });
}