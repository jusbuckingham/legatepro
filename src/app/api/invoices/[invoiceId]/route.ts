import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { Invoice } from "@/models/Invoice";
import { auth } from "@/lib/auth";
import { getEstateAccess } from "@/lib/estateAccess";

type RouteParams = {
  params: {
    invoiceId: string;
  };
};

type IncomingLineItem = {
  id?: string;
  label?: string;
  type?: string;
  description?: string;
  quantity?: number | string | null;
  rate?: number | string | null;
  amount?: number | string | null;
};

type NormalizedLineItem = {
  label: string;
  type: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  rateCents: number;
  amountCents: number;
};

const allowedStatuses = [
  "DRAFT",
  "SENT",
  "PAID",
  "VOID",
] as const;

type InvoiceStatus = (typeof allowedStatuses)[number];

function coerceStatus(value: unknown): InvoiceStatus | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if ((allowedStatuses as readonly string[]).includes(trimmed)) {
    return trimmed as InvoiceStatus;
  }
  return undefined;
}

/**
 * GET: return a single invoice (used by edit UI / debugging)
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();

  const { invoiceId } = params;

  const invoiceObjectId = mongoose.Types.ObjectId.isValid(invoiceId)
    ? new mongoose.Types.ObjectId(invoiceId)
    : null;

  const invoice = await Invoice.findOne({
    _id: invoiceObjectId ?? invoiceId,
  })
    .lean()
    .exec();

  if (!invoice) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const access = await getEstateAccess({
    estateId: String(invoice.estateId),
    userId: session.user.id,
    atLeastRole: "VIEWER",
  });

  if (!access) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      ok: true,
      data: {
        invoice: {
          id: String(invoice._id),
          estateId: String(invoice.estateId),
          status: invoice.status,
          issueDate: invoice.issueDate,
          dueDate: invoice.dueDate ?? null,
          notes: invoice.notes ?? "",
          currency: invoice.currency ?? "USD",
          subtotal: invoice.subtotal ?? 0,
          totalAmount: invoice.totalAmount ?? 0,
          lineItems: invoice.lineItems ?? [],
        },
      },
    },
    { status: 200 },
  );
}

/**
 * PUT: update invoice, with full line-item save logic.
 * Critical: we normalize each line item so that label, rate, and amount
 * are present if the row is not blank, and drop "empty" rows.
 */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();

  const body = (await req.json()) as {
    status?: string;
    issueDate?: string | Date | null;
    dueDate?: string | Date | null;
    notes?: string | null;
    currency?: string | null;
    lineItems?: IncomingLineItem[];
  };

  const { status, issueDate, dueDate, notes, currency, lineItems } = body;

  const { invoiceId } = params;

  const nextStatus = coerceStatus(status);

  const itemsArray = Array.isArray(lineItems) ? lineItems : [];

  const normalizedItems: NormalizedLineItem[] = itemsArray
    .map((raw: IncomingLineItem): NormalizedLineItem => {
      const label = (raw.label ?? "").toString().trim();
      const type = ((raw.type ?? "FEE").toString().trim() || "FEE") as string;
      const description =
        raw.description != null ? raw.description.toString() : "";

      const quantityNum =
        raw.quantity == null || raw.quantity === ""
          ? 1
          : Number(raw.quantity);

      const rateNum =
        raw.rate == null || raw.rate === ""
          ? 0
          : Number(
              typeof raw.rate === "string"
                ? raw.rate.replace(/[,$]/g, "")
                : raw.rate,
            );

      const amountNum =
        raw.amount == null || raw.amount === ""
          ? 0
          : Number(
              typeof raw.amount === "string"
                ? raw.amount.replace(/[,$]/g, "")
                : raw.amount,
            );

      // Compute a sensible amount if not explicitly provided
      const finalRate = Number.isFinite(rateNum) && rateNum > 0 ? rateNum : 0;
      const finalQuantity =
        Number.isFinite(quantityNum) && quantityNum > 0 ? quantityNum : 0;

      let finalAmount = 0;
      if (Number.isFinite(amountNum) && amountNum > 0) {
        finalAmount = amountNum;
      } else if (finalRate > 0 && finalQuantity > 0) {
        finalAmount = finalRate * finalQuantity;
      }

      return {
        label,
        type,
        description,
        quantity: finalQuantity || 0,
        rate: finalRate || 0,
        amount: finalAmount || 0,
        rateCents:
          finalRate > 0
            ? Math.round((finalRate as number) * 100)
            : 0,
        amountCents:
          finalAmount > 0
            ? Math.round((finalAmount as number) * 100)
            : 0,
      };
    })
    // Drop rows that are effectively empty to avoid validation errors
    .filter((item) => {
      const hasLabel = item.label && item.label.trim().length > 0;
      const hasAmount = typeof item.amount === "number" && item.amount > 0;
      const hasRate = typeof item.rate === "number" && item.rate > 0;
      return hasLabel || hasAmount || hasRate;
    });

  // Recompute subtotal/total in cents from normalized line items
  const subtotalCents = normalizedItems.reduce(
    (sum: number, item: { amountCents?: number; amount?: number }) => {
      if (typeof item.amountCents === "number" && item.amountCents > 0) {
        return sum + item.amountCents;
      }
      if (typeof item.amount === "number" && item.amount > 0) {
        return sum + Math.round(item.amount * 100);
      }
      return sum;
    },
    0,
  );

  const updateDoc: Record<string, unknown> = {};

  if (nextStatus) updateDoc.status = nextStatus;
  if (issueDate != null && issueDate !== "") updateDoc.issueDate = issueDate;
  if (dueDate != null && dueDate !== "") updateDoc.dueDate = dueDate;

  if (typeof notes === "string") {
    updateDoc.notes = notes.trim();
  }

  if (typeof currency === "string" && currency.trim()) {
    updateDoc.currency = currency.trim().toUpperCase();
  }

  updateDoc.lineItems = normalizedItems;
  updateDoc.subtotal = subtotalCents;
  updateDoc.totalAmount = subtotalCents;

  try {
    const invoiceObjectId = mongoose.Types.ObjectId.isValid(invoiceId)
      ? new mongoose.Types.ObjectId(invoiceId)
      : null;

    const existing = await Invoice.findOne({
      _id: invoiceObjectId ?? invoiceId,
    })
      .select("_id estateId")
      .lean()
      .exec();

    if (!existing) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const access = await getEstateAccess({
      estateId: String(existing.estateId),
      userId: session.user.id,
      atLeastRole: "EDITOR",
    });

    if (!access || !access.canEdit) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const estateIdStr = String(existing.estateId);
    const estateObjectId = mongoose.Types.ObjectId.isValid(estateIdStr)
      ? new mongoose.Types.ObjectId(estateIdStr)
      : null;
    const estateIdCandidates = [estateIdStr, estateObjectId].filter(Boolean);

    const updated: unknown = await Invoice.findOneAndUpdate(
      {
        _id: invoiceObjectId ?? invoiceId,
        estateId: { $in: estateIdCandidates },
      },
      { $set: updateDoc },
      { new: true, runValidators: true },
    )
      .lean()
      .exec();

    if (!updated) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const updatedDoc = updated as { estateId: unknown; _id: unknown };

    const estateId = String(updatedDoc.estateId);
    const updatedInvoiceId = String(updatedDoc._id);

    return NextResponse.json(
      {
        ok: true,
        data: {
          invoice: {
            id: updatedInvoiceId,
            estateId,
          },
        },
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("Error updating invoice", err);
    return NextResponse.json(
      { ok: false, error: "Failed to update invoice" },
      { status: 500 },
    );
  }
}

/**
 * DELETE: delete an invoice
 */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();

  const { invoiceId } = params;

  const invoiceObjectId = mongoose.Types.ObjectId.isValid(invoiceId)
    ? new mongoose.Types.ObjectId(invoiceId)
    : null;

  const existing = await Invoice.findOne({
    _id: invoiceObjectId ?? invoiceId,
  })
    .select("_id estateId")
    .lean()
    .exec();

  if (!existing) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const access = await getEstateAccess({
    estateId: String(existing.estateId),
    userId: session.user.id,
    atLeastRole: "EDITOR",
  });

  if (!access || !access.canEdit) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const estateIdStr = String(existing.estateId);
  const estateObjectId = mongoose.Types.ObjectId.isValid(estateIdStr)
    ? new mongoose.Types.ObjectId(estateIdStr)
    : null;
  const estateIdCandidates = [estateIdStr, estateObjectId].filter(Boolean);

  const deleted = await Invoice.findOneAndDelete({
    _id: invoiceObjectId ?? invoiceId,
    estateId: { $in: estateIdCandidates },
  })
    .lean()
    .exec();

  if (!deleted) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(
    { ok: true, data: { success: true, id: String(deleted._id) } },
    { status: 200 },
  );
}