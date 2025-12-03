import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Invoice } from "@/models/Invoice";
import { auth } from "@/lib/auth";

type InvoiceStatus =
  | "DRAFT"
  | "SENT"
  | "UNPAID"
  | "PARTIAL"
  | "PAID"
  | "VOID";

const ALLOWED_STATUSES: InvoiceStatus[] = [
  "DRAFT",
  "SENT",
  "UNPAID",
  "PARTIAL",
  "PAID",
  "VOID",
];

export async function POST(
  req: NextRequest,
  { params }: { params: { invoiceId: string } },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { invoiceId } = params;

  // Handle form-encoded body from <form method="POST">
  const formData = await req.formData();
  const statusRaw = formData.get("status");

  if (typeof statusRaw !== "string") {
    return NextResponse.json({ error: "Missing status" }, { status: 400 });
  }

  const status = statusRaw.toUpperCase() as InvoiceStatus;

  if (!ALLOWED_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  await connectToDatabase();

  const update: Record<string, unknown> = { status };

  if (status === "PAID") {
    // when marked PAID, record the paid date
    update.paidAt = new Date();
  } else {
    // if status is changed away from PAID, clear paidAt
    update.paidAt = undefined;
  }

  const updated = await Invoice.findOneAndUpdate(
    {
      _id: invoiceId,
      ownerId: session.user.id,
    },
    update,
    { new: true },
  ).lean();

  if (!updated) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  // Redirect back to invoice detail page
  const estateIdStr =
    typeof updated.estateId === "string"
      ? updated.estateId
      : (updated.estateId as { toString: () => string }).toString();

  const invoiceIdStr =
    typeof updated._id === "string"
      ? updated._id
      : (updated._id as { toString: () => string }).toString();

  return NextResponse.redirect(
    new URL(
      `/app/estates/${estateIdStr}/invoices/${invoiceIdStr}`,
      req.url,
    ),
  );
}