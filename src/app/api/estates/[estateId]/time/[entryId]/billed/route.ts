

import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { requireEstateEditAccess } from "@/lib/estateAccess";
import { TimeEntry } from "@/models/TimeEntry";

type RouteContext = {
  params: Promise<{
    estateId: string;
    entryId: string;
  }>;
};

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

function isValidObjectId(id: string): boolean {
  return Types.ObjectId.isValid(id);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isResponse(value: unknown): value is Response {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.status === "number" && "headers" in v;
}

function pickResponse(value: unknown): Response | null {
  if (!value) return null;
  if (isResponse(value)) return value;
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    const r = (v.res ?? v.response) as unknown;
    if (isResponse(r)) return r;
  }
  return null;
}

async function enforceEstateEdit(opts: {
  estateId: string;
  userId: string;
}): Promise<Response | true> {
  const out = (await requireEstateEditAccess({
    estateId: opts.estateId,
    userId: opts.userId,
  })) as unknown;
  const maybe = pickResponse(out);
  if (maybe) return maybe;
  return true;
}

/**
 * Marks a time entry as billed/unbilled.
 *
 * Body:
 *   { billed: boolean }
 *
 * When billed=true, also sets billedAt (if your schema supports it).
 * When billed=false, clears billedAt.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const { estateId, entryId } = await params;

  if (!isValidObjectId(estateId) || !isValidObjectId(entryId)) {
    return NextResponse.json(
      { ok: false, error: "Invalid id" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const raw = await req.json().catch(() => null);
  if (!isPlainObject(raw)) {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const billed = (raw as Record<string, unknown>).billed;
  if (typeof billed !== "boolean") {
    return NextResponse.json(
      { ok: false, error: "billed must be boolean" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  await connectToDatabase();

  const access = await enforceEstateEdit({ estateId, userId: session.user.id });
  if (access instanceof Response) {
    // ensure no-store even on pass-through responses
    const cloned = new Response(access.body, access);
    cloned.headers.set("Cache-Control", "no-store");
    return cloned;
  }

  // Update payload is shaped to work whether billed/billedAt are in schema.
  // If billedAt isn't in the model, Mongoose will ignore it (unless strict: "throw").
  const update: Record<string, unknown> = {
    billed,
    billedAt: billed ? new Date() : null,
  };

  const updated = await TimeEntry.findOneAndUpdate(
    { _id: entryId, estateId, ownerId: session.user.id },
    { $set: update },
    { new: true, runValidators: true },
  ).lean();

  if (!updated) {
    return NextResponse.json(
      { ok: false, error: "Entry not found" },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  return NextResponse.json(
    { ok: true, entry: updated },
    { status: 200, headers: NO_STORE_HEADERS },
  );
}

export const dynamic = "force-dynamic";