"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { getApiErrorMessage, safeJson } from "@/lib/utils";

type Role = "EDITOR" | "VIEWER";

type Collaborator = {
  userId: string;
  role: Role;
};

type InviteStatus = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";

type Invite = {
  token: string;
  email: string;
  role: Role;
  status: InviteStatus;
  createdAt?: string;
  expiresAt?: string;
};

type ApiError = { ok: false; error: string };
type ApiOk<T extends Record<string, unknown> = Record<string, never>> = { ok: true } & T;
type ApiResponse<T extends Record<string, unknown> = Record<string, never>> = ApiOk<T> | ApiError;

export default function CollaboratorsManager({
  estateId,
  collaborators,
  isOwner,
}: {
  estateId: string;
  collaborators: Collaborator[];
  isOwner: boolean;
}) {
  const router = useRouter();

  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<Role>("VIEWER");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Invite-link flow (no email service)
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("VIEWER");
  const [invites, setInvites] = useState<Invite[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [invitesError, setInvitesError] = useState<string | null>(null);
  const [createdInviteUrl, setCreatedInviteUrl] = useState<string | null>(null);

  const isValidEmail = useMemo(() => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return false;
    // Simple pragmatic check (avoid heavy regex)
    return email.includes("@") && email.includes(".") && !email.includes(" ");
  }, [inviteEmail]);

  const canUseClipboard = useMemo(() => {
    return typeof navigator !== "undefined" && !!navigator.clipboard?.writeText;
  }, []);

  async function copyToClipboard(text: string) {
    try {
      if (canUseClipboard) {
        await navigator.clipboard.writeText(text);
        setInfo("Copied link.");
        return;
      }
    } catch {
      // ignore
    }

    // Fallback
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.style.position = "fixed";
      el.style.left = "-9999px";
      document.body.appendChild(el);
      el.focus();
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setInfo("Copied link.");
    } catch {
      setInfo("Copy failed — please copy manually.");
    }
  }

  const fetchInvites = useCallback(
    async (signal?: AbortSignal) => {
      if (!isOwner) return;

      try {
        setInvitesLoading(true);
        setInvitesError(null);

        const res = await fetch(`/api/estates/${estateId}/invites`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          signal,
        });

        const data = (await safeJson<ApiResponse<{ invites?: Invite[] }>>(res)) ?? null;

        if (signal?.aborted) return;

        if (!res.ok || !data || data.ok === false) {
          const msg =
            data && data.ok === false
              ? data.error
              : await Promise.resolve(getApiErrorMessage(res));
          setInvitesError(msg || "Failed to load invites");
          return;
        }

        setInvites(Array.isArray(data.invites) ? data.invites : []);
      } catch (err) {
        if (signal?.aborted) return;
        const fallback = typeof err === "string" ? err : "Failed to load invites";
        setInvitesError(fallback);
      } finally {
        if (!signal?.aborted) setInvitesLoading(false);
      }
    },
    [estateId, isOwner]
  );

  useEffect(() => {
    if (!isOwner) return;

    const controller = new AbortController();

    // Defer the call so we don't trigger the set-state-in-effect rule.
    const t = window.setTimeout(() => {
      void fetchInvites(controller.signal);
    }, 0);

    return () => {
      window.clearTimeout(t);
      controller.abort();
    };
  }, [fetchInvites, isOwner]);

  async function createInvite() {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      setInvitesError("Email is required");
      return;
    }
    if (!isValidEmail) {
      setInvitesError("Please enter a valid email");
      return;
    }

    setInvitesLoading(true);
    setInvitesError(null);
    setCreatedInviteUrl(null);
    setInfo(null);

    const res = await fetch(`/api/estates/${estateId}/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role: inviteRole }),
    });

    setInvitesLoading(false);

    const data = (await safeJson<ApiResponse<{ inviteUrl?: string }>>(res)) ?? null;

    if (!res.ok || !data || data.ok === false) {
      const msg =
        data && data.ok === false
          ? data.error
          : await Promise.resolve(getApiErrorMessage(res));
      setInvitesError(msg || "Failed to create invite");
      return;
    }

    setInviteEmail("");
    setInviteRole("VIEWER");
    setCreatedInviteUrl(typeof data.inviteUrl === "string" ? data.inviteUrl : null);
    setInfo("Invite created.");
    await fetchInvites();
  }

  async function revokeInvite(inv: Invite) {
    if (inv.status !== "PENDING") return;
    if (!confirm(`Revoke invite for ${inv.email}?`)) return;

    setInvitesLoading(true);
    setInvitesError(null);
    setError(null);
    setInfo(null);

    const res = await fetch(`/api/estates/${estateId}/invites`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: inv.token }),
    });

    setInvitesLoading(false);

    const data = (await safeJson<ApiResponse>(res)) ?? null;

    if (!res.ok || !data || data.ok === false) {
      const msg =
        data && data.ok === false
          ? data.error
          : await Promise.resolve(getApiErrorMessage(res));
      setInvitesError(msg || "Failed to revoke invite");
      return;
    }

    setInfo("Invite revoked.");
    await fetchInvites();
  }

  async function addCollaborator() {
    if (!userId) return;

    const trimmed = userId.trim();
    const existing = collaborators.find((c) => c.userId === trimmed);
    if (existing && existing.role === role) {
      setInfo("No changes to save.");
      return;
    }

    setLoading(true);
    setError(null);
    setInfo(null);

    const res = await fetch(`/api/estates/${estateId}/collaborators`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: trimmed, role }),
    });

    setLoading(false);

    const data = (await safeJson<ApiResponse>(res)) ?? null;

    if (!res.ok || !data || data.ok === false) {
      const msg =
        data && data.ok === false
          ? data.error
          : await Promise.resolve(getApiErrorMessage(res));
      setError(msg || "Failed to add collaborator");
      return;
    }

    setUserId("");
    setRole("VIEWER");
    setInfo("Saved.");
    router.refresh();
  }

  async function updateRole(targetUserId: string, newRole: Role) {
    const existing = collaborators.find((c) => c.userId === targetUserId);
    if (existing && existing.role === newRole) {
      setInfo("No changes to save.");
      return;
    }

    setLoading(true);
    setError(null);
    setInfo(null);

    const res = await fetch(`/api/estates/${estateId}/collaborators`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: targetUserId, role: newRole }),
    });

    setLoading(false);

    const data = (await safeJson<ApiResponse>(res)) ?? null;

    if (!res.ok || !data || data.ok === false) {
      const msg =
        data && data.ok === false
          ? data.error
          : await Promise.resolve(getApiErrorMessage(res));
      setError(msg || "Failed to update role");
      return;
    }

    setInfo("Saved.");
    router.refresh();
  }

  async function removeCollaborator(targetUserId: string) {
    if (!confirm(`Remove collaborator ${targetUserId}?`)) return;

    setLoading(true);
    setError(null);
    setInfo(null);

    const res = await fetch(`/api/estates/${estateId}/collaborators`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: targetUserId }),
    });

    setLoading(false);

    const data = (await safeJson<ApiResponse>(res)) ?? null;

    if (!res.ok || !data || data.ok === false) {
      const msg =
        data && data.ok === false
          ? data.error
          : await Promise.resolve(getApiErrorMessage(res));
      setError(msg || "Failed to remove collaborator");
      return;
    }

    setInfo("Removed.");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {!isOwner && (
        <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
          <div className="text-sm font-medium text-gray-900">Collaborators</div>
          <p className="mt-1 text-xs text-gray-600">
            You can view collaborators, but only the estate owner can add/remove people or change roles.
          </p>
        </div>
      )}
      {isOwner && (
        <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
          <div className="text-sm font-medium">Add collaborator</div>

          <div className="mt-2 flex flex-wrap gap-2">
            <input
              type="text"
              placeholder="User ID"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm"
            />

            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
            >
              <option value="VIEWER">Viewer</option>
              <option value="EDITOR">Editor</option>
            </select>

            <button
              onClick={addCollaborator}
              disabled={loading || !userId.trim()}
              className="rounded-md bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Add
            </button>
          </div>

          {error && (
            <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>
      )}

      {info && <div className="text-xs text-gray-600">{info}</div>}

      {isOwner && (
        <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
          <div className="text-sm font-medium">Invites (link)</div>
          <p className="mt-1 text-xs text-gray-600">
            Create an invite link and share it manually (no email service required).
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <input
              type="email"
              placeholder="Email address"
              value={inviteEmail}
              onChange={(e) => {
                setInviteEmail(e.target.value);
                if (invitesError) setInvitesError(null);
              }}
              className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm"
            />

            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as Role)}
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
            >
              <option value="VIEWER">Viewer</option>
              <option value="EDITOR">Editor</option>
            </select>

            <button
              onClick={createInvite}
              disabled={invitesLoading || !isValidEmail}
              className="rounded-md bg-black px-3 py-1 text-sm text-white hover:bg-gray-900 disabled:opacity-50"
            >
              Create link
            </button>
          </div>
          <div className="mt-2 text-[11px] text-gray-500">
            Tip: This does not send email — it generates a link you can copy and share.
          </div>

          {createdInviteUrl && (
            <div className="mt-3 rounded-md border border-gray-200 bg-white p-3">
              <div className="text-xs font-medium text-gray-700">New invite link</div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <a
                  href={createdInviteUrl}
                  className="min-w-0 flex-1 truncate text-xs text-blue-700 hover:underline"
                >
                  {createdInviteUrl}
                </a>
                <button
                  type="button"
                  onClick={() => copyToClipboard(createdInviteUrl)}
                  className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs hover:bg-gray-50"
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          {invitesError && (
            <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
              {invitesError}
            </div>
          )}

          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between">
              <div className="text-xs font-medium text-gray-700">Recent invites</div>
              <button
                type="button"
                onClick={() => {
                  void fetchInvites();
                }}
                disabled={invitesLoading}
                className="text-xs text-blue-700 hover:underline disabled:opacity-50"
              >
                Refresh
              </button>
            </div>

            {invitesLoading ? (
              <div className="text-xs text-gray-600">Loading…</div>
            ) : invites.length === 0 ? (
              <div className="text-xs text-gray-600">No invites yet.</div>
            ) : (
              <div className="space-y-2">
                {invites.map((inv) => {
                  const badgeClass =
                    inv.status === "PENDING"
                      ? "bg-amber-100 text-amber-800"
                      : inv.status === "ACCEPTED"
                        ? "bg-green-100 text-green-800"
                        : inv.status === "EXPIRED"
                          ? "bg-gray-200 text-gray-700"
                          : "bg-gray-200 text-gray-700";

                  const invitePath = `/app/invites/${inv.token}`;
                  const origin =
                    typeof window !== "undefined" ? window.location.origin : "";
                  const inviteUrl = origin ? `${origin}${invitePath}` : invitePath;

                  return (
                    <div
                      key={inv.token}
                      className="rounded-md border border-gray-200 bg-white p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-medium text-gray-800">
                            {inv.email}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                            <span className="rounded px-2 py-0.5 text-[11px] font-medium bg-gray-100 text-gray-700">
                              {inv.role}
                            </span>
                            <span
                              className={`rounded px-2 py-0.5 text-[11px] font-medium ${badgeClass}`}
                            >
                              {inv.status}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <a
                            href={inviteUrl}
                            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs hover:bg-gray-50"
                          >
                            Open
                          </a>

                          <button
                            type="button"
                            onClick={() => {
                              void copyToClipboard(inviteUrl);
                            }}
                            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs hover:bg-gray-50"
                          >
                            Copy link
                          </button>

                          {inv.status === "PENDING" ? (
                            <button
                              type="button"
                              onClick={() => revokeInvite(inv)}
                              disabled={invitesLoading}
                              className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-50"
                            >
                              Revoke
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {collaborators.map((c) => (
          <div
            key={c.userId}
            className="flex items-center justify-between rounded-md border border-gray-100 bg-white px-3 py-2"
          >
            <div className="min-w-0">
              <div className="truncate font-mono text-sm">{c.userId}</div>
              <div className="text-xs text-gray-500">{c.role}</div>
            </div>

            {isOwner && (
              <div className="flex items-center gap-2">
                <select
                  value={c.role}
                  disabled={loading}
                  onChange={(e) =>
                    updateRole(c.userId, e.target.value as Role)
                  }
                  className="rounded-md border border-gray-300 px-2 py-1 text-xs disabled:opacity-50"
                >
                  <option value="VIEWER">Viewer</option>
                  <option value="EDITOR">Editor</option>
                </select>

                <button
                  onClick={() => removeCollaborator(c.userId)}
                  disabled={loading}
                  className="text-xs text-red-600 hover:underline disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}