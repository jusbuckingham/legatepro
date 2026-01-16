// src/app/api/rent/route.ts
// Unified Rent Payments API for LegatePro

import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";

import { auth } from "../../../lib/auth";
import { connectToDatabase, serializeMongoDoc } from "../../../lib/db";
import { RentPayment } from "../../../models/RentPayment";
import { User } from "../../../models/User";
import {
  EntitlementError,
  requirePro,
  type EntitlementsUser,
  type PlanId,
  type SubscriptionStatus,
} from "../../../lib/entitlements";
import { getEstateAccess } from "../../../lib/estateAccess";

type RentPaymentLean = {
  _id: unknown;
  estateId: unknown;
  propertyId: unknown;
  tenantName: unknown;
  paymentDate: unknown;
  amount: unknown;
  notes?: unknown;
  isPaid: unknown;
  [key: string]: unknown;
};

const noStore = { "cache-control": "no-store" } as const;

function isValidObjectId(id: string) {
  return Types.ObjectId.isValid(id);
}

function escapeRegex(input: string) {
  // Escape regex special characters for safe use in $regex
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Stripe-aligned subscription statuses. We coerce through SubscriptionStatus to keep EntitlementsUser strongly typed.
const KNOWN_SUBSCRIPTION_STATUSES = new Set<SubscriptionStatus>([
  "active",
  "trialing",
  "past_due",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "unpaid",
  "paused",
].map((s) => s as SubscriptionStatus));

function coerceSubscriptionStatus(value: unknown): SubscriptionStatus | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  return KNOWN_SUBSCRIPTION_STATUSES.has(value as SubscriptionStatus)
    ? (value as SubscriptionStatus)
    : undefined;
}

/** ------------------------------------------------------------------------
 * GET /api/rent
 * Query params:
 *   estateId?: string
 *   propertyId?: string
 *   paid?: "true" | "false"
 *   from?: ISO date
 *   to?: ISO date
 *   q?: string (tenantName or notes)
 * ------------------------------------------------------------------------ */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const ownerId = session?.user?.id;
    if (!ownerId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: noStore });
    }

    await connectToDatabase();

    const { searchParams } = new URL(request.url);

    const estateId = searchParams.get("estateId") ?? undefined;
    const propertyId = searchParams.get("propertyId") ?? undefined;

    if (estateId && !isValidObjectId(estateId)) {
      return NextResponse.json({ ok: false, error: "Invalid estateId" }, { status: 400, headers: noStore });
    }

    if (propertyId && !isValidObjectId(propertyId)) {
      return NextResponse.json({ ok: false, error: "Invalid propertyId" }, { status: 400, headers: noStore });
    }

    const paid = searchParams.get("paid") ?? undefined;
    const from = searchParams.get("from") ?? undefined;
    const to = searchParams.get("to") ?? undefined;
    const q = searchParams.get("q")?.trim() || "";
    const qSafe = q ? escapeRegex(q) : "";

    const filter: Record<string, unknown> = {};

    // If an estate is specified, allow reads for collaborators too (guarded by access)
    if (estateId) {
      const access = await getEstateAccess({ estateId, session });
      if (!access) {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403, headers: noStore });
      }
      filter.estateId = estateId;
    } else {
      // Without an estate scope, default to the signed-in user's own records
      filter.ownerId = ownerId;
    }

    if (propertyId) filter.propertyId = propertyId;

    if (paid === "true") filter.isPaid = true;
    if (paid === "false") filter.isPaid = false;

    if (from || to) {
      const dateFilter: Record<string, Date> = {};

      if (from) {
        const d = new Date(from);
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json({ ok: false, error: "Invalid from date" }, { status: 400, headers: noStore });
        }
        dateFilter.$gte = d;
      }

      if (to) {
        const d = new Date(to);
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json({ ok: false, error: "Invalid to date" }, { status: 400, headers: noStore });
        }
        dateFilter.$lte = d;
      }

      filter.paymentDate = dateFilter;
    }

    if (q.length > 0) {
      filter.$or = [
        { tenantName: { $regex: qSafe, $options: "i" } },
        { notes: { $regex: qSafe, $options: "i" } },
      ];
    }

    const rawPayments = await RentPayment.find(filter)
      .sort({ paymentDate: -1 })
      .lean<RentPaymentLean[]>()
      .exec();

    const payments = rawPayments.map((p) => {
      const base = serializeMongoDoc(p) as Record<string, unknown>;

      // Normalize common fields the UI expects
      const estateIdVal = base.estateId as { toString?: () => string } | string | undefined;
      const propertyIdVal = base.propertyId as { toString?: () => string } | string | undefined;
      const paymentDateVal = base.paymentDate as Date | string | number | undefined;

      return {
        ...base,
        estateId: estateIdVal ? String(estateIdVal.toString?.() ?? estateIdVal) : "",
        propertyId: propertyIdVal ? String(propertyIdVal.toString?.() ?? propertyIdVal) : "",
        tenantName: typeof base.tenantName === "string" ? base.tenantName : String(base.tenantName ?? ""),
        amount: typeof base.amount === "number" ? base.amount : Number(base.amount ?? 0),
        isPaid: typeof base.isPaid === "boolean" ? base.isPaid : Boolean(base.isPaid),
        paymentDate:
          paymentDateVal instanceof Date
            ? paymentDateVal.toISOString()
            : typeof paymentDateVal === "string"
              ? paymentDateVal
              : typeof paymentDateVal === "number"
                ? new Date(paymentDateVal).toISOString()
                : null,
        notes: typeof base.notes === "string" ? base.notes : String(base.notes ?? ""),
      };
    });

    return NextResponse.json({ ok: true, data: { payments } }, { status: 200, headers: noStore });
  } catch (error) {
    console.error("GET /api/rent error", error);
    return NextResponse.json(
      { ok: false, error: "Unable to load rent records" },
      { status: 500, headers: noStore }
    );
  }
}

/** ------------------------------------------------------------------------
 * POST /api/rent
 * Create a rent payment record
 * Body:
 *   estateId: string
 *   propertyId: string
 *   tenantName: string
 *   paymentDate: string | Date
 *   amount: number
 *   notes?: string
 *   isPaid?: boolean
 * ------------------------------------------------------------------------ */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const ownerId = session?.user?.id;
    if (!ownerId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: noStore });
    }

    await connectToDatabase();

    // Billing enforcement: creating rent payments is Pro-only
    const user = await User.findById(ownerId).lean().exec();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: noStore });
    }

    try {
      const planIdRaw = (user as { subscriptionPlanId?: unknown }).subscriptionPlanId;
      const statusRaw = (user as { subscriptionStatus?: unknown }).subscriptionStatus;

      const entUser: EntitlementsUser = {
        subscriptionPlanId:
          typeof planIdRaw === "string"
            ? (planIdRaw as PlanId)
            : planIdRaw === null
              ? null
              : undefined,
        subscriptionStatus: coerceSubscriptionStatus(statusRaw),
      };

      requirePro(entUser);
    } catch (e) {
      if (e instanceof EntitlementError) {
        return NextResponse.json(
          { ok: false, error: "Pro subscription required", code: e.code },
          { status: 402, headers: noStore },
        );
      }
      throw e;
    }

    let body: unknown = null;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400, headers: noStore });
    }

    const {
      estateId,
      propertyId,
      tenantName,
      paymentDate,
      amount,
      notes,
      isPaid,
    } = (body ?? {}) as Record<string, unknown>;

    // --- Validation ---
    if (!estateId)
      return NextResponse.json({ ok: false, error: "estateId is required" }, { status: 400, headers: noStore });

    if (!isValidObjectId(String(estateId))) {
      return NextResponse.json({ ok: false, error: "Invalid estateId" }, { status: 400, headers: noStore });
    }

    // Security: ensure the user can access this estate before writing rent data
    const access = await getEstateAccess({ estateId: String(estateId), session });
    if (!access) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403, headers: noStore });
    }

    if (!propertyId)
      return NextResponse.json(
        { ok: false, error: "propertyId is required" },
        { status: 400, headers: noStore }
      );

    if (!isValidObjectId(String(propertyId))) {
      return NextResponse.json({ ok: false, error: "Invalid propertyId" }, { status: 400, headers: noStore });
    }

    if (!tenantName)
      return NextResponse.json(
        { ok: false, error: "tenantName is required" },
        { status: 400, headers: noStore }
      );

    if (!paymentDate)
      return NextResponse.json(
        { ok: false, error: "paymentDate is required" },
        { status: 400, headers: noStore }
      );

    if (amount == null || Number.isNaN(Number(amount)))
      return NextResponse.json(
        { ok: false, error: "Valid amount is required" },
        { status: 400, headers: noStore }
      );

    // --- Parse paymentDate safely (avoid `new Date({})`) ---
    let parsedPaymentDate: Date | null = null;

    if (paymentDate instanceof Date) {
      parsedPaymentDate = paymentDate;
    } else if (typeof paymentDate === "string" || typeof paymentDate === "number") {
      const d = new Date(paymentDate);
      if (!Number.isNaN(d.getTime())) {
        parsedPaymentDate = d;
      }
    }

    if (!parsedPaymentDate) {
      return NextResponse.json(
        { ok: false, error: "paymentDate must be a valid date" },
        { status: 400, headers: noStore }
      );
    }

    // --- Create Record ---
    const payment = await RentPayment.create({
      ownerId,
      estateId: String(estateId),
      propertyId: String(propertyId),
      tenantName: String(tenantName).trim(),
      paymentDate: parsedPaymentDate,
      amount: Number(amount),
      notes: typeof notes === "string" ? notes : String(notes ?? ""),
      isPaid: typeof isPaid === "boolean" ? isPaid : true,
    });

    const serialized = serializeMongoDoc(payment) as Record<string, unknown>;

    return NextResponse.json(
      { ok: true, data: { payment: serialized } },
      { status: 201, headers: noStore }
    );
  } catch (error) {
    console.error("POST /api/rent error", error);
    return NextResponse.json(
      { ok: false, error: "Unable to create rent record" },
      { status: 500, headers: noStore }
    );
  }
}