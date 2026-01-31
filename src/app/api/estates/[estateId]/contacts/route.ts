import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/lib/auth";
import { connectToDatabase, serializeMongoDoc } from "@/lib/db";
import { requireEstateEditAccess } from "@/lib/estateAccess";
import { Estate } from "@/models/Estate";
import { Contact } from "@/models/Contact";
import { logEstateEvent } from "@/lib/estateEvents";

type EstateLean = {
  _id: string | { toString: () => string };
  ownerId?: string;
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

function toObjectId(id: string) {
  return mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : null;
}

function isMongooseCastError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: unknown }).name === "CastError"
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { estateId } = await params;

  if (!estateId || typeof estateId !== "string") {
    return NextResponse.json({ ok: false, error: "Missing estateId" }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Permission: must be able to edit this estate (collaborators allowed if your helper supports it)
  await connectToDatabase();
  await requireEstateEditAccess({ estateId });

  const estateObjectId = toObjectId(estateId);
  const ownerObjectId = toObjectId(session.user.id);
  if (!estateObjectId || !ownerObjectId) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }

  let body: LinkBody;
  try {
    body = (await req.json()) as LinkBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const contactId = body.contactId;
  if (!contactId || typeof contactId !== "string") {
    return NextResponse.json(
      { ok: false, error: "Missing or invalid contactId" },
      { status: 400 }
    );
  }

  const contactObjectId = toObjectId(contactId);
  if (!contactObjectId) {
    return NextResponse.json({ ok: false, error: "Invalid contactId" }, { status: 400 });
  }

  // Load estate display fields for logging (after access check)
  let estate: EstateLean | null = null;
  try {
    estate = (await Estate.findOne({ _id: estateObjectId })
      .select("_id ownerId displayName caseName decedentName")
      .lean()
      .exec()) as EstateLean | null;
  } catch (err) {
    if (isMongooseCastError(err)) {
      return NextResponse.json({ ok: false, error: "Invalid estateId" }, { status: 400 });
    }
    throw err;
  }

  if (!estate) {
    return NextResponse.json({ ok: false, error: "Estate not found" }, { status: 404 });
  }

  // Contacts are scoped to the current user
  let contact: ContactLean | null = null;
  try {
    contact = (await Contact.findOne({
      _id: contactObjectId,
      ownerId: ownerObjectId,
    })
      .select("_id name email phone role")
      .lean()
      .exec()) as ContactLean | null;
  } catch (err) {
    if (isMongooseCastError(err)) {
      return NextResponse.json({ ok: false, error: "Invalid contactId" }, { status: 400 });
    }
    throw err;
  }

  if (!contact) {
    return NextResponse.json({ ok: false, error: "Contact not found" }, { status: 404 });
  }

  const estateOut = serializeMongoDoc(estate) as Record<string, unknown>;
  const estateIdStr = (estateOut.id as string | undefined) ?? "";
  if (!estateIdStr) {
    return NextResponse.json({ ok: false, error: "Invalid estate" }, { status: 500 });
  }

  await Contact.updateOne(
    { _id: contactObjectId, ownerId: ownerObjectId },
    { $addToSet: { estates: estateIdStr } }
  );

  const contactName =
    typeof contact.name === "string" && contact.name.trim().length > 0
      ? contact.name.trim()
      : "Unnamed contact";

  const estateName =
    (typeof estate.displayName === "string" && estate.displayName.trim()) ||
    (typeof estate.caseName === "string" && estate.caseName.trim()) ||
    (typeof estate.decedentName === "string" && estate.decedentName.trim()) ||
    `Estate …${estateIdStr.slice(-6)}`;

  const parts: string[] = [];
  if (typeof contact.email === "string" && contact.email.trim()) parts.push(contact.email.trim());
  if (typeof contact.phone === "string" && contact.phone.trim()) parts.push(contact.phone.trim());
  const detail = parts.length > 0 ? parts.join(" · ") : undefined;

  await logEstateEvent({
    ownerId: session.user.id,
    estateId: estateIdStr,
    type: "CONTACT_LINKED",
    summary: `Contact linked: ${contactName}`,
    detail: detail ? `${detail} (${estateName})` : estateName,
    meta: {
      contactId: contactId,
      contactRole: contact.role ?? null,
    },
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { estateId } = await params;

  if (!estateId || typeof estateId !== "string") {
    return NextResponse.json({ ok: false, error: "Missing estateId" }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Permission: must be able to edit this estate (collaborators allowed if your helper supports it)
  await connectToDatabase();
  await requireEstateEditAccess({ estateId });

  const estateObjectId = toObjectId(estateId);
  const ownerObjectId = toObjectId(session.user.id);
  if (!estateObjectId || !ownerObjectId) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }

  const url = new URL(req.url);
  const contactId = url.searchParams.get("contactId");

  if (!contactId || typeof contactId !== "string") {
    return NextResponse.json(
      { ok: false, error: "Missing contactId query parameter" },
      { status: 400 }
    );
  }

  const contactObjectId = toObjectId(contactId);
  if (!contactObjectId) {
    return NextResponse.json({ ok: false, error: "Invalid contactId" }, { status: 400 });
  }

  // Load estate display fields for logging (after access check)
  let estate: EstateLean | null = null;
  try {
    estate = (await Estate.findOne({ _id: estateObjectId })
      .select("_id ownerId displayName caseName decedentName")
      .lean()
      .exec()) as EstateLean | null;
  } catch (err) {
    if (isMongooseCastError(err)) {
      return NextResponse.json({ ok: false, error: "Invalid estateId" }, { status: 400 });
    }
    throw err;
  }

  if (!estate) {
    return NextResponse.json({ ok: false, error: "Estate not found" }, { status: 404 });
  }

  // Contacts are scoped to the current user
  let contact: ContactLean | null = null;
  try {
    contact = (await Contact.findOne({
      _id: contactObjectId,
      ownerId: ownerObjectId,
    })
      .select("_id name email phone role")
      .lean()
      .exec()) as ContactLean | null;
  } catch (err) {
    if (isMongooseCastError(err)) {
      return NextResponse.json({ ok: false, error: "Invalid contactId" }, { status: 400 });
    }
    throw err;
  }

  if (!contact) {
    return NextResponse.json({ ok: false, error: "Contact not found" }, { status: 404 });
  }

  const estateOut = serializeMongoDoc(estate) as Record<string, unknown>;
  const estateIdStr = (estateOut.id as string | undefined) ?? "";
  if (!estateIdStr) {
    return NextResponse.json({ ok: false, error: "Invalid estate" }, { status: 500 });
  }

  await Contact.updateOne(
    { _id: contactObjectId, ownerId: ownerObjectId },
    { $pull: { estates: estateIdStr } }
  );

  const contactName =
    typeof contact.name === "string" && contact.name.trim().length > 0
      ? contact.name.trim()
      : "Unnamed contact";

  const estateName =
    (typeof estate.displayName === "string" && estate.displayName.trim()) ||
    (typeof estate.caseName === "string" && estate.caseName.trim()) ||
    (typeof estate.decedentName === "string" && estate.decedentName.trim()) ||
    `Estate …${estateIdStr.slice(-6)}`;

  const parts: string[] = [];
  if (typeof contact.email === "string" && contact.email.trim()) parts.push(contact.email.trim());
  if (typeof contact.phone === "string" && contact.phone.trim()) parts.push(contact.phone.trim());
  const detail = parts.length > 0 ? parts.join(" · ") : undefined;

  await logEstateEvent({
    ownerId: session.user.id,
    estateId: estateIdStr,
    type: "CONTACT_UNLINKED",
    summary: `Contact removed: ${contactName}`,
    detail: detail ? `${detail} (${estateName})` : estateName,
    meta: {
      contactId: contactId,
      contactRole: contact.role ?? null,
    },
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}