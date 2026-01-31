import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireEstateAccess, requireEstateEditAccess } from "@/lib/estateAccess";
import { connectToDatabase } from "@/lib/db";
import { logEstateEvent } from "@/lib/estateEvents";
import type { EstateEventType } from "@/models/EstateEvent";
import mongoose from "mongoose";
import { Invoice } from "@/models/Invoice";

export const dynamic = "force-dynamic";

type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "VOID";

type InvoiceLineItemInput = {
  type: "TIME" | "EXPENSE" | "ADJUSTMENT";
  label: string;
  quantity?: number;
  rate?: number;
  amount?: number;
  sourceTimeEntryId?: string;
  sourceExpenseId?: string;
};

type UpdateInvoiceBody = {
  status?: InvoiceStatus;
  issueDate?: string;
  dueDate?: string;
  paidAt?: string | null;
  notes?: string;
  taxRate?: number;
  lineItems?: InvoiceLineItemInput[];
};

function isValidObjectIdString(id: unknown): id is string {
  return typeof id === "string" && mongoose.Types.ObjectId.isValid(id);
}

function toObjectId(id: unknown): mongoose.Types.ObjectId | null {
  return isValidObjectIdString(id) ? new mongoose.Types.ObjectId(id) : null;
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

function isInvoiceStatus(value: unknown): value is InvoiceStatus {
  return value === "DRAFT" || value === "SENT" || value === "PAID" || value === "VOID";
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ estateId: string; invoiceId: string }> }
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { estateId, invoiceId } = await params;
  const estateObjectId = toObjectId(estateId);
  const invoiceObjectId = toObjectId(invoiceId);
  if (!estateObjectId || !invoiceObjectId) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }
  await connectToDatabase();
  await requireEstateAccess({ estateId, userId: session.user.id });

  const invoice = await Invoice.findOne({
    _id: invoiceObjectId,
    estateId: estateObjectId,
  }).lean();

  if (!invoice) {
    return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, invoice }, { status: 200 });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ estateId: string; invoiceId: string }> }
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { estateId, invoiceId } = await params;
  const estateObjectId = toObjectId(estateId);
  const invoiceObjectId = toObjectId(invoiceId);
  if (!estateObjectId || !invoiceObjectId) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }
  await connectToDatabase();
  await requireEstateEditAccess({ estateId, userId: session.user.id });

  const raw = await request.json().catch(() => null);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }
  const body = raw as UpdateInvoiceBody;

  const invoice = await Invoice.findOne({
    _id: invoiceObjectId,
    estateId: estateObjectId,
  });

  if (!invoice) {
    return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404 });
  }

  const update: Record<string, unknown> = {};

  if (isInvoiceStatus(body.status)) {
    update.status = body.status;
  }

  if (body.issueDate != null) {
    const d = parseDate(body.issueDate);
    if (!d) {
      return NextResponse.json({ ok: false, error: "Invalid issueDate" }, { status: 400 });
    }
    update.issueDate = d;
  }

  if (body.dueDate != null) {
    const d = parseDate(body.dueDate);
    if (!d) {
      return NextResponse.json({ ok: false, error: "Invalid dueDate" }, { status: 400 });
    }
    update.dueDate = d;
  }

  // paidAt: allow explicit clearing with null
  if (body.paidAt === null) {
    update.paidAt = null;
  } else if (body.paidAt != null) {
    const d = parseDate(body.paidAt);
    if (!d) {
      return NextResponse.json({ ok: false, error: "Invalid paidAt" }, { status: 400 });
    }
    update.paidAt = d;
  }

  if (typeof body.notes === "string") {
    update.notes = body.notes;
  }

  if (typeof body.taxRate === "number" && Number.isFinite(body.taxRate)) {
    update.taxRate = body.taxRate;
  }

  if (Array.isArray(body.lineItems)) {
    update.lineItems = body.lineItems
      .filter((item) => item && typeof item.label === "string" && typeof item.type === "string")
      .map((item) => ({
        type: item.type,
        label: item.label,
        quantity: typeof item.quantity === "number" && Number.isFinite(item.quantity) ? item.quantity : undefined,
        rate: typeof item.rate === "number" && Number.isFinite(item.rate) ? item.rate : undefined,
        amount: typeof item.amount === "number" && Number.isFinite(item.amount) ? item.amount : undefined,
        sourceTimeEntryId: typeof item.sourceTimeEntryId === "string" ? item.sourceTimeEntryId : undefined,
        sourceExpenseId: typeof item.sourceExpenseId === "string" ? item.sourceExpenseId : undefined,
      }));
  }

  Object.assign(invoice, update);
  await invoice.save(); // pre-save hook will recompute totals

  try {
    await logEstateEvent({
      ownerId: session.user.id,
      estateId,
      type: "INVOICE_UPDATED" as const as EstateEventType,
      summary: "Invoice updated",
      detail: `Updated invoice ${invoiceId}`,
      meta: {
        invoiceId,
        updatedFields: Object.keys(update),
        actorId: session.user.id,
      },
    });
  } catch (e) {
    console.warn("[PUT /api/estates/[estateId]/invoices/[invoiceId]] Failed to log event:", e);
  }

  return NextResponse.json({ ok: true, invoice }, { status: 200 });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ estateId: string; invoiceId: string }> }
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { estateId, invoiceId } = await params;
  const estateObjectId = toObjectId(estateId);
  const invoiceObjectId = toObjectId(invoiceId);
  if (!estateObjectId || !invoiceObjectId) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }
  await connectToDatabase();
  await requireEstateEditAccess({ estateId, userId: session.user.id });

  const deleted = await Invoice.findOneAndDelete({
    _id: invoiceObjectId,
    estateId: estateObjectId,
  }).lean();

  if (!deleted) {
    return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404 });
  }

  try {
    await logEstateEvent({
      ownerId: session.user.id,
      estateId,
      type: "INVOICE_DELETED" as const as EstateEventType,
      summary: "Invoice deleted",
      detail: `Deleted invoice ${invoiceId}`,
      meta: {
        invoiceId,
        actorId: session.user.id,
      },
    });
  } catch (e) {
    console.warn(
      "[DELETE /api/estates/[estateId]/invoices/[invoiceId]] Failed to log event:",
      e
    );
  }

  return NextResponse.json({ ok: true, deleted: true }, { status: 200 });
}