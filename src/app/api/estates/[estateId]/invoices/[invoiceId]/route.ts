import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Invoice } from "@/models/Invoice";

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ estateId: string; invoiceId: string }> }
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { estateId, invoiceId } = await params;
  await connectToDatabase();

  const invoice = await Invoice.findOne({
    _id: invoiceId,
    estateId,
    ownerId: session.user.id,
  }).lean();

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  return NextResponse.json({ invoice });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ estateId: string; invoiceId: string }> }
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { estateId, invoiceId } = await params;
  await connectToDatabase();

  let body: UpdateInvoiceBody;
  try {
    body = (await request.json()) as UpdateInvoiceBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if (body.status && ["DRAFT", "SENT", "PAID", "VOID"].includes(body.status)) {
    update.status = body.status;
  }

  if (body.issueDate) {
    update.issueDate = new Date(body.issueDate);
  }

  if (body.dueDate) {
    update.dueDate = new Date(body.dueDate);
  }

  if (body.paidAt === null) {
    update.paidAt = undefined;
  } else if (body.paidAt) {
    update.paidAt = new Date(body.paidAt);
  }

  if (typeof body.notes === "string") {
    update.notes = body.notes;
  }

  if (typeof body.taxRate === "number") {
    update.taxRate = body.taxRate;
  }

  if (body.lineItems && Array.isArray(body.lineItems)) {
    update.lineItems = body.lineItems.map((item) => ({
      type: item.type,
      label: item.label,
      quantity: typeof item.quantity === "number" ? item.quantity : undefined,
      rate: typeof item.rate === "number" ? item.rate : undefined,
      amount: typeof item.amount === "number" ? item.amount : undefined,
      sourceTimeEntryId: item.sourceTimeEntryId,
      sourceExpenseId: item.sourceExpenseId,
    }));
  }

  const invoice = await Invoice.findOne({
    _id: invoiceId,
    estateId,
    ownerId: session.user.id,
  });

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  Object.assign(invoice, update);
  await invoice.save(); // pre-save hook will recompute totals

  return NextResponse.json({ invoice });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ estateId: string; invoiceId: string }> }
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { estateId, invoiceId } = await params;
  await connectToDatabase();

  const deleted = await Invoice.findOneAndDelete({
    _id: invoiceId,
    estateId,
    ownerId: session.user.id,
  }).lean();

  if (!deleted) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}