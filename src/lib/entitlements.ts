// src/lib/entitlements.ts
// Central place for subscription / feature gating rules.

export type PlanId = "free" | "pro";

// Keep this intentionally narrow so we don't accidentally persist/assume unknown statuses.
// These values should match what we store on the User document.
export type SubscriptionStatus = "free" | "active" | "trialing" | "past_due" | "canceled";

export type EntitlementsUser = {
  id?: string;
  email?: string;

  // Our internal plan id (optional; if absent we derive from subscriptionStatus)
  subscriptionPlanId?: PlanId | null;

  // Normalized subscription status synced from Stripe webhook
  subscriptionStatus?: SubscriptionStatus | null;

  // Stripe ids (optional)
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
};

/**
 * Valid plan IDs for validation.
 */
const VALID_PLAN_IDS = ["free", "pro"] as const;

/**
 * Valid subscription statuses for validation.
 */
const VALID_STATUSES = ["free", "active", "trialing", "past_due", "canceled"] as const;

/**
 * Helper to validate PlanId strings.
 */
function isValidPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && (VALID_PLAN_IDS as readonly string[]).includes(value);
}

/**
 * Helper to validate SubscriptionStatus strings.
 */
function isValidSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return typeof value === "string" && (VALID_STATUSES as readonly string[]).includes(value);
}

/**
 * Coerce a loose DB/user snapshot into the strict EntitlementsUser shape.
 * This avoids repeating `as unknown as ...` casts across routes.
 */
export function toEntitlementsUser(
  user: Record<string, unknown> | null | undefined
): EntitlementsUser {
  const u = user ?? {};

  const subscriptionPlanIdRaw = isValidPlanId(u.subscriptionPlanId)
    ? u.subscriptionPlanId
    : null;

  const subscriptionStatusRaw = isValidSubscriptionStatus(u.subscriptionStatus)
    ? u.subscriptionStatus
    : null;

  const stripeCustomerIdRaw =
    typeof u.stripeCustomerId === "string" ? u.stripeCustomerId : null;

  const stripeSubscriptionIdRaw =
    typeof u.stripeSubscriptionId === "string" ? u.stripeSubscriptionId : null;

  return {
    id: typeof u.id === "string" ? u.id : undefined,
    email: typeof u.email === "string" ? u.email : undefined,

    // DB values are strings; normalize to our narrow unions.
    subscriptionPlanId: subscriptionPlanIdRaw,
    subscriptionStatus: subscriptionStatusRaw,

    stripeCustomerId: stripeCustomerIdRaw,
    stripeSubscriptionId: stripeSubscriptionIdRaw,
  };
}

export type Entitlements = {
  planId: PlanId;
  status: SubscriptionStatus | null;

  // Paid + in-good-standing
  isActive: boolean;
  canUsePro: boolean;

  // Limits (used for both UI + server enforcement)
  limits: {
    estates: number;
    collaboratorsPerEstate: number;
    storageMb: number;
  };

  // Feature flags
  features: {
    exports: boolean;
    advancedReports: boolean;
    collaboratorInvites: boolean;
  };
};

// Consider "active" only when the subscription is in good standing.
// NOTE: We intentionally do NOT include "past_due" here.
const ACTIVE_STATUSES = Object.freeze(new Set<SubscriptionStatus>(["active", "trialing"]));

const PLAN_LIMITS = {
  free: {
    estates: 1,
    collaboratorsPerEstate: 0,
    storageMb: 250,
  },
  pro: {
    estates: 50,
    collaboratorsPerEstate: 10,
    storageMb: 10_000,
  },
} as const satisfies Record<PlanId, Entitlements["limits"]>;

const PLAN_FEATURES = {
  free: {
    exports: false,
    advancedReports: false,
    collaboratorInvites: false,
  },
  pro: {
    exports: true,
    advancedReports: true,
    collaboratorInvites: true,
  },
} as const satisfies Record<PlanId, Entitlements["features"]>;

/**
 * Normalize a plan ID, defaulting to 'free' for invalid inputs.
 */
function normalizePlanId(planId: unknown): PlanId {
  if (planId === "pro") return "pro";
  if (planId === "free") return "free";
  return "free";
}

/**
 * Normalize a subscription status, returning null for invalid inputs.
 */
function normalizeStatus(status: unknown): SubscriptionStatus | null {
  if (typeof status !== "string") return null;
  switch (status) {
    case "free":
    case "active":
    case "trialing":
    case "past_due":
    case "canceled":
      return status;
    default:
      return null;
  }
}

/**
 * Compute entitlements from a user doc / session snapshot.
 */
export function getEntitlements(user: EntitlementsUser | null | undefined): Entitlements {
  const status = normalizeStatus(user?.subscriptionStatus);

  // Plan comes from our explicit plan id if present, otherwise derive from status.
  // This lets us gate correctly even if older users don't have subscriptionPlanId yet.
  const planId: PlanId = user?.subscriptionPlanId
    ? normalizePlanId(user.subscriptionPlanId)
    : status === "active" || status === "trialing"
      ? "pro"
      : "free";

  // Paid plans are only considered “active” when status is good.
  const isActive = planId !== "free" && status !== null && ACTIVE_STATUSES.has(status);
  const canUsePro = planId === "pro" && isActive;

  // If a paid subscription is not active (past_due/canceled/etc), treat as free for gating.
  const effectivePlan: PlanId = canUsePro ? "pro" : "free";

  return {
    planId,
    status,
    isActive,
    canUsePro,
    limits: PLAN_LIMITS[effectivePlan],
    features: PLAN_FEATURES[effectivePlan],
  };
}

/**
 * True if the user is currently entitled to Pro features.
 */
export function canUsePro(user: EntitlementsUser | null | undefined): boolean {
  return getEntitlements(user).canUsePro;
}

export function canExport(user: EntitlementsUser | null | undefined): boolean {
  return getEntitlements(user).features.exports;
}

export function canInviteCollaborators(user: EntitlementsUser | null | undefined): boolean {
  return getEntitlements(user).features.collaboratorInvites;
}

export function canCreateAnotherEstate(
  user: EntitlementsUser | null | undefined,
  currentEstateCount: number
): boolean {
  const ent = getEntitlements(user);
  return currentEstateCount < ent.limits.estates;
}

/**
 * Throws a typed error if Pro is required.
 * Use this in server actions / route handlers.
 */
export class EntitlementError extends Error {
  code: "ENTITLEMENT_REQUIRED";
  requiredPlan: PlanId;
  feature?: keyof Entitlements["features"];

  constructor(message: string, requiredPlan: PlanId, feature?: keyof Entitlements["features"]) {
    super(message);
    this.name = "EntitlementError";
    this.code = "ENTITLEMENT_REQUIRED";
    this.requiredPlan = requiredPlan;
    this.feature = feature;
  }
}

export function requirePro(user: EntitlementsUser | null | undefined): Entitlements {
  const ent = getEntitlements(user);
  if (!ent.canUsePro) {
    throw new EntitlementError("Pro subscription required", "pro");
  }
  return ent;
}

export function requireFeature(
  user: EntitlementsUser | null | undefined,
  feature: keyof Entitlements["features"],
  requiredPlan: PlanId = "pro"
): Entitlements {
  const ent = getEntitlements(user);
  if (!ent.features[feature]) {
    throw new EntitlementError("Pro subscription required", requiredPlan, feature);
  }
  return ent;
}

/**
 * Useful for UI gating (show upgrade banners, disable buttons, etc.).
 */
export function getUpgradeReason(user: EntitlementsUser | null | undefined): string | null {
  const ent = getEntitlements(user);

  // Already entitled
  if (ent.canUsePro) return null;

  // No subscription (free gating)
  if (ent.planId === "free" || ent.status === null || ent.status === "free") {
    return "Upgrade to Pro to unlock this feature.";
  }

  // Non-active paid statuses
  if (ent.status === "past_due")
    return "Your subscription is past due. Update your payment method to continue.";
  if (ent.status === "canceled")
    return "Your subscription is canceled. Resubscribe to continue.";

  return "Subscription required to continue.";
}
