import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/auth.config";
import { connectToDatabase } from "@/lib/db";
import { EntitlementError, requirePro, toEntitlementsUser } from "@/lib/entitlements";

import * as UserModule from "@/models/User";
import * as InvoiceModule from "@/models/Invoice";

type ModelWithFindById = {
  findById: (id: string) => { lean: () => Promise<unknown> };
};

type ModelWithCreate = {
  create: (doc: Record<string, unknown>) => Promise<unknown>;
};

function getUserModel(): ModelWithFindById {
  const mod = UserModule as unknown as {
    default?: ModelWithFindById;
    User?: ModelWithFindById;
  };
  const m = mod.default ?? mod.User;
  if (!m) throw new Error("User model not found");
  return m;
}

function getInvoiceModel(): ModelWithCreate {
  const mod = InvoiceModule as unknown as {
    default?: ModelWithCreate;
    Invoice?: ModelWithCreate;
  };
  const m = mod.default ?? mod.Invoice;
  if (!m) throw new Error("Invoice model not found");
  return m;
}

const headersNoStore = new Headers({ "cache-control": "no-store" });

function jsonOk(data: unknown, status = 200) {
  return NextResponse.json({ ok: true, data }, { status, headers: headersNoStore });
}

function jsonErr(error: string, status = 400, code = "BAD_REQUEST") {
  return NextResponse.json({ ok: false, error, code }, { status, headers: headersNoStore });
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
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return jsonErr("Unauthorized", 401, "UNAUTHORIZED");
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return jsonErr("Invalid JSON", 400, "BAD_REQUEST");
    }

    if (!isPlainObject(payload)) {
      return jsonErr("Invalid JSON", 400, "BAD_REQUEST");
    }

    const body = sanitizeObject(payload);
    const estateId = toSafeString((body as Record<string, unknown>).estateId);

    if (!estateId) {
      return jsonErr("estateId is required", 400, "BAD_REQUEST");
    }

    await connectToDatabase();

    const User = getUserModel();
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

    const Invoice = getInvoiceModel();

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