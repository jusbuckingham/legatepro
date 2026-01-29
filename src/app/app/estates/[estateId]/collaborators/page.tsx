import Link from "next/link";
import { redirect } from "next/navigation";
import type { ComponentProps } from "react";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { getEstateAccess } from "@/lib/validators";
import { Estate } from "@/models/Estate";
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
    .lean<{ ownerId: string; collaborators?: DbCollaborator[] }>();

  if (!estate) return null;

  return {
    estateId,
    ownerId: estate.ownerId,
    collaborators: (estate.collaborators ?? []) as DbCollaborator[],
  };
}

export default async function CollaboratorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ estateId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { estateId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/app/estates/${estateId}/collaborators`);
  }

  const access = await getEstateAccess(estateId, session.user.id);
  if (!access) redirect("/app/estates");

  const sp = searchParams ? await searchParams : undefined;
  const forbiddenRaw = sp?.forbidden;
  const forbidden =
    forbiddenRaw === "1" ||
    (typeof forbiddenRaw === "string" && forbiddenRaw.toLowerCase() === "true") ||
    (Array.isArray(forbiddenRaw) && (forbiddenRaw[0] === "1" || (forbiddenRaw[0] ?? "").toLowerCase() === "true"));

  const canManage = access.role === "OWNER";

  const data = await getCollaboratorsFromDb(estateId);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <nav className="text-xs text-gray-500">
            <Link href="/app/estates" className="hover:underline">
              Estates
            </Link>
            <span className="mx-1 text-gray-400">/</span>
            <Link href={`/app/estates/${estateId}`} className="hover:underline">
              Overview
            </Link>
            <span className="mx-1 text-gray-400">/</span>
            <span className="text-gray-900">Collaborators</span>
          </nav>

          <div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-900">Collaborators</h1>
            <p className="mt-1 max-w-2xl text-sm text-gray-600">
              Invite people to help manage this estate. Owners can add/remove collaborators and change roles.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/app/estates/${estateId}`}
            className="inline-flex items-center rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            Back to overview
          </Link>
        </div>
      </div>

      {forbidden && (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="font-semibold">Action blocked</div>
              <div className="text-xs text-rose-800">
                You don’t have permission to change collaborator access for this estate.
              </div>
            </div>
            <Link
              href={`/app/estates/${estateId}?requestAccess=1`}
              className="inline-flex items-center justify-center rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-900 hover:bg-rose-100"
            >
              Request access
            </Link>
          </div>
        </div>
      )}

      <div className="rounded-md border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900">Your access</div>
            <div className="mt-1 text-sm text-gray-700">
              {access.role === "OWNER" ? "Owner" : access.role === "EDITOR" ? "Editor" : "Viewer"}
            </div>
          </div>
          <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-700">
            {access.role === "OWNER" ? "Full control" : access.role === "EDITOR" ? "Can edit" : "View only"}
          </span>
        </div>
      </div>

      {!canManage && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="font-semibold">Limited access</div>
              <div className="text-xs text-amber-800">
                Only the Owner can invite people, remove access, and change roles.
              </div>
            </div>
            <Link
              href={`/app/estates/${estateId}?requestAccess=1`}
              className="inline-flex items-center justify-center rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
            >
              Request access
            </Link>
          </div>
        </div>
      )}

      <div className="rounded-md border border-gray-200 bg-white p-4">
        <div className="text-sm font-semibold text-gray-900">Owner (user id)</div>
        <div className="mt-1 text-[11px] text-gray-500">The owner is the account with ultimate control for this estate.</div>
        <div className="mt-2 text-sm text-gray-700">
          <span className="font-mono">{data?.ownerId ?? "—"}</span>
        </div>
      </div>

      <div className="rounded-md border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-gray-900">Collaborators</div>
            <div className="mt-1 text-[11px] text-gray-500">Give access only to people you trust. You can change roles at any time.</div>
          </div>
          <span className="text-xs text-gray-500">{canManage ? "Owner controls access" : "View only"}</span>
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
            isOwner={canManage}
          />
        </div>
      </div>
    </div>
  );
}