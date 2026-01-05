import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { getEstateAccess } from "@/lib/estateAccess";
import { Invoice, type InvoiceStatus } from "@/models/Invoice";
import { Estate } from "@/models/Estate";
import { logEstateEvent } from "@/lib/estateEvents";
import { logActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
} as const;

type RouteContext = {
  params: Promise<{
    invoiceId: string;
  }>;
};

function isValidObjectId(id: string) {
  return Types.ObjectId.isValid(id);
}


function idToString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (value instanceof Types.ObjectId) return value.toString();

  try {
    const str = String(value);
    return str.length > 0 ? str : null;
  } catch {
    return null;
  }
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

export async function PATCH(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const { invoiceId } = await ctx.params;

  if (!invoiceId || !isValidObjectId(invoiceId)) {
    return NextResponse.json(
      { ok: false, error: "Invalid invoiceId" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const nextStatus = normalizeStatus((body as { status?: unknown })?.status);
  if (!nextStatus) {
    return NextResponse.json(
      { ok: false, error: "Invalid status. Use DRAFT | SENT | PAID | VOID" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  await connectToDatabase();

  const invoice = await Invoice.findById(new Types.ObjectId(invoiceId));

  if (!invoice) {
    return NextResponse.json(
      { ok: false, error: "Invoice not found" },
      { status: 404, headers: NO_STORE_HEADERS }
    );
  }

  const access = await getEstateAccess({
    estateId: String(invoice.estateId),
    userId: session.user.id,
    atLeastRole: "EDITOR",
  });

  if (!access || !access.canEdit) {
    return NextResponse.json(
      { ok: false, error: "Invoice not found" },
      { status: 404, headers: NO_STORE_HEADERS }
    );
  }

  const previousStatusRaw = invoice.status ? String(invoice.status).toUpperCase() : null;
  const previousFriendly = friendlyStatus(previousStatusRaw);
  const nextFriendly = friendlyStatus(nextStatus);

  // No-op: still return ok, but don’t spam logs
  if (previousStatusRaw === nextStatus) {
    return NextResponse.json(
      {
        ok: true,
        data: {
          invoiceId,
          status: nextStatus,
          message: "Status unchanged",
        },
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
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

  const estateOwnerDoc = await Estate.findById(invoice.estateId)
    .select("ownerId")
    .lean()
    .exec();

  const ownerIdForLogs =
    idToString((estateOwnerDoc as { ownerId?: unknown } | null)?.ownerId) ??
    session.user.id;

  const invoiceNumberLabel = invoice.invoiceNumber?.trim()
    ? invoice.invoiceNumber.trim()
    : String(invoice._id).slice(-6);

  // Legacy estate event log (safe + backward compatible)
  try {
    await logEstateEvent({
      ownerId: ownerIdForLogs,
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
      ownerId: ownerIdForLogs,
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

  return NextResponse.json(
    {
      ok: true,
      data: {
        invoiceId,
        estateId: estateIdStr,
        status: nextStatus,
      },
    },
    { status: 200, headers: NO_STORE_HEADERS }
  );
}