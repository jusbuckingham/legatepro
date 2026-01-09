import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { Invoice } from "@/models/Invoice";
import { Estate } from "@/models/Estate";
import { auth } from "@/lib/auth";
import { buildEstateAccessOr, getEstateAccess } from "@/lib/estateAccess";
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

function idToString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (value instanceof mongoose.Types.ObjectId) return value.toString();

  try {
    const str = String(value);
    return str.length > 0 ? str : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();

  type EstateIdLean = { _id: unknown };

  const accessibleEstates = (await Estate.find({
    $or: buildEstateAccessOr(session.user.id),
  })
    .select("_id")
    .lean()
    .exec()) as EstateIdLean[];

  const allowedEstateIds = accessibleEstates
    .map((e: EstateIdLean) => idToString(e._id))
    .filter((v: string | null): v is string => typeof v === "string" && v.length > 0);

  if (allowedEstateIds.length === 0) {
    return NextResponse.json({ ok: true, invoices: [] }, { status: 200 });
  }

  const allowedEstateObjectIds = allowedEstateIds
    .map((id: string) => toObjectId(id))
    .filter((v: mongoose.Types.ObjectId | null): v is mongoose.Types.ObjectId => Boolean(v));

  const query: Record<string, unknown> = {
    estateId: { $in: [...allowedEstateIds, ...allowedEstateObjectIds] },
  };

  const { searchParams } = new URL(req.url);
  const estateId = searchParams.get("estateId");
  const statusFilter = searchParams.get("status");
  const sort = searchParams.get("sort") ?? "issueDateDesc";

  if (estateId) {
    const access = await getEstateAccess({
      estateId,
      userId: session.user.id,
      atLeastRole: "VIEWER",
    });

    if (!access) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const estateObjectId = toObjectId(estateId);
    const candidates = [estateId, estateObjectId].filter(Boolean);

    query.estateId = { $in: candidates };
  }

  if (statusFilter && statusFilter !== "ALL") {
    query.status = statusFilter;
  }

  const sortOption: Record<string, 1 | -1> = {};
  if (sort === "issueDateAsc") sortOption.issueDate = 1;
  else if (sort === "dueDateAsc") sortOption.dueDate = 1;
  else if (sort === "dueDateDesc") sortOption.dueDate = -1;
  else if (sort === "invoiceNumberAsc") sortOption.invoiceNumber = 1;
  else if (sort === "invoiceNumberDesc") sortOption.invoiceNumber = -1;
  else sortOption.issueDate = -1;

  const invoices = await Invoice.find(query).sort(sortOption).lean().exec();

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

  await connectToDatabase();

  let amountFromFormCents = 0;
  const contentType = req.headers.get("content-type") ?? "";

  let body: CreateInvoicePayload;

  if (contentType.includes("application/json")) {
    body = (await req.json()) as CreateInvoicePayload;
  } else {
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

    const lineItems: CreateInvoicePayload["lineItems"] = [];

    if (typeof amountRaw === "string" && amountRaw.trim().length > 0) {
      const cleaned = amountRaw.replace(/[,$]/g, "").trim();
      const asNumber = Number.parseFloat(cleaned);
      if (Number.isFinite(asNumber) && asNumber > 0) {
        amountFromFormCents = Math.round(asNumber * 100);
      }
    }

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

    body = { estateId, issueDate, dueDate, notes, status, currency, lineItems };
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

  const access = await getEstateAccess({
    estateId,
    userId: session.user.id,
    atLeastRole: "EDITOR",
  });

  if (!access || !access.canEdit) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  type EstateOwnerLean = { _id: unknown; ownerId?: unknown };

  const estateDoc = await Estate.findById(estateObjectId)
    .select("_id ownerId")
    .lean<EstateOwnerLean>()
    .exec();

  if (!estateDoc) {
    return NextResponse.json({ ok: false, error: "Invalid estateId" }, { status: 400 });
  }

  const ownerIdString = idToString(estateDoc.ownerId);
  if (!ownerIdString) {
    return NextResponse.json({ ok: false, error: "Invalid estate owner" }, { status: 400 });
  }

  const ownerObjectId = toObjectId(ownerIdString);
  if (!ownerObjectId) {
    return NextResponse.json({ ok: false, error: "Invalid estate owner" }, { status: 400 });
  }

  const settings = await WorkspaceSettings.findOne({ ownerId: ownerIdString })
    .lean()
    .exec()
    .catch(() => null);

  const currency =
    (typeof currencyFromBody === "string" && currencyFromBody.trim().length > 0
      ? currencyFromBody.trim().toUpperCase()
      : undefined) ?? (settings?.defaultCurrency ?? "USD");

  const defaultRateCents =
    typeof settings?.defaultHourlyRateCents === "number" ? settings.defaultHourlyRateCents : 0;

  const notesToUse = typeof notes === "string" && notes.trim().length > 0 ? notes : undefined;

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

        resolvedDueDate =
          days > 0 ? new Date(base.getTime() + days * 24 * 60 * 60 * 1000) : base;
      }
    } catch {
      // leave as-is
    }
  }

  const subtotalFromItems = Array.isArray(lineItems)
    ? lineItems.reduce((acc, item) => {
        const quantity = typeof item.quantity === "number" ? item.quantity : 0;
        const unitPriceCents = typeof item.unitPriceCents === "number" ? item.unitPriceCents : 0;
        const amountCentsField = typeof item.amountCents === "number" ? item.amountCents : 0;
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
        if (unitPriceCents > 0) effectiveUnit = unitPriceCents;
        else if (rateField > 0) {
          effectiveUnit = rateField > 10_000 ? Math.round(rateField) : Math.round(rateField * 100);
        } else if (defaultRateCents > 0) effectiveUnit = defaultRateCents;

        const derived = quantity > 0 && effectiveUnit > 0 ? quantity * effectiveUnit : 0;
        return acc + (explicitAmount || derived);
      }, 0)
    : 0;

  let safeAmount = subtotalFromItems;
  if (safeAmount === 0 && amountFromFormCents > 0) safeAmount = amountFromFormCents;

  let invoiceNumber: string | undefined;
  try {
    const lastInvoiceForOwner = await Invoice.findOne({ ownerId: ownerObjectId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    let nextSeq = 1;
    if (lastInvoiceForOwner?.invoiceNumber) {
      const match = lastInvoiceForOwner.invoiceNumber.match(/(\d+)$/);
      if (match) {
        const parsed = Number.parseInt(match[1], 10);
        if (Number.isFinite(parsed) && parsed > 0) nextSeq = parsed + 1;
      }
    }

    invoiceNumber = `INV-${nextSeq.toString().padStart(6, "0")}`;
  } catch {
    invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
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

  try {
    await logEstateEvent({
      estateId: String(estateObjectId),
      ownerId: ownerIdString,
      type: "INVOICE_CREATED",
      summary: "Invoice created",
    });
  } catch {
    // don't block
  }

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
    { status: 201 },
  );
}