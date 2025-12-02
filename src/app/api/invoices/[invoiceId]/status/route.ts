import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Invoice } from "@/models/Invoice";
import { auth } from "@/lib/auth";
import { logEstateEvent } from "@/lib/estateEvents";

type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "VOID";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ invoiceId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { invoiceId } = await context.params;

  await connectToDatabase();

  const formData = await req.formData();
  const statusRaw = formData.get("status");

  if (typeof statusRaw !== "string") {
    return NextResponse.json({ error: "Missing status" }, { status: 400 });
  }

  const status = statusRaw.toUpperCase() as InvoiceStatus;

  // fetch old invoice to capture previous status
  const existingInvoice = await Invoice.findOne(
    { _id: invoiceId, ownerId: session.user.id },
    { status: 1, estateId: 1, invoiceNumber: 1, subtotal: 1, totalAmount: 1 },
  ).lean();

  if (!existingInvoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const previousStatus = existingInvoice.status
    ? String(existingInvoice.status).toUpperCase()
    : null;

  const update: Record<string, unknown> = { status };

  if (status === "PAID") {
    // when marked PAID, record the paid date
    update.paidAt = new Date();
  } else {
    // if you change away from PAID, clear paidAt
    update.paidAt = undefined;
  }

  const invoice = await Invoice.findOneAndUpdate(
    { _id: invoiceId, ownerId: session.user.id },
    update,
    { new: true },
  ).lean();

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  // Log estate event for status change
  const invoiceIdStr =
    typeof invoice._id === "string"
      ? invoice._id
      : (invoice._id as { toString: () => string }).toString();

  const estateIdStr =
    typeof invoice.estateId === "string"
      ? invoice.estateId
      : (invoice.estateId as { toString: () => string }).toString();

  const invoiceNumberLabel =
    (existingInvoice.invoiceNumber as string | undefined) ||
    `…${invoiceIdStr.slice(-6)}`;

  await logEstateEvent({
    ownerId: session.user.id,
    estateId: estateIdStr,
    type: "INVOICE_STATUS_CHANGED",
    summary: `Invoice ${invoiceNumberLabel} marked ${status}`,
    detail: `Status changed: ${previousStatus ?? "UNKNOWN"} → ${status}`,
    meta: {
      invoiceId: invoiceIdStr,
      previousStatus,
      newStatus: status,
    },
  });

  return NextResponse.redirect(
    new URL(
      `/app/estates/${estateIdStr}/invoices/${invoiceIdStr}`,
      req.url,
    ),
  );
}