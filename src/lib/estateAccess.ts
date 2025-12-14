// src/lib/estateAccess.ts
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";

export type EstateRole = "OWNER" | "EDITOR" | "VIEWER";

const ROLE_RANK: Record<EstateRole, number> = {
  OWNER: 3,
  EDITOR: 2,
  VIEWER: 1,
};

export interface EstateAccess {
  estateId: string;
  userId: string;
  role: EstateRole;
  isOwner: boolean;
  canEdit: boolean;
  canViewSensitive: boolean;
}

export function isRole(access: EstateAccess, role: EstateRole): boolean {
  return ROLE_RANK[access.role] >= ROLE_RANK[role];
}

function normalizeRole(input: unknown): EstateRole {
  if (input === "OWNER" || input === "EDITOR" || input === "VIEWER") return input;
  return "VIEWER";
}

export async function requireEstateAccess(args: {
  estateId: string;
  userId: string;
  minRole?: EstateRole;
  requireSensitive?: boolean;
}): Promise<EstateAccess> {
  const { estateId, userId, minRole = "VIEWER", requireSensitive = false } = args;

  await connectToDatabase();

  const estate = await Estate.findOne({ _id: estateId, ownerId: userId }).lean();
  if (estate) {
    const access: EstateAccess = {
      estateId,
      userId,
      role: "OWNER",
      isOwner: true,
      canEdit: true,
      canViewSensitive: true,
    };
    return access;
  }

  // Not owner: check collaborators
  const estateWithCollabs = await Estate.findOne({ _id: estateId }).lean<{
    _id: unknown;
    ownerId?: unknown;
    collaborators?: Array<{
      userId?: unknown;
      role?: unknown;
      canViewSensitive?: unknown;
    }>;
  }>();

  if (!estateWithCollabs) {
    throw new Error("NOT_FOUND");
  }

  const collaborator = (estateWithCollabs.collaborators ?? []).find((c) => {
    return typeof c?.userId === "string" && c.userId === userId;
  });

  if (!collaborator) {
    throw new Error("FORBIDDEN");
  }

  const role = normalizeRole(collaborator.role);
  const access: EstateAccess = {
    estateId,
    userId,
    role,
    isOwner: false,
    canEdit: ROLE_RANK[role] >= ROLE_RANK.EDITOR,
    canViewSensitive:
      collaborator.canViewSensitive === true || ROLE_RANK[role] >= ROLE_RANK.EDITOR,
  };

  if (!isRole(access, minRole)) {
    throw new Error("FORBIDDEN");
  }

  if (requireSensitive && !access.canViewSensitive) {
    throw new Error("FORBIDDEN_SENSITIVE");
  }

  return access;
}