import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

import { connectToDatabase } from "@/lib/db";
import { auth } from "@/lib/auth";
import { buildEstateAccessOr, getEstateAccess } from "@/lib/estateAccess";
import { logEstateEvent } from "@/lib/estateEvents";

import { Invoice } from "@/models/Invoice";
import { Estate } from "@/models/Estate";
import { WorkspaceSettings } from "@/models/WorkspaceSettings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

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

type EstateIdLean = { _id: unknown };

type EstateOwnerLean = { _id: unknown; ownerId?: unknown };

function toObjectId(id: string): mongoose.Types.ObjectId | null {
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function withHeaders(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", NO_STORE_HEADERS["Cache-Control"]);
  return res;
}

function jsonOk<T>(body: T, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function jsonErr(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status, headers: NO_STORE_HEADERS });
}

function normalizeCurrency(input: unknown, fallback: string): string {
  if (typeof input === "string" && input.trim().length > 0) {
    return input.trim().toUpperCase();
  }
  return fallback;
}

function normalizeNotes(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function coerceStatus(input: unknown): CreateInvoicePayload["status"] {
  return input === "DRAFT" ||
    input === "SENT" ||
    input === "UNPAID" ||
    input === "PARTIAL" ||
    input === "PAID" ||
    input === "VOID"
    ? input
    : undefined;
}

function parseMoneyToCents(raw: string): number {
  const cleaned = raw.replace(/[,$]/g, "").trim();
  if (!cleaned) return 0;
  const asNumber = Number.parseFloat(cleaned);
  if (!Number.isFinite(asNumber) || asNumber <= 0) return 0;
  return Math.round(asNumber * 100);
}

async function parseCreateInvoiceBody(req: NextRequest): Promise<{
  body: CreateInvoicePayload | null;
  amountFromFormCents: number;
  error?: string;
}> {
  const contentType = req.headers.get("content-type") ?? "";

  // Default for multipart/forms: capture a "total" amount if present.
  let amountFromFormCents = 0;

  if (contentType.includes("application/json")) {
    const raw = await req.json().catch(() => null);
    if (!isPlainObject(raw)) {
      return { body: null, amountFromFormCents, error: "Invalid JSON body" };
    }

    // We keep the payload flexible; validation happens below.
    return { body: raw as CreateInvoicePayload, amountFromFormCents };
  }

  // Form payload (legacy / browser-driven)
  const form = await req.formData().catch(() => null);
  if (!form) {
    return { body: null, amountFromFormCents, error: "Invalid form data" };
  }

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
    amountFromFormCents = parseMoneyToCents(amountRaw);
  }

  if (amountFromFormCents === 0) {
    // Heuristic: take the first form field that looks like an amount.
    for (const [key, value] of form.entries()) {
      if (!value) continue;
      const valStr = value.toString().trim();
      if (!valStr) continue;
      if (!/amount/i.test(key)) continue;

      const cents = parseMoneyToCents(valStr);
      if (cents > 0) {
        amountFromFormCents = cents;
        break;
      }
    }
  }

  const status = coerceStatus(statusRaw);

  return {
    body: { estateId, issueDate, dueDate, notes, status, currency, lineItems },
    amountFromFormCents,
  };
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return jsonErr("Unauthorized", 401);
  }

  await connectToDatabase();

  const accessibleEstates = (await Estate.find({
    $or: buildEstateAccessOr(session.user.id),
  })
    .select("_id")
    .lean()
    .exec()) as EstateIdLean[];

  const allowedEstateIds = accessibleEstates
    .map((e) => idToString(e._id))
    .filter((v): v is string => typeof v === "string" && v.length > 0);

  if (allowedEstateIds.length === 0) {
    return jsonOk({ ok: true, invoices: [] }, 200);
  }

  const allowedEstateObjectIds = allowedEstateIds
    .map((id) => toObjectId(id))
    .filter((v): v is mongoose.Types.ObjectId => Boolean(v));

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
      return jsonErr("Forbidden", 403);
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

  return jsonOk({ ok: true, invoices: rows }, 200);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return jsonErr("Unauthorized", 401);
  }

  await connectToDatabase();

  const parsed = await parseCreateInvoiceBody(req);
  if (!parsed.body) {
    return jsonErr(parsed.error ?? "Invalid request", 400);
  }

  const { amountFromFormCents } = parsed;
  const body = parsed.body;

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
    return jsonErr("estateId is required", 400);
  }

  const estateObjectId = toObjectId(estateId);
  if (!estateObjectId) {
    return jsonErr("Invalid estateId", 400);
  }

  const access = await getEstateAccess({
    estateId,
    userId: session.user.id,
    atLeastRole: "EDITOR",
  });

  if (!access || !access.canEdit) {
    return jsonErr("Forbidden", 403);
  }

  const estateDoc = await Estate.findById(estateObjectId)
    .select("_id ownerId")
    .lean<EstateOwnerLean>()
    .exec();

  if (!estateDoc) {
    return jsonErr("Invalid estateId", 400);
  }

  const ownerIdString = idToString(estateDoc.ownerId);
  if (!ownerIdString) {
    return jsonErr("Invalid estate owner", 400);
  }

  const ownerObjectId = toObjectId(ownerIdString);
  if (!ownerObjectId) {
    return jsonErr("Invalid estate owner", 400);
  }

  const settings = await WorkspaceSettings.findOne({ ownerId: ownerIdString })
    .lean()
    .exec()
    .catch(() => null);

  const currency = normalizeCurrency(currencyFromBody, settings?.defaultCurrency ?? "USD");

  const defaultRateCents =
    typeof settings?.defaultHourlyRateCents === "number" ? settings.defaultHourlyRateCents : 0;

  const notesToUse = normalizeNotes(notes);

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
                  : terms === "NET_30"
                    ? 30
                    : 30;

        resolvedDueDate = days > 0 ? new Date(base.getTime() + days * 86400000) : base;
      }
    } catch {
      // leave as-is
    }
  }

  const items = Array.isArray(lineItems) ? lineItems : [];

  const subtotalFromItems = items.reduce((acc, item) => {
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
  }, 0);

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
        const parsedSeq = Number.parseInt(match[1], 10);
        if (Number.isFinite(parsedSeq) && parsedSeq > 0) nextSeq = parsedSeq + 1;
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
    lineItems: items,
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
    const res = NextResponse.redirect(new URL(redirectUrl, req.url), { status: 303 });
    return withHeaders(res);
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
    { status: 201, headers: NO_STORE_HEADERS },
  );
}