import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Invoice } from "@/models/Invoice";
import { auth } from "@/lib/auth";

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

  // Redirect back to the invoice detail page
  const estateIdStr =
    typeof invoice.estateId === "string"
      ? invoice.estateId
      : (invoice.estateId as { toString: () => string }).toString();

  const invoiceIdStr =
    typeof invoice._id === "string"
      ? invoice._id
      : (invoice._id as { toString: () => string }).toString();

  return NextResponse.redirect(
    new URL(
      `/app/estates/${estateIdStr}/invoices/${invoiceIdStr}`,
      req.url,
    ),
  );
}