import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Invoice } from "@/models/Invoice";
import { auth } from "@/lib/auth";

type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "VOID";

const ALLOWED_STATUSES: InvoiceStatus[] = ["DRAFT", "SENT", "PAID", "VOID"];

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

  const updated = await Invoice.findOneAndUpdate(
    {
      _id: invoiceId,
      ownerId: session.user.id,
    },
    { status },
    { new: true },
  ).lean();

  if (!updated) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  return NextResponse.redirect(
    new URL(
      `/app/estates/${updated.estateId}/invoices/${updated._id}`,
      req.url,
    ),
  );
}