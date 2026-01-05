import { redirect, notFound } from "next/navigation";
import Link from "next/link";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";
import type { EstateInvite, InviteRole } from "@/models/Estate";
import { logEstateEvent } from "@/lib/estateEvents";

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  EDITOR: "Editor",
  VIEWER: "Viewer",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  ACCEPTED: "Accepted",
  REVOKED: "Revoked",
  EXPIRED: "Expired",
};

function formatRoleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

function formatStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

function getStatusBadgeClasses(status: string): string {
  switch (status) {
    case "PENDING":
      return "border-sky-900/40 bg-sky-950/40 text-sky-200";
    case "ACCEPTED":
      return "border-emerald-900/40 bg-emerald-950/40 text-emerald-200";
    case "REVOKED":
      return "border-slate-800 bg-slate-900/60 text-slate-200";
    case "EXPIRED":
      return "border-amber-900/40 bg-amber-950/40 text-amber-200";
    default:
      return "border-slate-800 bg-slate-900/60 text-slate-200";
  }
}

function isExpired(invite: Pick<EstateInvite, "status" | "expiresAt">): boolean {
  if (invite.status !== "PENDING") return false;
  if (!invite.expiresAt) return false;
  return invite.expiresAt.getTime() <= Date.now();
}

export default async function InviteAcceptPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;

  const sp = searchParams ? await searchParams : undefined;

  const getParam = (key: string): string | undefined => {
    const raw = sp?.[key];
    if (typeof raw === "string") return raw;
    if (Array.isArray(raw)) return raw[0];
    return undefined;
  };

  const error = getParam("error");

  const errorMessage =
    error === "unauthorized"
      ? "Please sign in to accept this invite."
      : error === "not_found"
        ? "This invite link is invalid or no longer exists."
        : error === "not_pending"
          ? "This invite has already been used or can’t be accepted."
          : error === "expired"
            ? "This invite link has expired. Ask the owner to create a new invite."
            : error === "email_mismatch"
              ? "You’re signed in with a different email than the one this invite was sent to."
              : undefined;

  await connectToDatabase();

  const estate = await Estate.findOne({
    invites: { $elemMatch: { token } },
  });

  if (!estate) {
    notFound();
  }

  const invite = (estate.invites ?? []).find(
    (i: EstateInvite) => i.token === token
  );

  if (!invite) {
    notFound();
  }

  const expired = isExpired(invite);

  // Persist expiration so the UI and stored state stay aligned.
  if (expired) {
    invite.status = "EXPIRED";
    await estate.save();
  }

  const status: EstateInvite["status"] | "EXPIRED" = expired
    ? "EXPIRED"
    : invite.status;

  const estateName = estate.name ? String(estate.name) : "Estate";

  const session = await auth();
  const signedInEmail = session?.user?.email
    ? String(session.user.email).toLowerCase()
    : null;

  const inviteEmail = String(invite.email ?? "").toLowerCase();
  if (!inviteEmail) {
    notFound();
  }
  const role = invite.role as InviteRole;
  const roleLabel = formatRoleLabel(String(role));
  const statusLabel = formatStatusLabel(String(status));

  async function acceptInviteAction() {
    "use server";

    const session = await auth();
    if (!session?.user?.id || !session.user.email) {
      redirect(`/app/invites/${token}?error=unauthorized`);
    }

    await connectToDatabase();

    const estate = await Estate.findOne({
      invites: { $elemMatch: { token } },
    });

    if (!estate) {
      redirect(`/app/invites/${token}?error=not_found`);
    }

    const invite = (estate.invites ?? []).find(
      (i: EstateInvite) => i.token === token
    );

    if (!invite) {
      redirect(`/app/invites/${token}?error=not_found`);
    }

    // Only pending invites can be accepted.
    if (invite.status !== "PENDING") {
      redirect(`/app/invites/${token}?error=not_pending`);
    }

    if (isExpired(invite)) {
      invite.status = "EXPIRED";
      await estate.save();
      redirect(`/app/invites/${token}?error=expired`);
    }

    const userEmail = String(session.user.email).toLowerCase();
    if (String(invite.email).toLowerCase() !== userEmail) {
      redirect(`/app/invites/${token}?error=email_mismatch`);
    }

    // Add/update collaborator
    estate.collaborators = estate.collaborators ?? [];
    const existing = estate.collaborators.find(
      (c: { userId: string; role: string }) => c.userId === session.user.id
    );

    if (existing) {
      const previousRole = existing.role;
      if (previousRole !== invite.role) {
        existing.role = invite.role;

        await logEstateEvent({
          ownerId: estate.ownerId,
          estateId: String(estate._id),
          type: "COLLABORATOR_ROLE_CHANGED",
          summary: "Collaborator role updated",
          detail: `Updated ${userEmail} from ${previousRole} to ${invite.role}`,
          meta: {
            userId: session.user.id,
            previousRole,
            role: invite.role,
          },
        });
      }
    } else {
      estate.collaborators.push({
        userId: session.user.id,
        role: invite.role,
        addedAt: new Date(),
      });

      await logEstateEvent({
        ownerId: estate.ownerId,
        estateId: String(estate._id),
        type: "COLLABORATOR_ADDED",
        summary: "Collaborator added",
        detail: `Accepted invite: ${userEmail} as ${invite.role}`,
        meta: {
          userId: session.user.id,
          email: userEmail,
          role: invite.role,
        },
      });
    }

    // Mark invite accepted
    invite.status = "ACCEPTED";
    invite.acceptedBy = session.user.id;
    invite.acceptedAt = new Date();

    await estate.save();

    redirect(`/app/estates/${String(estate._id)}`);
  }

  return (
    <div className="mx-auto w-full max-w-xl p-6">
      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-6">
        {errorMessage ? (
          <div className="mb-4 rounded-md border border-red-900/40 bg-red-950/40 p-3 text-sm text-red-200">
            {errorMessage}
          </div>
        ) : null}

        <h1 className="text-xl font-semibold text-slate-50">Accept collaborator invite</h1>
        <p className="mt-2 text-sm text-slate-400">
          You’ve been invited to collaborate on <span className="font-medium text-slate-200">{estateName}</span>.
        </p>

        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/50 p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Invited email</span>
            <span className="font-medium text-slate-100">{inviteEmail}</span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-slate-400">Role</span>
            <span className="font-medium text-slate-100">{roleLabel}</span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-slate-400">Status</span>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${getStatusBadgeClasses(
                String(status)
              )}`}
            >
              {statusLabel}
            </span>
          </div>
        </div>

        {!session?.user?.id ? (
          <div className="mt-4">
            <p className="text-sm text-slate-300">Please sign in to accept this invite.</p>
            <Link
              href={`/login?callbackUrl=${encodeURIComponent(`/app/invites/${token}`)}`}
              className="mt-3 inline-flex w-full items-center justify-center rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-white"
            >
              Sign in to accept
            </Link>
          </div>
        ) : signedInEmail !== inviteEmail ? (
          <div className="mt-4 rounded-md border border-amber-900/40 bg-amber-950/40 p-3 text-sm text-amber-200">
            <div className="space-y-2">
              <div>
                You’re signed in as{" "}
                <span className="font-medium text-amber-100">
                  {signedInEmail ?? ""}
                </span>
                , but this invite is for{" "}
                <span className="font-medium text-amber-100">
                  {inviteEmail}
                </span>
                .
              </div>
              <div className="text-amber-200/80">
                Sign in with the invited email to accept.
              </div>
            </div>
          </div>
        ) : status !== "PENDING" ? (
          <div className="mt-4 rounded-md border border-slate-800 bg-slate-900/50 p-3 text-sm text-slate-300">
            This invite can’t be accepted because its status is <span className="font-medium text-slate-100">{statusLabel}</span>.
          </div>
        ) : (
          <form action={acceptInviteAction} className="mt-5">
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-md bg-rose-500 px-4 py-2 text-sm font-medium text-white hover:bg-rose-400"
            >
              Accept invite
            </button>
            <p className="mt-2 text-xs text-slate-500">
              After accepting, you’ll be taken to the estate overview. You must be signed in with the invited email.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}