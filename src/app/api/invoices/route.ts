import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Invoice } from "@/models/Invoice";
import { auth } from "@/lib/auth";

type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "VOID";

type InvoiceAmountLike = {
  totalAmount?: number;
  subtotal?: number;
};

const toNumber = (inv: InvoiceAmountLike): number => {
  if (typeof inv.totalAmount === "number") return inv.totalAmount;
  if (typeof inv.subtotal === "number") return inv.subtotal;
  return 0;
};

type InvoiceLeanForSummary = {
  _id: string | { toString: () => string };
  estateId?: string | { toString: () => string };
  status?: string;
  issueDate?: Date;
  dueDate?: Date;
  subtotal?: number;
  totalAmount?: number;
  notes?: string;
};

export async function GET(req: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const searchParams = url.searchParams;

  const estateId = searchParams.get("estateId");
  const includeSummary =
    searchParams.get("summary") === "1" ||
    searchParams.get("summary") === "true";

  await connectToDatabase();

  const baseQuery: Record<string, unknown> = {
    ownerId: session.user.id,
  };

  if (estateId) {
    baseQuery.estateId = estateId;
  }

  // Fetch all invoices (for summary) and sort newest first
  const allInvoices = (await Invoice.find(baseQuery)
    .sort({ issueDate: -1, createdAt: -1 })
    .select("status issueDate dueDate subtotal totalAmount notes estateId")
    .lean()) as InvoiceLeanForSummary[];

  const latestInvoices = allInvoices.slice(0, 5).map((inv) => ({
    _id:
      typeof inv._id === "string"
        ? inv._id
        : inv._id.toString(),
    estateId:
      typeof inv.estateId === "string"
        ? inv.estateId
        : inv.estateId?.toString(),
    status: inv.status,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    subtotal: inv.subtotal,
    totalAmount: inv.totalAmount,
    notes: inv.notes,
  }));

  if (!includeSummary) {
    return NextResponse.json({ invoices: latestInvoices });
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  let unpaidTotal = 0;
  let overdueCount = 0;
  let mtdBilled = 0;

  for (const inv of allInvoices) {
    const status = String(inv.status || "DRAFT").toUpperCase();
    const isPaidOrVoid = status === "PAID" || status === "VOID";
    const amount = toNumber(inv);

    // Unpaid / overdue
    if (!isPaidOrVoid) {
      unpaidTotal += amount;

      const due =
        inv.dueDate instanceof Date
          ? inv.dueDate
          : inv.dueDate
          ? new Date(inv.dueDate)
          : null;

      if (due && due < now) {
        overdueCount += 1;
      }
    }

    // Month-to-date billed: count all non-VOID invoices issued this month
    const issue =
      inv.issueDate instanceof Date
        ? inv.issueDate
        : inv.issueDate
        ? new Date(inv.issueDate)
        : null;

    if (issue && issue >= startOfMonth && issue <= now && status !== "VOID") {
      mtdBilled += amount;
    }
  }

  return NextResponse.json({
    invoices: latestInvoices,
    summary: {
      unpaidTotal,
      overdueCount,
      mtdBilled,
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();

  const estateId = formData.get("estateId");
  const issueDateRaw = formData.get("issueDate");
  const dueDateRaw = formData.get("dueDate");
  const statusRaw = formData.get("status");
  const amountRaw = formData.get("amount");
  const notesRaw = formData.get("notes") ?? formData.get("memo");

  if (typeof estateId !== "string" || !estateId) {
    return NextResponse.json({ error: "Missing estateId" }, { status: 400 });
  }

  await connectToDatabase();

  const now = new Date();

  const issueDate =
    typeof issueDateRaw === "string" && issueDateRaw
      ? new Date(issueDateRaw)
      : now;

  const dueDate =
    typeof dueDateRaw === "string" && dueDateRaw
      ? new Date(dueDateRaw)
      : now;

  const status = (typeof statusRaw === "string"
    ? statusRaw.toUpperCase()
    : "DRAFT") as InvoiceStatus;

  const amount =
    typeof amountRaw === "string" && amountRaw.trim() !== ""
      ? Number(amountRaw)
      : 0;

  const notes = typeof notesRaw === "string" ? notesRaw.trim() : "";

  const safeAmount = Number.isFinite(amount) ? amount : 0;

  type NewInvoiceLineItem = {
    type: "TIME" | "EXPENSE" | "ADJUSTMENT";
    label: string;
    quantity: number;
    rate: number;
    amount: number;
  };

  const lineItems: NewInvoiceLineItem[] =
    safeAmount > 0
      ? [
          {
            type: "ADJUSTMENT",
            label: notes || "Invoice amount",
            quantity: 1,
            rate: safeAmount,
            amount: safeAmount,
          },
        ]
      : [];

  // Create the invoice document
  const invoiceDoc = await Invoice.create({
    ownerId: session.user.id,
    estateId,
    status,
    issueDate,
    dueDate,
    notes,
    currency: "USD",
    lineItems,
  });

  // Redirect to the new invoice detail page
  return NextResponse.redirect(
    new URL(`/app/estates/${estateId}/invoices/${invoiceDoc._id}`, req.url),
  );
}