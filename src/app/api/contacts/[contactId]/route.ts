import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Contact } from "@/models/Contact";

type RouteParams = {
  contactId: string;
};

type ContactRole =
  | "EXECUTOR"
  | "ADMINISTRATOR"
  | "HEIR"
  | "ATTORNEY"
  | "CREDITOR"
  | "VENDOR"
  | "OTHER";

type UpdatePayload = {
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  notes?: string;
};

type ContactLeanDoc = {
  _id: unknown;
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  notes?: string;
  estates?: unknown;
};

function normalizeRole(raw?: string | null): ContactRole | undefined {
  if (!raw) return undefined;
  const upper = raw.toUpperCase();
  if (
    upper === "EXECUTOR" ||
    upper === "ADMINISTRATOR" ||
    upper === "HEIR" ||
    upper === "ATTORNEY" ||
    upper === "CREDITOR" ||
    upper === "VENDOR" ||
    upper === "OTHER"
  ) {
    return upper;
  }
  return "OTHER";
}

function toObjectIdIfValid(value: string): mongoose.Types.ObjectId | null {
  return mongoose.Types.ObjectId.isValid(value)
    ? new mongoose.Types.ObjectId(value)
    : null;
}

function serializeId(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toString" in value) {
    try {
      return String((value as { toString: () => string }).toString());
    } catch {
      // fall through
    }
  }
  return "";
}


export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<RouteParams> },
): Promise<NextResponse> {
  const { contactId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();
  const ownerId = session.user.id;
  const ownerObjectId = toObjectIdIfValid(ownerId);

  const contactObjectId = toObjectIdIfValid(contactId);
  const contactIdQuery = contactObjectId ?? contactId;

  let contact: ContactLeanDoc | null = null;
  try {
    contact = await Contact.findOne({
      _id: contactIdQuery,
      $or: [
        { ownerId },
        ...(ownerObjectId ? [{ ownerId: ownerObjectId }] : []),
      ],
    })
      .select("_id name email phone role notes estates")
      .lean<ContactLeanDoc>()
      .exec();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid contact id" }, { status: 400 });
  }

  if (!contact) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      ok: true,
      contact: {
        _id: serializeId(contact._id),
        name: contact.name ?? "",
        email: contact.email ?? "",
        phone: contact.phone ?? "",
        role: normalizeRole(contact.role) ?? "OTHER",
        notes: contact.notes ?? "",
        estates: Array.isArray(contact.estates) ? contact.estates : [],
      },
    },
    { status: 200 },
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> },
): Promise<NextResponse> {
  const { contactId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();

  const ownerId = session.user.id;
  const ownerObjectId = toObjectIdIfValid(ownerId);

  const contactObjectId = toObjectIdIfValid(contactId);
  const contactIdQuery = contactObjectId ?? contactId;

  let body: UpdatePayload;
  try {
    body = (await req.json()) as UpdatePayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const update: {
    name?: string;
    email?: string;
    phone?: string;
    role?: ContactRole;
    notes?: string;
  } = {};

  if (typeof body.name === "string") {
    const trimmed = body.name.trim();
    if (!trimmed) {
      return NextResponse.json(
        { ok: false, error: "Name is required" },
        { status: 400 },
      );
    }
    update.name = trimmed;
  }

  if (typeof body.email === "string") {
    const trimmed = body.email.trim();
    if (trimmed.length > 254) {
      return NextResponse.json({ ok: false, error: "Email is too long" }, { status: 400 });
    }
    update.email = trimmed || undefined;
  }

  if (typeof body.phone === "string") {
    const trimmed = body.phone.trim();
    if (trimmed.length > 40) {
      return NextResponse.json({ ok: false, error: "Phone is too long" }, { status: 400 });
    }
    update.phone = trimmed || undefined;
  }

  if (typeof body.role === "string") {
    const normalized = normalizeRole(body.role);
    if (normalized) update.role = normalized;
  }

  if (typeof body.notes === "string") {
    const trimmed = body.notes.trim();
    if (trimmed.length > 4000) {
      return NextResponse.json({ ok: false, error: "Notes is too long" }, { status: 400 });
    }
    update.notes = trimmed || undefined;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: false, error: "No fields to update" }, { status: 400 });
  }

  let updated: ContactLeanDoc | null = null;
  try {
    updated = await Contact.findOneAndUpdate(
      {
        _id: contactIdQuery,
        $or: [
          { ownerId },
          ...(ownerObjectId ? [{ ownerId: ownerObjectId }] : []),
        ],
      },
      { $set: update },
      { new: true, runValidators: true },
    )
      .select("_id name email phone role notes estates")
      .lean<ContactLeanDoc>()
      .exec();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid contact id" }, { status: 400 });
  }

  if (!updated) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      ok: true,
      contact: {
        _id: serializeId(updated._id),
        name: updated.name ?? "",
        email: updated.email ?? "",
        phone: updated.phone ?? "",
        role: normalizeRole(updated.role) ?? "OTHER",
        notes: updated.notes ?? "",
        estates: Array.isArray(updated.estates) ? updated.estates : [],
      },
    },
    { status: 200 },
  );
}