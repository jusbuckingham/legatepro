"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

  const [origin, setOrigin] = useState<string>("");
  const infoTimerRef = useRef<number | null>(null);

  const setInfoWithTimeout = (message: string | null): void => {
    if (infoTimerRef.current != null) {
      window.clearTimeout(infoTimerRef.current);
      infoTimerRef.current = null;
    }
    setInfo(message);
    if (message) {
      infoTimerRef.current = window.setTimeout(() => {
        setInfo(null);
        infoTimerRef.current = null;
      }, 2500);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
    return () => {
      if (infoTimerRef.current != null) {
        window.clearTimeout(infoTimerRef.current);
        infoTimerRef.current = null;
      }
    };
  }, []);

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
    if (typeof navigator === "undefined") return false;
    const hasApi = !!navigator.clipboard?.writeText;
    const isSecure = typeof window === "undefined" ? true : window.isSecureContext;
    return hasApi && isSecure;
  }, []);

  async function copyToClipboard(text: string): Promise<void> {
    try {
      if (canUseClipboard) {
        await navigator.clipboard.writeText(text);
        setInfoWithTimeout("Link copied.");
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
      setInfoWithTimeout("Link copied.");
    } catch {
      setInfoWithTimeout("Copy failed — please copy manually.");
    }
  }

  const fetchInvites = useCallback(
    async (signal?: AbortSignal) => {
      if (!isOwner) return;

      try {
        setInvitesLoading(true);
        setInvitesError(null);

        const res = await fetch(`/api/estates/${encodeURIComponent(estateId)}/invites`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
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
    setInfoWithTimeout(null);

    const res = await fetch(`/api/estates/${encodeURIComponent(estateId)}/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
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
    setInfoWithTimeout("Invite link created.");
    await fetchInvites();
  }

  async function revokeInvite(inv: Invite) {
    if (inv.status !== "PENDING") return;
    if (!confirm(`Revoke invite for ${inv.email}? They won’t be able to use the link.`)) return;

    setInvitesLoading(true);
    setInvitesError(null);
    setError(null);
    setInfoWithTimeout(null);

    const res = await fetch(`/api/estates/${encodeURIComponent(estateId)}/invites`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
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

    setInfoWithTimeout("Invite revoked.");
    await fetchInvites();
  }

  async function addCollaborator() {
    if (!userId) return;

    const trimmed = userId.trim();
    const existing = collaborators.find((c) => c.userId === trimmed);
    if (existing && existing.role === role) {
      setInfoWithTimeout("No changes to save.");
      return;
    }

    setLoading(true);
    setError(null);
    setInfoWithTimeout(null);

    const res = await fetch(`/api/estates/${encodeURIComponent(estateId)}/collaborators`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
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
    setInfoWithTimeout("Saved.");
    router.refresh();
  }

  async function updateRole(targetUserId: string, newRole: Role) {
    const existing = collaborators.find((c) => c.userId === targetUserId);
    if (existing && existing.role === newRole) {
      setInfoWithTimeout("No changes to save.");
      return;
    }

    setLoading(true);
    setError(null);
    setInfoWithTimeout(null);

    const res = await fetch(`/api/estates/${encodeURIComponent(estateId)}/collaborators`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
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

    setInfoWithTimeout("Saved.");
    router.refresh();
  }

  async function removeCollaborator(targetUserId: string) {
    if (!confirm(`Remove collaborator ${targetUserId}?`)) return;

    setLoading(true);
    setError(null);
    setInfoWithTimeout(null);

    const res = await fetch(`/api/estates/${encodeURIComponent(estateId)}/collaborators`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
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

    setInfoWithTimeout("Removed.");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {!isOwner && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="text-sm font-semibold text-gray-900">Collaborators</div>
          <p className="mt-1 text-xs text-gray-600">
            You can view who has access. Only the estate owner can add people or change roles.
          </p>
        </div>
      )}
      {isOwner && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-gray-900">Add a collaborator</div>
          <p className="mt-1 text-xs text-gray-600">Grant access by user ID. Use invites below if you only have an email.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              type="text"
              placeholder="User ID (e.g., 123abc...)"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900 placeholder:text-gray-400"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="rounded-md border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900"
            >
              <option value="VIEWER">Viewer</option>
              <option value="EDITOR">Editor</option>
            </select>
            <button
              type="button"
              onClick={addCollaborator}
              disabled={loading || !userId.trim()}
              className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              Save
            </button>
          </div>
          {error && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              {error}
            </div>
          )}
        </div>
      )}

      {info && <div className="text-xs text-gray-600">{info}</div>}

      {isOwner && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-gray-900">Invite links</div>
          <p className="mt-1 text-xs text-gray-600">
            Create an invite link and share it. We don’t send email yet.
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
              className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900 placeholder:text-gray-400"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as Role)}
              className="rounded-md border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900"
            >
              <option value="VIEWER">Viewer</option>
              <option value="EDITOR">Editor</option>
            </select>
            <button
              type="button"
              onClick={createInvite}
              disabled={invitesLoading || !isValidEmail}
              className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              Create link
            </button>
          </div>
          {createdInviteUrl && (
            <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs font-semibold text-gray-900">New invite link</div>
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
                  className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Copy link
                </button>
              </div>
            </div>
          )}
          {invitesError && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              {invitesError}
            </div>
          )}
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between">
              <div className="text-xs font-semibold text-gray-900">Recent invites</div>
              <button
                type="button"
                onClick={() => {
                  void fetchInvites();
                }}
                disabled={invitesLoading}
                className="text-xs font-medium text-blue-700 hover:underline disabled:opacity-50"
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
                      ? "border border-amber-200 bg-amber-50 text-amber-800"
                      : inv.status === "ACCEPTED"
                        ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                        : inv.status === "EXPIRED"
                          ? "border border-gray-200 bg-gray-50 text-gray-700"
                          : "border border-gray-200 bg-gray-50 text-gray-700";
                  const invitePath = `/app/invites/${inv.token}`;
                  const inviteUrl = origin ? `${origin}${invitePath}` : invitePath;
                  return (
                    <div
                      key={inv.token}
                      className="rounded-md border border-gray-200 bg-white p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-gray-900">
                            {inv.email}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                            <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-700">
                              {inv.role}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeClass}`}
                            >
                              {inv.status}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <a
                            href={inviteUrl}
                            className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >
                            Open
                          </a>
                          <button
                            type="button"
                            onClick={() => {
                              void copyToClipboard(inviteUrl);
                            }}
                            className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >
                            Copy link
                          </button>
                          {inv.status === "PENDING" ? (
                            <button
                              type="button"
                              onClick={() => revokeInvite(inv)}
                              disabled={invitesLoading}
                              className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
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

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900">Current access</div>
            <p className="mt-1 text-xs text-gray-600">People who can view or edit this estate.</p>
          </div>
        </div>
        <div className="mt-3 space-y-2">
          {collaborators.length === 0 ? (
            <div className="text-sm text-gray-600">No collaborators yet.</div>
          ) : null}
          {collaborators.map((c) => (
            <div
              key={c.userId}
              className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate font-mono text-sm text-gray-900">{c.userId}</div>
                <div className="text-xs text-gray-600">{c.role}</div>
              </div>
              {isOwner && (
                <div className="flex items-center gap-2">
                  <select
                    value={c.role}
                    disabled={loading}
                    onChange={(e) =>
                      updateRole(c.userId, e.target.value as Role)
                    }
                    className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 disabled:opacity-50"
                  >
                    <option value="VIEWER">Viewer</option>
                    <option value="EDITOR">Editor</option>
                  </select>
                  <button
                    onClick={() => removeCollaborator(c.userId)}
                    disabled={loading}
                    className="text-xs font-medium text-red-700 hover:underline disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}