import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { NextAuthOptions } from "next-auth";

import { authOptions as rawAuthOptions } from "@/app/api/auth/[...nextauth]/route";
import { connectToDatabase } from "@/lib/db";
import { EntitlementError, requirePro } from "@/lib/entitlements";

import * as UserModule from "@/models/User";
import * as InvoiceModule from "@/models/Invoice";

type ModelWithFindById = {
  findById: (id: string) => { lean: () => Promise<unknown> };
};

type ModelWithCreate = {
  create: (doc: Record<string, unknown>) => Promise<unknown>;
};

function getUserModel(): ModelWithFindById {
  const mod = UserModule as unknown as { default?: ModelWithFindById; User?: ModelWithFindById };
  const m = mod.default ?? mod.User;
  if (!m) throw new Error("User model not found");
  return m;
}

function getInvoiceModel(): ModelWithCreate {
  const mod = InvoiceModule as unknown as { default?: ModelWithCreate; Invoice?: ModelWithCreate };
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

export async function POST(request: NextRequest) {
  const session = await getServerSession(rawAuthOptions as unknown as NextAuthOptions);
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

  if (!payload || typeof payload !== "object") {
    return jsonErr("Invalid JSON", 400, "BAD_REQUEST");
  }

  const body = payload as Record<string, unknown>;
  const estateId = typeof body.estateId === "string" ? body.estateId : "";

  if (!estateId) {
    return jsonErr("estateId is required", 400, "BAD_REQUEST");
  }

  await connectToDatabase();

  const User = getUserModel();
  const user = await User.findById(userId).lean();

  if (!user) {
    return jsonErr("Unauthorized", 401, "UNAUTHORIZED");
  }

  try {
    requirePro(user as { subscriptionPlanId?: string | null; subscriptionStatus?: string | null });
  } catch (e) {
    if (e instanceof EntitlementError) {
      return jsonErr("Pro subscription required", 402, e.code);
    }
    throw e;
  }

  const Invoice = getInvoiceModel();

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
}