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
   * When true, unauthenticated users will be treated as having no access.
   * When false (default), unauthenticated users return VIEWER/canEdit=false so
   * UI can show read-only messaging while upstream handles redirects.
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
    canViewSensitive: role === "OWNER", // safe default
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
    };
  }

  // Strip userId for backwards compatibility
  // (Use `void` so TypeScript understands we intentionally ignore it.)
  const { userId, ...rest } = access;
  void userId;
  return rest;
}

/** Convenience helper for routes/actions that must enforce edit privileges. */
export async function requireEstateEditAccess(
  input: RequireEstateAccessInput
): Promise<RequireEstateAccessResult> {
  const access = await requireEstateAccess(input);
  if (!access.hasAccess || !access.canEdit) {
    return {
      ...access,
      canEdit: false,
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