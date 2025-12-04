import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Invoice } from "@/models/Invoice";
import { auth } from "@/lib/auth";
import { logEstateEvent } from "@/lib/estateEvents";
import { WorkspaceSettings } from "@/models/WorkspaceSettings";

// Narrow type for the lean()ed invoice objects we return from GET
type InvoiceListRow = {
  _id: unknown;
  estateId: unknown;
  status?: string;
  issueDate?: Date;
  dueDate?: Date | null;
  totalAmount?: number;
  subtotal?: number;
  currency?: string;
  invoiceNumber?: string | null;
  createdAt?: Date;
};

// Payload shape we accept for JSON-based invoice creation
export type CreateInvoicePayload = {
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
    amount?: number; // dollars or cents depending on caller
    rate?: number; // dollars or cents depending on caller
  }[];
};

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();

  const { searchParams } = new URL(req.url);
  const estateId = searchParams.get("estateId");
  const statusFilter = searchParams.get("status");
  const sort = searchParams.get("sort") ?? "issueDateDesc";

  const query: Record<string, unknown> = {
    ownerId: session.user.id,
  };

  if (estateId) {
    query.estateId = estateId;
  }

  if (statusFilter && statusFilter !== "ALL") {
    query.status = statusFilter;
  }

  const sortOption: Record<string, 1 | -1> = {};
  if (sort === "issueDateAsc") sortOption.issueDate = 1;
  else if (sort === "dueDateAsc") sortOption.dueDate = 1;
  else if (sort === "dueDateDesc") sortOption.dueDate = -1;
  else sortOption.issueDate = -1;

  const invoices = await Invoice.find(query)
    .sort(sortOption)
    .lean()
    .exec();

  return NextResponse.json(
    invoices.map((inv) => {
      const row = inv as InvoiceListRow;

      return {
        id: String(row._id),
        estateId: String(row.estateId),
        status: row.status ?? "DRAFT",
        issueDate: row.issueDate,
        dueDate: row.dueDate ?? null,
        totalAmount: row.totalAmount ?? row.subtotal ?? 0,
        currency: row.currency ?? "USD",
        invoiceNumber: row.invoiceNumber ?? null,
        createdAt: row.createdAt,
      };
    }),
  );
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    return NextResponse.json(
      { error: "estateId is required" },
      { status: 400 },
    );
  }

  // Load workspace settings for defaults
  const settings = await WorkspaceSettings.findOne({
    ownerId: session.user.id,
  })
    .lean()
    .catch(() => null as unknown as null);

  const currency =
    (typeof currencyFromBody === "string" &&
    currencyFromBody.trim().length > 0
      ? currencyFromBody.trim().toUpperCase()
      : undefined) ?? (settings?.defaultCurrency ?? "USD");

  const defaultRateCents =
    typeof settings?.defaultHourlyRateCents === "number"
      ? settings.defaultHourlyRateCents
      : 0;

  const notesToUse =
    typeof notes === "string" && notes.trim().length > 0
      ? notes
      : undefined;

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
            base.getTime() + days * 24 * 60 * 60 * 1000,
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
        const quantity =
          typeof item.quantity === "number" ? item.quantity : 0;

        const unitPriceCents =
          typeof item.unitPriceCents === "number"
            ? item.unitPriceCents
            : 0;

        const amountCentsField =
          typeof item.amountCents === "number" ? item.amountCents : 0;

        const amountField =
          typeof item.amount === "number" ? item.amount : 0;

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

  const invoiceDoc = await Invoice.create({
    ownerId: session.user.id,
    estateId,
    status,
    issueDate,
    dueDate: resolvedDueDate ?? undefined,
    notes: notesToUse,
    currency,
    lineItems: Array.isArray(lineItems) ? lineItems : [],
    subtotal: safeAmount,
    totalAmount: safeAmount,
  });

  // Log estate event for the new invoice (best-effort, non-blocking)
  try {
    await logEstateEvent({
      estateId,
      ownerId: session.user.id,
      type: "INVOICE_CREATED",
      summary: "Invoice created",
    });
  } catch {
    // Don't block invoice creation if event logging fails
  }

  // If the client explicitly wants JSON (e.g., editor or API consumer), return JSON.
  const acceptHeader = req.headers.get("accept") ?? "";
  const wantsJson = acceptHeader.includes("application/json");

  if (contentType.includes("application/json") || wantsJson) {
    return NextResponse.json(
      {
        id: String(invoiceDoc._id),
        estateId: String(invoiceDoc.estateId),
        status: invoiceDoc.status,
        issueDate: invoiceDoc.issueDate,
        dueDate: invoiceDoc.dueDate ?? null,
        totalAmount: invoiceDoc.totalAmount ?? safeAmount,
        currency: invoiceDoc.currency ?? currency,
      },
      { status: 201 },
    );
  }

  // Otherwise, assume a browser form post and redirect back into the app UI.
  const detailUrl = new URL(
    `/app/estates/${encodeURIComponent(
      estateId,
    )}/invoices/${encodeURIComponent(String(invoiceDoc._id))}`,
    req.url,
  );

  return NextResponse.redirect(detailUrl, { status: 303 });
}