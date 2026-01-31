import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

import { auth } from "@/lib/auth";
import { requireEstateEditAccess } from "@/lib/estateAccess";
import { connectToDatabase } from "@/lib/db";
import { logEstateEvent } from "@/lib/estateEvents";
import { Invoice, type InvoiceStatus } from "@/models/Invoice";
import type { EstateEventType } from "@/models/EstateEvent";

export const dynamic = "force-dynamic";

function isValidObjectIdString(id: unknown): id is string {
  return typeof id === "string" && mongoose.Types.ObjectId.isValid(id);
}

function toObjectId(id: unknown): mongoose.Types.ObjectId | null {
  return isValidObjectIdString(id) ? new mongoose.Types.ObjectId(id) : null;
}

function isInvoiceStatus(value: unknown): value is InvoiceStatus {
  if (typeof value !== "string") return false;
  return value.trim().length > 0;
}

type StatusBody = {
  status?: InvoiceStatus;
};

function normalizeStatus(s: unknown): string {
  return typeof s === "string" ? s.trim().toUpperCase() : "";
}

// Conservative transition rules for common invoice states.
// If we encounter an unknown status (not in this map), we allow the change.
const ALLOWED_TRANSITIONS: Record<string, Set<string>> = {
  DRAFT: new Set(["SENT", "VOID"]),
  SENT: new Set(["PAID", "OVERDUE", "VOID"]),
  OVERDUE: new Set(["PAID", "VOID"]),
  PAID: new Set([]),
  VOID: new Set([]),
};

function isAllowedTransition(previous: string, next: string): boolean {
  if (!previous || !next) return false;
  if (previous === next) return true;

  const allowed = ALLOWED_TRANSITIONS[previous];
  // Unknown previous status: don’t break legacy/extended statuses.
  if (!allowed) return true;

  return allowed.has(next);
}

function statusEventType(next: string): EstateEventType {
  switch (next) {
    case "PAID":
      return "INVOICE_MARKED_PAID" as const as EstateEventType;
    case "VOID":
      return "INVOICE_VOIDED" as const as EstateEventType;
    case "OVERDUE":
      return "INVOICE_MARKED_OVERDUE" as const as EstateEventType;
    case "SENT":
      return "INVOICE_SENT" as const as EstateEventType;
    case "DRAFT":
      return "INVOICE_REVERTED_TO_DRAFT" as const as EstateEventType;
    default:
      return "INVOICE_STATUS_CHANGED" as const as EstateEventType;
  }
}

function statusSummary(next: string): string {
  switch (next) {
    case "PAID":
      return "Invoice marked paid";
    case "VOID":
      return "Invoice voided";
    case "OVERDUE":
      return "Invoice marked overdue";
    case "SENT":
      return "Invoice marked sent";
    case "DRAFT":
      return "Invoice moved to draft";
    default:
      return "Invoice status changed";
  }
}

/**
 * PATCH /api/estates/[estateId]/invoices/[invoiceId]/status
 * Update invoice status only.
 */
export async function PATCH(
  req: NextRequest,
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

  const raw = await req.json().catch(() => null);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const body = raw as StatusBody;
  const nextStatus = body.status;
  if (!isInvoiceStatus(nextStatus)) {
    return NextResponse.json({ ok: false, error: "Missing/invalid status" }, { status: 400 });
  }

  await connectToDatabase();
  await requireEstateEditAccess({ estateId, userId: session.user.id });

  const existing = await Invoice.findOne({
    _id: invoiceObjectId,
    estateId: estateObjectId,
  })
    .select({ status: 1 })
    .lean()
    .exec();

  if (!existing) {
    return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404 });
  }

  const previousStatus = (existing as { status?: unknown }).status as InvoiceStatus | undefined;
  const prevNorm = normalizeStatus(previousStatus);
  const nextNorm = normalizeStatus(nextStatus);

  if (!nextNorm) {
    return NextResponse.json({ ok: false, error: "Missing/invalid status" }, { status: 400 });
  }

  if (!isAllowedTransition(prevNorm, nextNorm)) {
    return NextResponse.json(
      { ok: false, error: "Invalid status transition" },
      { status: 400 }
    );
  }

  const updated = await Invoice.findOneAndUpdate(
    { _id: invoiceObjectId, estateId: estateObjectId },
    { $set: { status: nextStatus } },
    { new: true, runValidators: true }
  )
    .lean()
    .exec();

  if (!updated) {
    return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404 });
  }

  try {
    await logEstateEvent({
      ownerId: session.user.id,
      estateId,
      type: statusEventType(nextNorm),
      summary: statusSummary(nextNorm),
      detail: `Changed invoice ${invoiceId} status from ${String(previousStatus ?? "") || "(unknown)"} to ${nextStatus}`,
      meta: {
        invoiceId,
        previousStatus,
        status: nextStatus,
        actorId: session.user.id,
      },
    });
  } catch (e) {
    console.warn(
      "[PATCH /api/estates/[estateId]/invoices/[invoiceId]/status] Failed to log event:",
      e
    );
  }

  return NextResponse.json({ ok: true, invoice: updated }, { status: 200 });
}
