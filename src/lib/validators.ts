// src/lib/validators.ts
// NOTE: despite the filename, this file also holds server-only access helpers.

import { connectToDatabase } from "@/lib/db";
import { Estate, type EstateRole, type EstateCollaborator } from "@/models/Estate";

export type EstateAccess = {
  estateId: string;
  role: EstateRole;
  canEdit: boolean;
  canViewSensitive: boolean;
};

export function isEstateRole(value: unknown): value is EstateRole {
  return value === "OWNER" || value === "EDITOR" || value === "VIEWER";
}

export function canEditEstate(role: EstateRole): boolean {
  return role === "OWNER" || role === "EDITOR";
}

export function canViewSensitiveEstateData(role: EstateRole): boolean {
  // Keep strict by default: VIEWER cannot see sensitive docs/notes
  return role === "OWNER" || role === "EDITOR";
}

/**
 * Resolve a user's role for a given estate.
 * - OWNER if `estate.ownerId === userId`
 * - Otherwise checks `estate.collaborators[]`
 * Returns null if the user has no access.
 */
export async function getEstateAccess(
  estateId: string,
  userId: string
): Promise<EstateAccess | null> {
  await connectToDatabase();

  const estate = await Estate.findById(estateId, { ownerId: 1, collaborators: 1 })
    .lean<{ ownerId: string; collaborators?: EstateCollaborator[] }>();
  if (!estate) return null;

  if (estate.ownerId === userId) {
    return {
      estateId,
      role: "OWNER",
      canEdit: true,
      canViewSensitive: true,
    };
  }

  const collaborators = estate.collaborators ?? [];

  const match = collaborators.find((c) => c.userId === userId);
  if (!match || !isEstateRole(match.role)) return null;

  return {
    estateId,
    role: match.role,
    canEdit: canEditEstate(match.role),
    canViewSensitive: canViewSensitiveEstateData(match.role),
  };
}

/**
 * Convenience helper that throws a 403-style error you can map to NextResponse.json.
 */
export async function requireEstateAccess(
  estateId: string,
  userId: string
): Promise<EstateAccess> {
  const access = await getEstateAccess(estateId, userId);
  if (!access) {
    const err = new Error("Forbidden");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
  return access;
}