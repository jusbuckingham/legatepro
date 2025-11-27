import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Invoice } from "@/models/Invoice";

type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "VOID";
type InvoiceStatusFilter = "ALL" | InvoiceStatus;

type InvoiceLineItemInput = {
  type: "TIME" | "EXPENSE" | "ADJUSTMENT";
  label: string;
  quantity?: number;
  rate?: number;
  amount?: number;
  sourceTimeEntryId?: string;
  sourceExpenseId?: string;
};

type CreateInvoiceBody = {
  invoiceNumber?: string;
  issueDate?: string;
  dueDate?: string;
  notes?: string;
  taxRate?: number;
  status?: InvoiceStatus;
  lineItems: InvoiceLineItemInput[];
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ estateId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { estateId } = await params;

    await connectToDatabase();

    const url = new URL(request.url);
    const statusParam = url.searchParams.get("status");

    let statusFilter: InvoiceStatusFilter = "ALL";
    if (typeof statusParam === "string") {
      const normalized = statusParam.toUpperCase();
      if (
        normalized === "DRAFT" ||
        normalized === "SENT" ||
        normalized === "PAID" ||
        normalized === "VOID"
      ) {
        statusFilter = normalized as InvoiceStatus;
      }
    }

    const query: Record<string, unknown> = {
      estateId,
      ownerId: session.user.id,
    };

    if (statusFilter !== "ALL") {
      query.status = statusFilter;
    }

    const invoices = await Invoice.find(query)
      .sort({ issueDate: -1, createdAt: -1 })
      .lean();

    return NextResponse.json({ invoices });
  } catch (error) {
    console.error("[GET /api/estates/[estateId]/invoices] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch invoices" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ estateId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { estateId } = await params;
    await connectToDatabase();

    let body: CreateInvoiceBody;
    try {
      body = (await request.json()) as CreateInvoiceBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (
      !body.lineItems ||
      !Array.isArray(body.lineItems) ||
      body.lineItems.length === 0
    ) {
      return NextResponse.json(
        { error: "At least one line item is required" },
        { status: 400 }
      );
    }

    // Basic validation + sanitization of line items
    const sanitizedLineItems: InvoiceLineItemInput[] = body.lineItems.map(
      (item) => ({
        type: item.type,
        label: item.label,
        quantity:
          typeof item.quantity === "number" && !Number.isNaN(item.quantity)
            ? item.quantity
            : undefined,
        rate:
          typeof item.rate === "number" && !Number.isNaN(item.rate)
            ? item.rate
            : undefined,
        amount:
          typeof item.amount === "number" && !Number.isNaN(item.amount)
            ? item.amount
            : undefined,
        sourceTimeEntryId: item.sourceTimeEntryId,
        sourceExpenseId: item.sourceExpenseId,
      })
    );

    let invoiceNumber = body.invoiceNumber;

    // If no invoiceNumber provided, generate a simple sequential number per estate+owner
    if (!invoiceNumber) {
      const latest = await Invoice.findOne({
        estateId,
        ownerId: session.user.id,
      })
        .sort({ createdAt: -1 })
        .lean<{ invoiceNumber?: string } | null>();

      if (latest?.invoiceNumber) {
        const match = latest.invoiceNumber.match(/(\d+)(?!.*\d)/);
        if (match) {
          const current = Number.parseInt(match[1], 10);
          if (!Number.isNaN(current)) {
            const next = (current + 1).toString().padStart(match[1].length, "0");
            invoiceNumber = latest.invoiceNumber.replace(/(\d+)(?!.*\d)/, next);
          }
        }
      }

      if (!invoiceNumber) {
        const count = await Invoice.countDocuments({
          estateId,
          ownerId: session.user.id,
        });

        const sequential = (count + 1).toString().padStart(3, "0");
        invoiceNumber = `INV-${sequential}`;
      }
    }

    const invoice = new Invoice({
      estateId,
      ownerId: session.user.id,
      status: body.status ?? "DRAFT",
      invoiceNumber,
      issueDate: body.issueDate ? new Date(body.issueDate) : new Date(),
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      notes: body.notes ?? "",
      currency: "USD",
      taxRate:
        typeof body.taxRate === "number" && !Number.isNaN(body.taxRate)
          ? body.taxRate
          : 0,
      lineItems: sanitizedLineItems,
    });

    await invoice.save(); // pre-save hook in the model will calculate totals

    return NextResponse.json(
      {
        invoice,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/estates/[estateId]/invoices] Error:", error);
    return NextResponse.json(
      { error: "Failed to create invoice" },
      { status: 500 }
    );
  }
}