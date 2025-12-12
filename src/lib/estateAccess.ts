// src/lib/estateAccess.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";

export type EstateRole = "OWNER" | "EDITOR" | "VIEWER";

type CollaboratorLite = {
  userId: unknown;
  role?: unknown;
};

type EstateLite = {
  ownerId?: unknown;
  collaborators?: CollaboratorLite[];
};

type AccessOk = {
  ok: true;
  estate: InstanceType<typeof Estate>;
  role: EstateRole;
  userId: string;
};

type AccessFail = {
  ok: false;
  res: NextResponse;
};

type AccessResult = AccessOk | AccessFail;

function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

function normalizeRole(input: unknown): EstateRole | null {
  if (input === "OWNER" || input === "EDITOR" || input === "VIEWER") return input;
  return null;
}

function getUserEstateRole(estate: EstateLite, userId: string): EstateRole | null {
  // ownerId is typically a string in your schemas (or ObjectId-like). Normalize to string.
  const ownerId = estate?.ownerId != null ? String(estate.ownerId) : null;
  if (ownerId && ownerId === userId) return "OWNER";

  const collaborators: CollaboratorLite[] = Array.isArray(estate?.collaborators)
    ? estate.collaborators
    : [];

  const match = collaborators.find((c) => String(c.userId) === userId);

  return normalizeRole(match?.role);
}

/**
 * Require that the current session user has at least one of the allowed roles on this estate.
 * - Always authenticates
 * - Loads estate
 * - Determines user's role (OWNER via ownerId OR collaborator role)
 * - Returns a typed result you can use in handlers
 */
export async function requireEstateRole(
  estateId: string,
  allowed: EstateRole[] = ["OWNER", "EDITOR", "VIEWER"]
): Promise<AccessResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, res: jsonError(401, "Unauthorized") };

  await connectToDatabase();

  const estate = await Estate.findById(estateId);
  if (!estate) return { ok: false, res: jsonError(404, "Estate not found") };

  const role = getUserEstateRole(estate, userId);
  if (!role) return { ok: false, res: jsonError(403, "Forbidden") };

  if (!allowed.includes(role)) {
    return { ok: false, res: jsonError(403, "Insufficient role") };
  }

  return { ok: true, estate, role, userId };
}

// Convenience wrappers (most routes will use these)
export function requireOwner(estateId: string) {
  return requireEstateRole(estateId, ["OWNER"]);
}
export function requireEditor(estateId: string) {
  return requireEstateRole(estateId, ["OWNER", "EDITOR"]);
}
export function requireViewer(estateId: string) {
  return requireEstateRole(estateId, ["OWNER", "EDITOR", "VIEWER"]);
}