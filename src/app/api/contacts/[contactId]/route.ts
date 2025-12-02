import { NextRequest, NextResponse } from "next/server";
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
  role?: ContactRole;
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<RouteParams> },
) {
  const { contactId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();

  const contact = (await Contact.findOne({
    _id: contactId,
    ownerId: session.user.id,
  })
    .select("_id name email phone role notes estates")
    .lean()) as ContactLeanDoc | null;

  if (!contact) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    _id: contact._id,
    name: contact.name ?? "",
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    role: contact.role ?? "OTHER",
    notes: contact.notes ?? "",
    estates: contact.estates ?? [],
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> },
) {
  const { contactId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();

  let body: UpdatePayload;
  try {
    body = (await req.json()) as UpdatePayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const update: UpdatePayload = {};

  if (typeof body.name === "string") {
    const trimmed = body.name.trim();
    if (!trimmed) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 },
      );
    }
    update.name = trimmed;
  }

  if (typeof body.email === "string") {
    const trimmed = body.email.trim();
    update.email = trimmed || undefined;
  }

  if (typeof body.phone === "string") {
    const trimmed = body.phone.trim();
    update.phone = trimmed || undefined;
  }

  if (typeof body.role === "string") {
    update.role = normalizeRole(body.role);
  }

  if (typeof body.notes === "string") {
    const trimmed = body.notes.trim();
    update.notes = trimmed || undefined;
  }

  const updated = (await Contact.findOneAndUpdate(
    { _id: contactId, ownerId: session.user.id },
    { $set: update },
    { new: true },
  )
    .select("_id name email phone role notes estates")
    .lean()) as ContactLeanDoc | null;

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    _id: updated._id,
    name: updated.name ?? "",
    email: updated.email ?? "",
    phone: updated.phone ?? "",
    role: updated.role ?? "OTHER",
    notes: updated.notes ?? "",
    estates: updated.estates ?? [],
  });
}