// src/lib/estateAccess.ts
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";

export type EstateRole = "OWNER" | "EDITOR" | "VIEWER";

export const ROLE_RANK: Record<EstateRole, number> = {
  OWNER: 3,
  EDITOR: 2,
  VIEWER: 1,
};

export function hasRole(args: {
  actual: EstateRole;
  atLeast: EstateRole;
}): boolean {
  return ROLE_RANK[args.actual] >= ROLE_RANK[args.atLeast];
}

export type RequireEstateAccessInput = {
  estateId: string;
  /** Optional override for server actions / routes that already resolved auth. */
  userId?: string;

  /**
   * Back-compat: some pages mistakenly pass `session` to this helper.
   * This value is intentionally ignored for auth decisions.
   */
  session?: unknown;

  /**
   * Back-compat: some pages pass `ownerId` / other identity props.
   * These are intentionally ignored for auth decisions.
   */
  ownerId?: unknown;
  /**
   * Optional role hints used by some pages. These are currently **UI hints only**;
   * enforcement should be done via `requireEstateEditAccess` (or a future stricter helper).
   *
   * Supported legacy aliases:
   * - `minRole`
   * - `requiredRole`
   */
  atLeastRole?: EstateRole;
  /** @deprecated Use `atLeastRole` */
  minRole?: EstateRole;
  /** @deprecated Use `atLeastRole` */
  requiredRole?: EstateRole;
  /**
   * When true, unauthenticated users return `hasAccess=false`.
   * (Default behavior is also `hasAccess=false`; this flag is kept for back-compat.)
   */
  requireAuth?: boolean;
};

export type EstateAccess = {
  estateId: string;
  userId: string;
  /** True if the user is authenticated (or userId override provided). */
  isAuthenticated: boolean;
  /** True if the user is allowed to view this estate (owner/collaborator). */
  hasAccess: boolean;
  role: EstateRole;
  isOwner: boolean;
  canEdit: boolean;
  /**
   * Whether sensitive items can be shown. For now:
   *  - OWNER: yes
   *  - EDITOR/VIEWER: no (safe default)
   *
   * If you later decide EDITORs can view sensitive items, change this to:
   * `hasRole({ actual: role, atLeast: "EDITOR" })`
   */
  canViewSensitive: boolean;
};

// Backwards-compatible alias (older pages may import this name)
export type RequireEstateAccessResult = Omit<EstateAccess, "userId"> & {
  /** Older code expects this field. */
  canEdit: boolean;
  /** Optional: whether the caller's requested role requirement is met. */
  meetsRoleRequirement?: boolean;
  /** Optional: the role the caller asked for (resolved from atLeastRole/minRole/requiredRole). */
  requiredRole?: EstateRole;
};

type EstateLean = {
  ownerId: unknown;
  collaborators?: { userId: unknown; role?: unknown }[];
};

function normalizeRole(value: unknown): EstateRole {
  if (value === "OWNER" || value === "EDITOR" || value === "VIEWER") return value;
  return "VIEWER";
}

function toIdString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object") {
    const maybe = (value as { toString?: () => string }).toString?.();
    if (typeof maybe === "string") return maybe;
  }
  return "";
}

function resolveRequiredRole(input: RequireEstateAccessInput): EstateRole | undefined {
  return input.atLeastRole ?? input.minRole ?? input.requiredRole;
}

/**
 * Returns normalized access for the given estateId + userId.
 * - Returns `null` if unauthenticated (and no userId override) OR no access.
 */
export async function getEstateAccess(
  input: RequireEstateAccessInput
): Promise<EstateAccess | null> {
  const estateId = input.estateId;
  const resolvedUserId = input.userId ?? (await auth())?.user?.id;

  if (!resolvedUserId) return null;

  await connectToDatabase();

  const estate = await Estate.findOne({
    _id: estateId,
    $or: [
      { ownerId: resolvedUserId },
      { "collaborators.userId": resolvedUserId },
    ],
  }).lean<EstateLean>();

  if (!estate) return null;

  const ownerId = toIdString(estate.ownerId);
  const isOwner = ownerId !== "" && ownerId === resolvedUserId;

  if (isOwner) {
    const role: EstateRole = "OWNER";
    return {
      estateId,
      userId: resolvedUserId,
      isAuthenticated: true,
      hasAccess: true,
      role,
      isOwner: true,
      canEdit: true,
      canViewSensitive: true,
    };
  }

  const collaborators = Array.isArray(estate.collaborators)
    ? estate.collaborators
    : [];

  const collab = collaborators.find((c) => toIdString(c.userId) === resolvedUserId);
  if (!collab) return null;

  const role = normalizeRole(collab.role);

  return {
    estateId,
    userId: resolvedUserId,
    isAuthenticated: true,
    hasAccess: true,
    role,
    isOwner: false,
    canEdit: hasRole({ actual: role, atLeast: "EDITOR" }),
    canViewSensitive: role === "OWNER", // safe default (OWNER only)
  };
}

/**
 * Primary helper used by pages/actions.
 * Always returns a result (never null), so pages can render permission-aware UI.
 */
export async function requireEstateAccess(
  input: RequireEstateAccessInput
): Promise<RequireEstateAccessResult> {
  const estateId = input.estateId;
  const resolvedUserId = input.userId ?? (await auth())?.user?.id;
  const isAuthenticated = !!resolvedUserId;
  const requiredRole = resolveRequiredRole(input);

  if (!resolvedUserId) {
    // Caller pages typically redirect to login already; keep it predictable.
    return {
      estateId,
      isAuthenticated,
      hasAccess: false,
      role: "VIEWER",
      isOwner: false,
      canEdit: false,
      canViewSensitive: false,
      meetsRoleRequirement: false,
      requiredRole,
    };
  }

  const access = await getEstateAccess({
    estateId,
    userId: resolvedUserId,
    requireAuth: input.requireAuth,
  });

  if (!access) {
    return {
      estateId,
      isAuthenticated,
      hasAccess: false,
      role: "VIEWER",
      isOwner: false,
      canEdit: false,
      canViewSensitive: false,
      meetsRoleRequirement: false,
      requiredRole,
    };
  }

  // Strip userId for backwards compatibility
  // (Use `void` so TypeScript understands we intentionally ignore it.)
  const { userId, ...rest } = access;
  void userId;

  const meetsRoleRequirement = requiredRole
    ? hasRole({ actual: rest.role, atLeast: requiredRole })
    : true;

  return {
    ...rest,
    // If the caller requested a higher role than the user has, treat as read-only.
    // Pages can still render a helpful “insufficient permissions” state via meetsRoleRequirement.
    canEdit: rest.canEdit && meetsRoleRequirement,
    meetsRoleRequirement,
    requiredRole,
  };
}

/** Convenience helper for routes/actions that must enforce edit privileges. */
export async function requireEstateEditAccess(
  input: RequireEstateAccessInput
): Promise<RequireEstateAccessResult> {
  // Ensure edit access is enforced even if callers forget to pass a role.
  const access = await requireEstateAccess({
    ...input,
    atLeastRole: input.atLeastRole ?? input.minRole ?? input.requiredRole ?? "EDITOR",
  });

  if (!access.hasAccess) return access;

  // If they don't meet the requirement or can't edit, force canEdit false.
  if (!access.canEdit || access.meetsRoleRequirement === false) {
    return {
      ...access,
      canEdit: false,
      meetsRoleRequirement: false,
      requiredRole: access.requiredRole ?? "EDITOR",
    };
  }

  return access;
}

/** Small role helper for UI (no runtime dependency). */
export function isEstateEditorRole(role: EstateRole): boolean {
  return role === "OWNER" || role === "EDITOR";
}

/**
 * Build a consistent “request access” link.
 * (Implement the target route later if you want: /app/estates/[id]/request-access)
 */
export function buildRequestAccessHref(args: {
  estateId: string;
  from?: string;
}): string {
  const from = args.from ? encodeURIComponent(args.from) : "";
  const qs = from ? `?from=${from}` : "";
  return `/app/estates/${args.estateId}/request-access${qs}`;
}