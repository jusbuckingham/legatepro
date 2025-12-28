import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Invoice, type InvoiceStatus } from "@/models/Invoice";
import { logEstateEvent } from "@/lib/estateEvents";
import { logActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    invoiceId: string;
  }>;
};

function isValidObjectId(id: string) {
  return Types.ObjectId.isValid(id);
}

function normalizeStatus(input: unknown): InvoiceStatus | null {
  if (typeof input !== "string") return null;
  const s = input.trim().toUpperCase();
  if (s === "DRAFT" || s === "SENT" || s === "PAID" || s === "VOID") return s;
  return null;
}

function friendlyStatus(status: string | null | undefined): string {
  switch ((status ?? "").toUpperCase()) {
    case "PAID":
      return "Paid";
    case "SENT":
      return "Sent";
    case "VOID":
      return "Void";
    case "DRAFT":
      return "Draft";
    default:
      return status ? status : "Unknown";
  }
}

export async function PATCH(req: Request, ctx: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { invoiceId } = await ctx.params;

  if (!invoiceId || !isValidObjectId(invoiceId)) {
    return NextResponse.json({ ok: false, error: "Invalid invoiceId" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const nextStatus = normalizeStatus((body as { status?: unknown })?.status);
  if (!nextStatus) {
    return NextResponse.json(
      { ok: false, error: "Invalid status. Use DRAFT | SENT | PAID | VOID" },
      { status: 400 },
    );
  }

  await connectToDatabase();

  const invoice = await Invoice.findOne({
    _id: new Types.ObjectId(invoiceId),
    ownerId: new Types.ObjectId(session.user.id),
  });

  if (!invoice) {
    return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404 });
  }

  const previousStatusRaw = invoice.status ? String(invoice.status).toUpperCase() : null;
  const previousFriendly = friendlyStatus(previousStatusRaw);
  const nextFriendly = friendlyStatus(nextStatus);

  // No-op: still return ok, but don’t spam logs
  if (previousStatusRaw === nextStatus) {
    return NextResponse.json({
      ok: true,
      invoiceId,
      status: nextStatus,
      message: "Status unchanged",
    });
  }

  invoice.status = nextStatus;

  // Keep paidAt coherent
  if (nextStatus === "PAID") {
    invoice.paidAt = new Date();
  } else {
    invoice.paidAt = undefined;
  }

  await invoice.save();

  const estateIdStr = String(invoice.estateId);
  const invoiceNumberLabel = invoice.invoiceNumber?.trim()
    ? invoice.invoiceNumber.trim()
    : String(invoice._id).slice(-6);

  // Legacy estate event log (safe + backward compatible)
  try {
    await logEstateEvent({
      ownerId: session.user.id,
      estateId: estateIdStr,
      type: "INVOICE_STATUS_CHANGED",
      summary: `Invoice ${invoiceNumberLabel} marked ${nextFriendly}`,
      detail: `Status changed: ${previousFriendly} → ${nextFriendly}`,
      meta: {
        invoiceId: String(invoice._id),
        previousStatus: previousStatusRaw,
        newStatus: nextStatus,
      },
    });
  } catch {
    // don’t block status change if event logging fails
  }

  // New EstateActivity log (subtyped action, used by timeline enrichment)
  try {
    await logActivity({
      ownerId: session.user.id,
      estateId: estateIdStr,
      kind: "INVOICE",
      action: "status_changed",
      entityId: String(invoice._id),
      message: `Invoice ${invoiceNumberLabel} marked ${nextFriendly}`,
      snapshot: {
        previousStatus: previousStatusRaw,
        newStatus: nextStatus,
        previousStatusLabel: previousFriendly,
        newStatusLabel: nextFriendly,
        invoiceNumber: invoice.invoiceNumber ?? null,
      },
    });
  } catch {
    // don’t block status change if activity logging fails
  }

  return NextResponse.json({
    ok: true,
    invoiceId,
    estateId: estateIdStr,
    status: nextStatus,
  });
}