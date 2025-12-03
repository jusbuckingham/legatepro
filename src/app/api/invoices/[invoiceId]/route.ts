import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Invoice } from "@/models/Invoice";

type InvoiceStatus = "DRAFT" | "SENT" | "UNPAID" | "PARTIAL" | "PAID" | "VOID";

type InvoiceUpdateLineItem = {
  type: "TIME" | "EXPENSE" | "ADJUSTMENT";
  label: string;
  quantity: number;
  rateCents: number;
  amountCents: number;
};

type InvoiceUpdateBody = {
  estateId?: string;
  status?: string;
  issueDate?: string;
  dueDate?: string;
  notes?: string;
  lineItems?: unknown;
};

const allowedLineItemTypes = ["TIME", "EXPENSE", "ADJUSTMENT"] as const;

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  const { invoiceId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();

  let body: InvoiceUpdateBody | null = null;
  try {
    body = (await req.json()) as InvoiceUpdateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { estateId, status, issueDate, dueDate, notes, lineItems } = body;

  if (!estateId || typeof estateId !== "string") {
    return NextResponse.json(
      { error: "Missing or invalid estateId" },
      { status: 400 },
    );
  }

  const invoiceDoc = await Invoice.findOne({
    _id: invoiceId,
    ownerId: session.user.id,
    estateId,
  });

  if (!invoiceDoc) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const parsedIssueDate =
    typeof issueDate === "string" && issueDate
      ? new Date(issueDate)
      : invoiceDoc.issueDate ?? new Date();

  const parsedDueDate =
    typeof dueDate === "string" && dueDate
      ? new Date(dueDate)
      : invoiceDoc.dueDate ?? parsedIssueDate;

  const statusUpper = (
    typeof status === "string" && status
      ? status.toUpperCase()
      : invoiceDoc.status || "DRAFT"
  ) as InvoiceStatus;

  let normalizedLineItems: InvoiceUpdateLineItem[];

  if (Array.isArray(lineItems) && lineItems.length > 0) {
    normalizedLineItems = lineItems.map((raw): InvoiceUpdateLineItem => {
      const obj = raw as Record<string, unknown>;

      const typeRaw =
        typeof obj.type === "string" ? obj.type.toUpperCase() : "ADJUSTMENT";

      const type = (allowedLineItemTypes.includes(
        typeRaw as (typeof allowedLineItemTypes)[number],
      )
        ? typeRaw
        : "ADJUSTMENT") as InvoiceUpdateLineItem["type"];

      const label =
        typeof obj.label === "string" ? obj.label.trim() : "Line item";

      const quantity = toNumber(obj.quantity);

      // We accept either rate (dollars) or rateCents (cents) from the client.
      const rawRate =
        "rateCents" in obj && typeof (obj as Record<string, unknown>).rateCents !== "undefined"
          ? toNumber((obj as Record<string, unknown>).rateCents)
          : toNumber(obj.rate);

      // Normalize to cents: if the value is large, treat as already cents,
      // otherwise treat as dollars and multiply by 100.
      const rateCents =
        rawRate > 10_000 ? Math.round(rawRate) : Math.round(rawRate * 100);

      // We also accept explicit amount/amountCents from the client, otherwise derive from quantity * rateCents.
      const rawAmount =
        "amountCents" in obj && typeof (obj as Record<string, unknown>).amountCents !== "undefined"
          ? toNumber((obj as Record<string, unknown>).amountCents)
          : toNumber(
              "amount" in obj ? (obj as Record<string, unknown>).amount : undefined,
            );

      const amountCents =
        rawAmount > 0
          ? (rawAmount > 10_000 ? Math.round(rawAmount) : Math.round(rawAmount * 100))
          : quantity * rateCents;

      return {
        type,
        label,
        quantity,
        rateCents,
        amountCents,
      };
    });
  } else {
    normalizedLineItems = (invoiceDoc.lineItems ?? []) as unknown as InvoiceUpdateLineItem[];
  }

  const subtotal = normalizedLineItems.reduce(
    (sum, li) => sum + (li.amountCents ?? 0),
    0,
  );

  invoiceDoc.set({
    status: statusUpper,
    issueDate: parsedIssueDate,
    dueDate: parsedDueDate,
    notes:
      typeof notes === "string" ? notes.trim() : (invoiceDoc.notes as string),
    lineItems: normalizedLineItems,
    subtotal,
    totalAmount: subtotal,
  });

  await invoiceDoc.save();

  return NextResponse.json({ ok: true });
}