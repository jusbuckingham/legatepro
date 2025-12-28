import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { Invoice } from "@/models/Invoice";
import { auth } from "@/lib/auth";
import { logEstateEvent } from "@/lib/estateEvents";
import { WorkspaceSettings } from "@/models/WorkspaceSettings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CreateInvoicePayload = {
  estateId: string;
  issueDate?: string | Date;
  dueDate?: string | Date;
  notes?: string;
  status?: "DRAFT" | "SENT" | "UNPAID" | "PARTIAL" | "PAID" | "VOID";
  currency?: string;
  lineItems?: {
    // Legacy/editor-friendly fields
    description?: string;
    quantity?: number;
    unitPriceCents?: number;
    amountCents?: number;
    // New schema/editor fields
    label?: string;
    type?: string;
    amount?: number; // may be dollars or cents depending on caller
    rate?: number; // may be dollars or cents depending on caller
  }[];
};

type InvoiceListRow = {
  id: string;
  estateId: string;
  status: string;
  issueDate: Date | undefined;
  dueDate: Date | null;
  totalAmount: number;
  currency: string;
  invoiceNumber?: string | null;
  createdAt: Date | undefined;
};

function toObjectId(id: string) {
  return mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : null;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const ownerObjectId = toObjectId(session.user.id);
  if (!ownerObjectId) {
    return NextResponse.json({ ok: false, error: "Invalid user id" }, { status: 400 });
  }

  await connectToDatabase();

  const { searchParams } = new URL(req.url);
  const estateId = searchParams.get("estateId");
  const statusFilter = searchParams.get("status");
  const sort = searchParams.get("sort") ?? "issueDateDesc";

  const query: Record<string, unknown> = {
    ownerId: ownerObjectId,
  };

  if (estateId) {
    const estateObjectId = toObjectId(estateId);
    if (!estateObjectId) {
      return NextResponse.json({ ok: false, error: "Invalid estateId" }, { status: 400 });
    }
    query.estateId = estateObjectId;
  }

  if (statusFilter && statusFilter !== "ALL") {
    query.status = statusFilter;
  }

  const sortOption: Record<string, 1 | -1> = {};
  if (sort === "issueDateAsc") {
    sortOption.issueDate = 1;
  } else if (sort === "dueDateAsc") {
    sortOption.dueDate = 1;
  } else if (sort === "dueDateDesc") {
    sortOption.dueDate = -1;
  } else if (sort === "invoiceNumberAsc") {
    sortOption.invoiceNumber = 1;
  } else if (sort === "invoiceNumberDesc") {
    sortOption.invoiceNumber = -1;
  } else {
    // Default sort: newest first by issue date
    sortOption.issueDate = -1;
  }

  const invoices = await Invoice.find(query)
    .sort(sortOption)
    .lean()
    .exec();

  const rows: InvoiceListRow[] = invoices.map((inv) => ({
    id: String(inv._id),
    estateId: String(inv.estateId),
    status: inv.status ?? "DRAFT",
    issueDate: inv.issueDate,
    dueDate: inv.dueDate ?? null,
    totalAmount: inv.totalAmount ?? inv.subtotal ?? 0,
    currency: inv.currency ?? "USD",
    invoiceNumber: inv.invoiceNumber ?? null,
    createdAt: inv.createdAt,
  }));

  return NextResponse.json({ ok: true, invoices: rows }, { status: 200 });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const ownerObjectId = toObjectId(session.user.id);
  if (!ownerObjectId) {
    return NextResponse.json({ ok: false, error: "Invalid user id" }, { status: 400 });
  }

  await connectToDatabase();

  // For simple form submissions, we may only get a single "amount" value.
  // Track it separately so we can set subtotal/totalAmount without forcing lineItems.
  let amountFromFormCents = 0;

  const contentType = req.headers.get("content-type") ?? "";

  let body: CreateInvoicePayload;

  if (contentType.includes("application/json")) {
    // JSON payload – assume the editor will send proper lineItems and/or totals.
    body = (await req.json()) as CreateInvoicePayload;
  } else {
    // Handle standard form submissions (e.g., from the estate-scoped New Invoice page)
    const form = await req.formData();

    const estateId = form.get("estateId")?.toString() ?? "";
    const issueDate = form.get("issueDate")?.toString() ?? undefined;
    const dueDate = form.get("dueDate")?.toString() ?? undefined;
    const notes = form.get("notes")?.toString() ?? undefined;
    const statusRaw = form.get("status")?.toString() ?? undefined;
    const currency = form.get("currency")?.toString() ?? undefined;
    const amountRaw =
      form.get("amount")?.toString() ??
      form.get("amountCents")?.toString() ??
      form.get("totalAmount")?.toString() ??
      form.get("totalAmountCents")?.toString() ??
      undefined;

    // For schema-backed invoices, we don't want to create partial line items here
    // (they would fail validation because amount/rate/label/type are required).
    // Instead, capture a single total amount in cents and let lineItems be empty.
    const lineItems: CreateInvoicePayload["lineItems"] = [];

    if (typeof amountRaw === "string" && amountRaw.trim().length > 0) {
      const cleaned = amountRaw.replace(/[,$]/g, "").trim();
      const asNumber = Number.parseFloat(cleaned);
      if (Number.isFinite(asNumber) && asNumber > 0) {
        amountFromFormCents = Math.round(asNumber * 100);
      }
    }

    // Fallback: scan all form fields for something that looks like an amount
    // whose name includes "amount" (case-insensitive).
    if (amountFromFormCents === 0) {
      for (const [key, value] of form.entries()) {
        if (!value) continue;
        const valStr = value.toString().trim();
        if (!valStr) continue;
        if (!/amount/i.test(key)) continue;

        const cleaned = valStr.replace(/[,$]/g, "").trim();
        const parsed = Number.parseFloat(cleaned);
        if (Number.isFinite(parsed) && parsed > 0) {
          amountFromFormCents = Math.round(parsed * 100);
          break;
        }
      }
    }

    let status: CreateInvoicePayload["status"];
    if (
      statusRaw === "DRAFT" ||
      statusRaw === "SENT" ||
      statusRaw === "UNPAID" ||
      statusRaw === "PARTIAL" ||
      statusRaw === "PAID" ||
      statusRaw === "VOID"
    ) {
      status = statusRaw;
    } else {
      status = undefined;
    }

    body = {
      estateId,
      issueDate,
      dueDate,
      notes,
      status,
      currency,
      lineItems,
    };
  }

  const {
    estateId,
    issueDate,
    dueDate,
    notes,
    status = "DRAFT",
    currency: currencyFromBody,
    lineItems = [],
  } = body;

  if (!estateId) {
    return NextResponse.json({ ok: false, error: "estateId is required" }, { status: 400 });
  }

  const estateObjectId = toObjectId(estateId);
  if (!estateObjectId) {
    return NextResponse.json({ ok: false, error: "Invalid estateId" }, { status: 400 });
  }

  // Load workspace settings for defaults (WorkspaceSettings.ownerId is a string in this project)
  const settings = await WorkspaceSettings.findOne({
    ownerId: session.user.id,
  })
    .lean()
    .catch(() => null as unknown as null);

  const currency =
    (typeof currencyFromBody === "string" && currencyFromBody.trim().length > 0
      ? currencyFromBody.trim().toUpperCase()
      : undefined) ?? (settings?.defaultCurrency ?? "USD");

  const defaultRateCents =
    typeof settings?.defaultHourlyRateCents === "number"
      ? settings.defaultHourlyRateCents
      : 0;

  const notesToUse =
    typeof notes === "string" && notes.trim().length > 0 ? notes : undefined;

  let resolvedDueDate: Date | string | undefined = dueDate;

  if (!resolvedDueDate && issueDate) {
    try {
      const base = new Date(issueDate);
      if (!Number.isNaN(base.getTime())) {
        const terms = settings?.defaultInvoiceTerms ?? "NET_30";
        const days =
          terms === "NET_15"
            ? 15
            : terms === "NET_45"
            ? 45
            : terms === "NET_60"
            ? 60
            : terms === "DUE_ON_RECEIPT"
            ? 0
            : 30;

        if (days > 0) {
          resolvedDueDate = new Date(
            base.getTime() + days * 24 * 60 * 60 * 1000
          );
        } else {
          resolvedDueDate = base;
        }
      }
    } catch {
      // if anything goes wrong, leave resolvedDueDate as-is
    }
  }

  // Compute subtotal/total from line items if available (supports both legacy and new editor shapes).
  const subtotalFromItems = Array.isArray(lineItems)
    ? lineItems.reduce((acc, item) => {
        const quantity = typeof item.quantity === "number" ? item.quantity : 0;

        const unitPriceCents =
          typeof item.unitPriceCents === "number" ? item.unitPriceCents : 0;

        const amountCentsField =
          typeof item.amountCents === "number" ? item.amountCents : 0;

        const amountField = typeof item.amount === "number" ? item.amount : 0;

        const rateField = typeof item.rate === "number" ? item.rate : 0;

        const explicitAmount =
          amountCentsField > 0
            ? amountCentsField
            : amountField > 0
            ? amountField > 10_000
              ? Math.round(amountField)
              : Math.round(amountField * 100)
            : 0;

        let effectiveUnit = 0;

        if (unitPriceCents > 0) {
          effectiveUnit = unitPriceCents;
        } else if (rateField > 0) {
          effectiveUnit =
            rateField > 10_000
              ? Math.round(rateField)
              : Math.round(rateField * 100);
        } else if (defaultRateCents > 0) {
          effectiveUnit = defaultRateCents;
        }

        const derived =
          quantity > 0 && effectiveUnit > 0 ? quantity * effectiveUnit : 0;

        return acc + (explicitAmount || derived);
      }, 0)
    : 0;

  // Prefer explicit line-item-derived subtotal when available; otherwise fall back
  // to the simple amount captured from the estate-scoped form.
  let safeAmount = subtotalFromItems;
  if (safeAmount === 0 && amountFromFormCents > 0) {
    safeAmount = amountFromFormCents;
  }

  // 🔢 Auto-generate a human-friendly invoice number per owner.
  // Best-effort, non-transactional sequence suitable for MVP.
  let invoiceNumber: string | undefined;
  try {
    const lastInvoiceForOwner = await Invoice.findOne({
      ownerId: ownerObjectId,
    })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    let nextSeq = 1;
    if (lastInvoiceForOwner?.invoiceNumber) {
      const match = lastInvoiceForOwner.invoiceNumber.match(/(\d+)$/);
      if (match) {
        const parsed = Number.parseInt(match[1], 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          nextSeq = parsed + 1;
        }
      }
    }

    invoiceNumber = `INV-${nextSeq.toString().padStart(6, "0")}`;
  } catch {
    // Fallback: timestamp-based suffix if something goes wrong.
    const fallback = Date.now().toString().slice(-6);
    invoiceNumber = `INV-${fallback}`;
  }

  const invoiceDoc = await Invoice.create({
    ownerId: ownerObjectId,
    estateId: estateObjectId,
    status,
    issueDate,
    dueDate: resolvedDueDate ?? undefined,
    notes: notesToUse,
    currency,
    lineItems: Array.isArray(lineItems) ? lineItems : [],
    subtotal: safeAmount,
    totalAmount: safeAmount,
    invoiceNumber,
  });

  // Log estate event for the new invoice (EstateEvent.estateId is stored as a string)
  try {
    await logEstateEvent({
      estateId: String(estateObjectId),
      ownerId: session.user.id,
      type: "INVOICE_CREATED",
      summary: "Invoice created",
    });
  } catch {
    // Don't block invoice creation if event logging fails
  }

  // Redirect back to the app UI after create (for form submits) while preserving JSON for XHR/SPA.
  const acceptHeader = req.headers.get("accept") ?? "";
  const isHtmlRequest = acceptHeader.includes("text/html");

  if (isHtmlRequest) {
    const redirectUrl = `/app/estates/${estateId}/invoices/${invoiceDoc._id}`;
    return NextResponse.redirect(new URL(redirectUrl, req.url), { status: 303 });
  }

  return NextResponse.json(
    {
      ok: true,
      invoice: {
        id: String(invoiceDoc._id),
        estateId: String(invoiceDoc.estateId),
        status: invoiceDoc.status,
        issueDate: invoiceDoc.issueDate,
        dueDate: invoiceDoc.dueDate ?? null,
        totalAmount: invoiceDoc.totalAmount ?? safeAmount,
        currency: invoiceDoc.currency ?? currency,
        invoiceNumber: invoiceDoc.invoiceNumber ?? invoiceNumber ?? null,
      },
    },
    { status: 201 }
  );
}