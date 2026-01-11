// src/lib/entitlements.ts
// Central place for subscription / feature gating rules.

export type PlanId = "free" | "pro";

export type SubscriptionStatus =
  | "free"
  | "inactive"
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "paused"
  | string;

export type EntitlementsUser = {
  id?: string;
  email?: string;
  // The plan the user is on (our internal plan id)
  subscriptionPlanId?: PlanId | string | null;
  // Normalized subscription status synced from Stripe webhook
  subscriptionStatus?: SubscriptionStatus | null;
  // Stripe ids (optional)
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
};

export type Entitlements = {
  planId: PlanId;
  status: SubscriptionStatus;

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

const ACTIVE_STATUSES = new Set<SubscriptionStatus>(["active", "trialing"]);

const PLAN_LIMITS: Record<PlanId, Entitlements["limits"]> = {
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
};

const PLAN_FEATURES: Record<PlanId, Entitlements["features"]> = {
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
};

function normalizePlanId(planId: unknown): PlanId {
  return planId === "pro" ? "pro" : "free";
}

function normalizeStatus(status: unknown): SubscriptionStatus {
  if (!status) return "inactive";
  const s = String(status);
  return s as SubscriptionStatus;
}

/**
 * Compute entitlements from a user doc / session snapshot.
 */
export function getEntitlements(user: EntitlementsUser | null | undefined): Entitlements {
  const planId = normalizePlanId(user?.subscriptionPlanId);
  const status = normalizeStatus(user?.subscriptionStatus);

  // Paid plans are only considered “active” when status is good.
  const isActive = planId !== "free" && ACTIVE_STATUSES.has(status);
  const canUsePro = planId === "pro" && isActive;

  // Features/limits should follow the plan, but also be safe when subscription is not active.
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

export function canCreateAnotherEstate(user: EntitlementsUser | null | undefined, currentEstateCount: number): boolean {
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

  // Free plan
  if (ent.planId === "free") return "Upgrade to Pro to unlock this feature.";

  // Non-active paid statuses
  if (ent.status === "past_due") return "Your subscription is past due. Update payment method to continue.";
  if (ent.status === "canceled") return "Your subscription is canceled. Resubscribe to continue.";
  if (ent.status === "inactive") return "Activate your subscription to continue.";
  if (ent.status === "unpaid") return "Your subscription is unpaid. Update payment method to continue.";
  if (ent.status === "paused") return "Your subscription is paused. Resume to continue.";

  return "Subscription required to continue.";
}
