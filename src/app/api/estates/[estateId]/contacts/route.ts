import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";
import { Contact } from "@/models/Contact";
import { logEstateEvent } from "@/lib/estateEvents";

type EstateLean = {
  _id: string | { toString: () => string };
  displayName?: string;
  caseName?: string;
  decedentName?: string;
};

type ContactLean = {
  _id: unknown;
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
};

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

  const estate = (await Estate.findOne({
    _id: estateId,
    ownerId: session.user.id,
  })
    .select("_id ownerId displayName caseName decedentName")
    .lean()) as EstateLean | null;

  if (!estate) {
    return NextResponse.json({ error: "Estate not found" }, { status: 404 });
  }

  const contact = (await Contact.findOne({
    _id: contactId,
    ownerId: session.user.id,
  })
    .select("_id name email phone role")
    .lean()) as ContactLean | null;

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  await Contact.updateOne(
    { _id: contactId, ownerId: session.user.id },
    { $addToSet: { estates: estateId } },
  );

  // Log estate event
  const estateIdStr =
    typeof estate._id === "string" ? estate._id : estate._id.toString();

  const contactName =
    typeof contact.name === "string" && contact.name.trim().length > 0
      ? contact.name.trim()
      : "Unnamed contact";

  const estateName =
    estate.displayName ||
    estate.caseName ||
    estate.decedentName ||
    `Estate …${estateIdStr.slice(-6)}`;

  const parts: string[] = [];
  if (contact.email) parts.push(contact.email);
  if (contact.phone) parts.push(contact.phone);
  const detail = parts.length > 0 ? parts.join(" · ") : undefined;

  await logEstateEvent({
    ownerId: session.user.id,
    estateId: estateIdStr,
    type: "CONTACT_LINKED",
    summary: `Contact linked: ${contactName}`,
    detail: detail
      ? `${detail} (${estateName})`
      : estateName,
    meta: {
      contactId,
      contactRole: contact.role ?? null,
    },
  });

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

  const estate = (await Estate.findOne({
    _id: estateId,
    ownerId: session.user.id,
  })
    .select("_id ownerId displayName caseName decedentName")
    .lean()) as EstateLean | null;

  if (!estate) {
    return NextResponse.json({ error: "Estate not found" }, { status: 404 });
  }

  const contact = (await Contact.findOne({
    _id: contactId,
    ownerId: session.user.id,
  })
    .select("_id name email phone role")
    .lean()) as ContactLean | null;

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  await Contact.updateOne(
    { _id: contactId, ownerId: session.user.id },
    { $pull: { estates: estateId } },
  );

  // Log estate event
  const estateIdStr =
    typeof estate._id === "string" ? estate._id : estate._id.toString();

  const contactName =
    typeof contact.name === "string" && contact.name.trim().length > 0
      ? contact.name.trim()
      : "Unnamed contact";

  const estateName =
    estate.displayName ||
    estate.caseName ||
    estate.decedentName ||
    `Estate …${estateIdStr.slice(-6)}`;

  const parts: string[] = [];
  if (contact.email) parts.push(contact.email);
  if (contact.phone) parts.push(contact.phone);
  const detail = parts.length > 0 ? parts.join(" · ") : undefined;

  await logEstateEvent({
    ownerId: session.user.id,
    estateId: estateIdStr,
    type: "CONTACT_UNLINKED",
    summary: `Contact removed: ${contactName}`,
    detail: detail
      ? `${detail} (${estateName})`
      : estateName,
    meta: {
      contactId,
      contactRole: contact.role ?? null,
    },
  });

  return NextResponse.json({ ok: true });
}