import Link from "next/link";
import { redirect } from "next/navigation";
import type { ComponentProps } from "react";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { getEstateAccess } from "@/lib/validators";
import { Estate, type EstateCollaborator } from "@/models/Estate";
import CollaboratorsManager from "@/components/estate/CollaboratorsManager";

type DbCollaborator = {
  userId: string;
  role: "OWNER" | "EDITOR" | "VIEWER";
  addedAt?: string;
};

type ManagerProps = ComponentProps<typeof CollaboratorsManager>;
type ManagerCollaborator = ManagerProps["collaborators"][number];

function toManagerRole(role: DbCollaborator["role"]): ManagerCollaborator["role"] {
  // Align roles even if the UI component uses a different Role union.
  const r = role.toUpperCase();
  if (r === "OWNER") return ("OWNER" as unknown) as ManagerCollaborator["role"];
  if (r === "EDITOR") return ("EDITOR" as unknown) as ManagerCollaborator["role"];
  return ("VIEWER" as unknown) as ManagerCollaborator["role"];
}

async function getCollaboratorsFromDb(estateId: string) {
  await connectToDatabase();

  const estate = await Estate.findById(estateId, { ownerId: 1, collaborators: 1 })
    .lean<{ ownerId: string; collaborators?: EstateCollaborator[] }>();

  if (!estate) return null;

  return {
    estateId,
    ownerId: estate.ownerId,
    collaborators: (estate.collaborators ?? []) as DbCollaborator[],
  };
}

export default async function CollaboratorsPage({
  params,
}: {
  params: Promise<{ estateId: string }>;
}) {
  const { estateId } = await params;

  const session = await auth();
  if (!session?.user?.id) redirect("/app/login");

  const access = await getEstateAccess(estateId, session.user.id);
  if (!access) redirect("/app/estates");

  const data = await getCollaboratorsFromDb(estateId);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Collaborators</h1>
        <Link
          href={`/app/estates/${estateId}`}
          className="text-sm text-blue-600 hover:underline"
        >
          Back to estate
        </Link>
      </div>

      <p className="mt-2 text-sm text-gray-600">
        Owners can add/remove collaborators and change roles. Editors/Viewers can
        only view this list.
      </p>

      <div className="mt-4 rounded-md border border-gray-200 bg-white p-4">
        <div className="text-sm font-semibold">Your role</div>
        <div className="mt-1 text-sm text-gray-700">
          {access.role === "OWNER"
            ? "Owner"
            : access.role === "EDITOR"
            ? "Editor"
            : "Viewer"}
        </div>
      </div>

      <div className="mt-6 rounded-md border border-gray-200 bg-white p-4">
        <div className="text-sm font-semibold">Owner</div>
        <div className="mt-2 text-sm text-gray-700">
          <span className="font-mono">{data?.ownerId ?? "—"}</span>
        </div>
      </div>

      <div className="mt-6 rounded-md border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Collaborators</div>
          <span className="text-xs text-gray-500">
            {access.role === "OWNER" ? "Manage access" : "Read-only"}
          </span>
        </div>

        <div className="mt-3">
          <CollaboratorsManager
            estateId={estateId}
            collaborators={((data?.collaborators ?? []) as DbCollaborator[]).map(
              (c) =>
                ({
                  userId: c.userId,
                  role: toManagerRole(c.role),
                  addedAt: c.addedAt,
                }) as ManagerCollaborator
            )}
            isOwner={access.role === "OWNER"}
          />
        </div>
      </div>
    </div>
  );
}