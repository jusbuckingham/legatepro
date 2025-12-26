// src/app/api/estates/[estateId]/invoices/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { requireEstateAccess, requireEstateEditAccess } from "@/lib/estateAccess";
import { Invoice, type InvoiceStatus } from "@/models/Invoice";
import mongoose from "mongoose";

type RouteParams = {
  params: Promise<{
    estateId: string;
  }>;
};

interface CreateInvoiceBody {
  description: string;
  amount: number;
  issueDate: string; // ISO string from client
  dueDate?: string;
  status?: InvoiceStatus;
}

function toObjectId(id: string) {
  return mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : null;
}

function parseDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function jsonError(message: string, status: number, details?: unknown) {
  return NextResponse.json(
    details ? { error: message, details } : { error: message },
    { status },
  );
}

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) return jsonError("Unauthorized", 401);

    // Permission: must be able to view this estate
    const { estateId } = await params;
    await requireEstateAccess({ estateId });

    const estateObjectId = toObjectId(estateId);
    const ownerObjectId = toObjectId(session.user.id);

    if (!estateObjectId || !ownerObjectId) {
      return jsonError("Invalid id", 400);
    }

    await connectToDatabase();

    const invoices = await Invoice.find({
      estateId: estateObjectId,
      ownerId: ownerObjectId,
    })
      .sort({ issueDate: -1 })
      .lean()
      .exec();

    return NextResponse.json({ ok: true, invoices }, { status: 200 });
  } catch (error) {
    console.error("[GET_INVOICES]", error);
    return jsonError("Failed to fetch invoices", 500);
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) return jsonError("Unauthorized", 401);

    // Permission: must be able to edit this estate
    const { estateId } = await params;
    await requireEstateEditAccess({ estateId });

    await connectToDatabase();

    const body = (await req.json()) as Partial<CreateInvoiceBody>;

    const errors: string[] = [];

    const description = typeof body.description === "string" ? body.description.trim() : "";
    const amount = typeof body.amount === "number" ? body.amount : Number(body.amount);

    if (!description) errors.push("Description is required");
    if (Number.isNaN(amount)) errors.push("Valid amount is required");

    const issueDate = parseDate(body.issueDate);
    if (!issueDate) errors.push("Valid issue date is required");

    const dueDate = body.dueDate == null ? undefined : parseDate(body.dueDate);
    if (body.dueDate != null && !dueDate) errors.push("Due date is invalid");

    // If caller provides a status, accept only known statuses; otherwise default to 'draft'.
    const rawStatus = typeof body.status === "string" ? body.status.trim() : "";

    // Normalize to the enum-style uppercase strings used by the model (e.g. "DRAFT").
    // If an unknown value is provided, the model/validation layer should reject it.
    const status = (rawStatus ? rawStatus.toUpperCase() : "DRAFT") as InvoiceStatus;

    if (errors.length > 0) {
      return jsonError("Validation failed", 400, errors);
    }

    const estateObjectId = toObjectId(estateId);
    const ownerObjectId = toObjectId(session.user.id);

    if (!estateObjectId || !ownerObjectId) {
      return jsonError("Invalid id", 400);
    }

    const invoice = await Invoice.create({
      estateId: estateObjectId,
      ownerId: ownerObjectId,
      description,
      amount,
      issueDate,
      dueDate,
      status,
    });

    return NextResponse.json({ ok: true, invoice }, { status: 201 });
  } catch (error) {
    console.error("[CREATE_INVOICE]", error);
    return jsonError("Failed to create invoice", 500);
  }
}