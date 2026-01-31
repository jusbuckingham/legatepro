import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

import { connectToDatabase } from "@/lib/db";
import { EntitlementError, requirePro, toEntitlementsUser } from "@/lib/entitlements";
import { auth } from "@/lib/auth";
import { getEstateAccess } from "@/lib/estateAccess";

import { User } from "@/models/User";
import { Invoice } from "@/models/Invoice";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

function isValidObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}

function jsonOk(data: unknown, status = 200) {
  return NextResponse.json({ ok: true, data }, { status, headers: NO_STORE_HEADERS });
}

function jsonErr(error: string, status = 400, code = "BAD_REQUEST") {
  return NextResponse.json({ ok: false, error, code }, { status, headers: NO_STORE_HEADERS });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function sanitizeObject(input: Record<string, unknown>): Record<string, unknown> {
  // Prevent prototype pollution / weird keys from being persisted.
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
    out[k] = v;
  }
  return out;
}

function toSafeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return jsonErr("Unauthorized", 401, "UNAUTHORIZED");
    }

    const raw = await request.json().catch(() => null);

    if (!isPlainObject(raw)) {
      return jsonErr("Invalid JSON", 400, "BAD_REQUEST");
    }

    const body = sanitizeObject(raw);
    const estateId = toSafeString(body.estateId);

    if (!estateId) {
      return jsonErr("estateId is required", 400, "BAD_REQUEST");
    }

    if (!isValidObjectId(estateId)) {
      return jsonErr("Invalid estateId", 400, "BAD_REQUEST");
    }

    await connectToDatabase();

    const user = await User.findById(userId).lean();

    if (!user) {
      return jsonErr("Unauthorized", 401, "UNAUTHORIZED");
    }

    // Normalize the shape for entitlement checks without trusting unknown DB types.
    if (!isPlainObject(user)) {
      return jsonErr("Unable to load user", 500, "INTERNAL_ERROR");
    }

    const entUser = toEntitlementsUser(user);

    try {
      requirePro(entUser);
    } catch (e) {
      if (e instanceof EntitlementError) {
        return jsonErr("Pro subscription required", 402, e.code);
      }
      throw e;
    }

    const access = await getEstateAccess({
      estateId,
      userId,
      atLeastRole: "EDITOR",
    });

    if (!access || !access.canEdit) {
      return jsonErr("Forbidden", 403, "FORBIDDEN");
    }

    // Build the create payload, but explicitly strip ownership fields that should never be client-controlled.
    const doc: Record<string, unknown> = {
      ...body,
      estateId,
      ownerId: userId,
    };

    delete doc.userId;
    delete doc.owner;
    delete doc.owner_id;
    delete doc.ownerId;

    const created = await Invoice.create(doc);
    return jsonOk({ invoice: created }, 201);
  } catch (error) {
    console.error("POST /api/invoices/new error", error);
    return jsonErr("Unable to create invoice", 500, "INTERNAL_ERROR");
  }
}