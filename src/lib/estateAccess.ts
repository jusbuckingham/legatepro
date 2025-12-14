// src/lib/estateAccess.ts
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";

export type EstateRole = "OWNER" | "EDITOR" | "VIEWER";

export type RequireEstateAccessInput = {
  estateId: string;
  /**
   * Optional override for server actions / routes that already resolved auth.
   * If omitted, this helper will call `auth()`.
   */
  userId?: string;
  /**
   * When true, unauthenticated users will be treated as having no access.
   * When false (default), unauthenticated users return VIEWER/canEdit=false so
   * UI can show read-only messaging while upstream handles redirects.
   */
  requireAuth?: boolean;
};

export type RequireEstateAccessResult = {
  estateId: string;
  /** True if the user is authenticated (or userId override provided). */
  isAuthenticated: boolean;
  /** True if the user is allowed to view this estate (owner/collaborator). */
  hasAccess: boolean;
  role: EstateRole;
  canEdit: boolean;
};

type EstateLean = {
  ownerId: unknown;
  collaborators?: { userId: unknown; role: EstateRole }[];
};

export async function requireEstateAccess(
  input: RequireEstateAccessInput
): Promise<RequireEstateAccessResult> {
  const estateId = input.estateId;

  const resolvedUserId = input.userId ?? (await auth())?.user?.id;
  const isAuthenticated = !!resolvedUserId;

  if (!resolvedUserId) {
    if (input.requireAuth) {
      return {
        estateId,
        isAuthenticated: false,
        hasAccess: false,
        role: "VIEWER",
        canEdit: false,
      };
    }

    // Caller pages typically redirect to login already; keep it predictable.
    return {
      estateId,
      isAuthenticated: false,
      hasAccess: false,
      role: "VIEWER",
      canEdit: false,
    };
  }

  await connectToDatabase();

  const estate = await Estate.findOne({
    _id: estateId,
    $or: [
      { ownerId: resolvedUserId },
      { "collaborators.userId": resolvedUserId },
    ],
  }).lean<EstateLean>();

  if (!estate) {
    return {
      estateId,
      isAuthenticated,
      hasAccess: false,
      role: "VIEWER",
      canEdit: false,
    };
  }

  // Owner
  if (String(estate.ownerId) === resolvedUserId) {
    return {
      estateId,
      isAuthenticated,
      hasAccess: true,
      role: "OWNER",
      canEdit: true,
    };
  }

  const collab = (estate.collaborators ?? []).find(
    (c) => String(c.userId) === resolvedUserId
  );

  const role: EstateRole = collab?.role ?? "VIEWER";
  const hasAccess = !!collab;
  const canEdit = role === "OWNER" || role === "EDITOR";

  return {
    estateId,
    isAuthenticated,
    hasAccess,
    role,
    canEdit,
  };
}

/** Convenience helper for routes/actions that must enforce edit privileges. */
export async function requireEstateEditAccess(
  input: RequireEstateAccessInput
): Promise<RequireEstateAccessResult> {
  const access = await requireEstateAccess(input);
  if (!access.hasAccess || !access.canEdit) {
    return {
      ...access,
      role: access.hasAccess ? access.role : "VIEWER",
      canEdit: false,
    };
  }
  return access;
}

/** Small role helper for UI (no runtime dependency). */
export function isEstateEditorRole(role: EstateRole): boolean {
  return role === "OWNER" || role === "EDITOR";
}