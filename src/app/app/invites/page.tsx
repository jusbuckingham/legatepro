

import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

type InviteStatus = "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED" | string;

type InviteListItem = {
  token: string;
  estateName: string;
  invitedEmail: string;
  role?: string;
  status: InviteStatus;
  invitedAt?: string;
};

function getStatusBadgeClasses(status: InviteStatus): string {
  switch (status) {
    case "PENDING":
      return "border-sky-500/30 bg-sky-500/10 text-sky-600";
    case "ACCEPTED":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600";
    case "EXPIRED":
      return "border-amber-500/30 bg-amber-500/10 text-amber-600";
    case "REVOKED":
      return "border-border bg-muted/20 text-muted-foreground";
    default:
      return "border-border bg-muted/20 text-muted-foreground";
  }
}

function formatStatusLabel(status: InviteStatus): string {
  switch (status) {
    case "PENDING":
      return "Pending";
    case "ACCEPTED":
      return "Accepted";
    case "EXPIRED":
      return "Expired";
    case "REVOKED":
      return "Revoked";
    default:
      return String(status || "Unknown");
  }
}

async function getInvitesForUser(): Promise<InviteListItem[]> {
  // UI-ready scaffold.
  // TODO: Wire this to your DB model (recommended) or an API route.
  // Suggested DB approach:
  // - connectToDatabase()
  // - Invite.find({ invitedEmail: session.user.email }).sort({ createdAt: -1 })
  // - map fields into InviteListItem
  return [];
}

export default async function Page() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent("/app/invites")}`);
  }

  const invites = await getInvitesForUser();
  const pending = invites.filter((i) => i.status === "PENDING");
  const resolved = invites.filter((i) => i.status !== "PENDING");

  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Invites
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage estate collaboration invites tied to your signed-in email.
          </p>
        </div>

        <div className="flex flex-col items-start gap-2 sm:items-end">
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Link
              href="/app/estates"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground shadow-sm hover:bg-muted/40"
            >
              Back to estates
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            Tip: if you can’t find an invite email, check spam or ask the owner to resend.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-foreground">
              {pending.length} pending invite{pending.length === 1 ? "" : "s"}
            </p>
            <p className="text-xs text-muted-foreground">Newest first</p>
          </div>

          {pending.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-border bg-muted/10 p-6 text-center">
              <p className="text-sm font-semibold text-foreground">No pending invites</p>
              <p className="mt-1 text-xs text-muted-foreground">
                When someone invites you to collaborate on an estate, it will show up here.
              </p>
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border border-border">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Estate</th>
                    <th className="px-4 py-3 text-left font-semibold">Role</th>
                    <th className="px-4 py-3 text-left font-semibold">Status</th>
                    <th className="px-4 py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {pending.map((inv) => (
                    <tr key={inv.token} className="hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{inv.estateName}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Invited: {inv.invitedEmail}
                          {inv.invitedAt ? ` • ${inv.invitedAt}` : ""}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{inv.role || "Collaborator"}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${getStatusBadgeClasses(
                            inv.status
                          )}`}
                        >
                          {formatStatusLabel(inv.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/app/invites/${encodeURIComponent(inv.token)}`}
                          className="inline-flex items-center rounded-full border border-border bg-muted/20 px-3 py-1 text-xs font-medium text-foreground hover:bg-muted/40"
                        >
                          Review
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-foreground">
              {resolved.length} past invite{resolved.length === 1 ? "" : "s"}
            </p>
            <p className="text-xs text-muted-foreground">
              Accepted and expired invites are shown for reference.
            </p>
          </div>

          {resolved.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">Nothing here yet.</p>
          ) : (
            <div className="mt-4 grid gap-3">
              {resolved.map((inv) => (
                <div
                  key={inv.token}
                  className="flex flex-col gap-2 rounded-xl border border-border bg-muted/10 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold text-foreground">{inv.estateName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {inv.invitedEmail}
                      {inv.invitedAt ? ` • ${inv.invitedAt}` : ""}
                      {inv.role ? ` • ${inv.role}` : ""}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${getStatusBadgeClasses(
                        inv.status
                      )}`}
                    >
                      {formatStatusLabel(inv.status)}
                    </span>

                    <Link
                      href={`/app/invites/${encodeURIComponent(inv.token)}`}
                      className="inline-flex items-center rounded-full border border-border bg-muted/20 px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    >
                      Details
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Note:</span> This page is UI-ready.
            When you’re ready, we can wire it to your invites model and show real data.
          </div>
        </div>
      </div>
    </div>
  );
}