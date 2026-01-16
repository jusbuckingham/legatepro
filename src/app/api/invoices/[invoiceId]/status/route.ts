import { NextRequest } from "next/server";
import { Types } from "mongoose";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { getEstateAccess } from "@/lib/estateAccess";
import { Invoice, type InvoiceStatus } from "@/models/Invoice";
import { Estate } from "@/models/Estate";
import { User } from "@/models/User";
import { EntitlementError, requirePro, toEntitlementsUser } from "@/lib/entitlements";
import { logEstateEvent } from "@/lib/estateEvents";
import { logActivity } from "@/lib/activity";
import {
  jsonErr,
  jsonOk,
  noStoreHeaders,
  requireObjectIdLike,
  safeErrorMessage,
} from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

type RouteParams = {
  invoiceId: string;
};

type RouteContext = {
  params: Promise<RouteParams>;
};

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

export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const headers = noStoreHeaders();
  const session = await auth();
  if (!session?.user?.id) {
    return jsonErr("Unauthorized", 401, "UNAUTHORIZED", { headers });
  }

  const { invoiceId } = await ctx.params;

  if (!requireObjectIdLike(invoiceId)) {
    return jsonErr("Invalid invoiceId", 400, "BAD_REQUEST", { headers });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonErr("Invalid JSON body", 400, "BAD_REQUEST", { headers });
  }

  const nextStatus = normalizeStatus((body as { status?: unknown })?.status);
  if (!nextStatus) {
    return jsonErr("Invalid status. Use DRAFT | SENT | PAID | VOID", 400, "BAD_REQUEST", { headers });
  }

  await connectToDatabase();

  // Billing enforcement: changing invoice status is Pro-only
  const user = await User.findById(session.user.id).lean().exec();
  if (!user) {
    return jsonErr("Unauthorized", 401, "UNAUTHORIZED", { headers });
  }

  try {
    requirePro(toEntitlementsUser(user));
  } catch (e) {
    if (e instanceof EntitlementError) {
      return jsonErr("Pro subscription required", 402, e.code, { headers });
    }
    throw e;
  }

  const invoice = await Invoice.findById(new Types.ObjectId(invoiceId));

  if (!invoice) {
    return jsonErr("Invoice not found", 404, "NOT_FOUND", { headers });
  }

  const access = await getEstateAccess({
    estateId: String(invoice.estateId),
    userId: session.user.id,
    atLeastRole: "EDITOR",
  });

  if (!access || !access.canEdit) {
    return jsonErr("Invoice not found", 404, "NOT_FOUND", { headers });
  }

  const previousStatusRaw = invoice.status ? String(invoice.status).toUpperCase() : null;
  const previousFriendly = friendlyStatus(previousStatusRaw);
  const nextFriendly = friendlyStatus(nextStatus);

  // No-op: still return ok, but don’t spam logs
  if (previousStatusRaw === nextStatus) {
    return jsonOk(
      {
        invoiceId,
        status: nextStatus,
        message: "Status unchanged",
      },
      { headers },
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
  } catch (err) {
    console.error("logEstateEvent failed:", safeErrorMessage(err));
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
  } catch (err) {
    console.error("logActivity failed:", safeErrorMessage(err));
    // don’t block status change if activity logging fails
  }

  return jsonOk(
    {
      invoiceId,
      estateId: estateIdStr,
      status: nextStatus,
    },
    { headers },
  );
}