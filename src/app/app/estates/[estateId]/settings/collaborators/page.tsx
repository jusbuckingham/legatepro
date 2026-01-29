"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/layout/PageHeader";

type EstateRole = "OWNER" | "EDITOR" | "VIEWER";

type EstateCollaborator = {
  userId: string;
  role: Exclude<EstateRole, "OWNER">;
  addedAt?: string | Date;
};

type CollaboratorsResponse = {
  ok: boolean;
  error?: string;
  estateId?: string;
  ownerId?: string;
  collaborators?: EstateCollaborator[];
};

type SessionResponse = {
  user?: {
    id?: string;
  };
};

const ROLE_LABELS: Record<Exclude<EstateRole, "OWNER">, string> = {
  VIEWER: "Viewer",
  EDITOR: "Editor",
};

function fmtDate(value?: string | Date): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function CollaboratorsSettingsPage({
  params,
}: {
  params: { estateId: string };
}) {
  const estateId = params.estateId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [ownerId, setOwnerId] = useState<string>("");
  const [collaborators, setCollaborators] = useState<EstateCollaborator[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>("");

  const [newUserId, setNewUserId] = useState("");
  const [newRole, setNewRole] = useState<Exclude<EstateRole, "OWNER">>("VIEWER");

  const baseUrl = useMemo(
    () => `/api/estates/${encodeURIComponent(estateId)}/collaborators`,
    [estateId]
  );

  const loadSessionUser = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", {
        method: "GET",
        headers: { accept: "application/json" },
        cache: "no-store",
      });

      if (!res.ok) {
        setCurrentUserId("");
        return;
      }

      const data = (await res.json()) as SessionResponse;
      const id = typeof data.user?.id === "string" ? data.user.id : "";
      setCurrentUserId(id);
    } catch {
      setCurrentUserId("");
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    // setNotice(null); // Do not clear notice on every refresh

    try {
      const res = await fetch(baseUrl, {
        method: "GET",
        headers: { "accept": "application/json" },
        cache: "no-store",
      });

      const data = (await res.json()) as CollaboratorsResponse;

      if (!res.ok || !data.ok) {
        setError(data.error ?? "Couldn’t load collaborators. Please try again.");
        setOwnerId("");
        setCollaborators([]);
        return;
      }

      setOwnerId(data.ownerId ?? "");
      setCollaborators(Array.isArray(data.collaborators) ? data.collaborators : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t load collaborators. Please try again.");
      setOwnerId("");
      setCollaborators([]);
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  useEffect(() => {
    void loadSessionUser();
    void refresh();
  }, [loadSessionUser, refresh]);

  const isOwner = useMemo(() => {
    if (!currentUserId || !ownerId) return false;
    return currentUserId === ownerId;
  }, [currentUserId, ownerId]);

  async function addCollaborator() {
    if (!isOwner) {
      setError("Only the estate owner can add collaborators.");
      return;
    }

    const trimmed = newUserId.trim();
    if (!trimmed) {
      setError("Enter a userId to add.");
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch(baseUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept": "application/json",
        },
        body: JSON.stringify({ userId: trimmed, role: newRole }),
      });

      const data = (await res.json()) as { ok?: boolean; error?: string };

      if (!res.ok || data.ok === false) {
        setError(data.error ?? `Failed to add collaborator (${res.status})`);
        return;
      }

      setNotice("Collaborator added.");
      setNewUserId("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add collaborator");
    } finally {
      setSaving(false);
    }
  }

  async function changeRole(userId: string, role: Exclude<EstateRole, "OWNER">) {
    if (!isOwner) {
      setError("Only the estate owner can change roles.");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch(`${baseUrl}/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "accept": "application/json",
        },
        body: JSON.stringify({ role }),
      });

      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || data.ok === false) {
        setError(data.error ?? `Failed to update role (${res.status})`);
        return;
      }

      setNotice("Role updated.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update role");
    } finally {
      setSaving(false);
    }
  }

  async function removeCollaborator(userId: string) {
    if (!isOwner) {
      setError("Only the estate owner can remove collaborators.");
      return;
    }
    const confirmed = window.confirm("Remove this collaborator?");
    if (!confirmed) return;

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch(`${baseUrl}/${encodeURIComponent(userId)}`, {
        method: "DELETE",
        headers: { "accept": "application/json" },
      });

      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || data.ok === false) {
        setError(data.error ?? `Failed to remove collaborator (${res.status})`);
        return;
      }

      setNotice("Collaborator removed.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove collaborator");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow={
          <nav className="text-xs text-slate-500">
            <Link
              href="/app/estates"
              className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
            >
              Estates
            </Link>
            <span className="mx-1 text-slate-600">/</span>
            <Link
              href={`/app/estates/${estateId}`}
              className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
            >
              Estate
            </Link>
            <span className="mx-1 text-slate-600">/</span>
            <Link
              href={`/app/estates/${estateId}/settings`}
              className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
            >
              Settings
            </Link>
            <span className="mx-1 text-slate-600">/</span>
            <span className="text-rose-300">Collaborators</span>
          </nav>
        }
        title="Collaborators"
        description="Manage who can access this estate. Only the owner can add, remove, or change roles (others can view)."
        actions={
          <div className="flex flex-col items-end gap-2">
            <span className="inline-flex items-center rounded-full border border-slate-800 bg-slate-950 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-200">
              <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Access control
            </span>
            <Link
              href={`/app/estates/${estateId}`}
              className="text-[11px] text-slate-400 hover:text-slate-200"
            >
              Back to overview
            </Link>
          </div>
        }
      />

      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium">Something went wrong</p>
              <p className="text-xs text-rose-200">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading || saving}
              className="mt-2 inline-flex items-center justify-center rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-100 hover:bg-rose-500/25 disabled:opacity-50 md:mt-0"
            >
              Retry
            </button>
          </div>
        </div>
      ) : null}

      {notice ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium">Updated</p>
              <p className="text-xs text-emerald-200">{notice}</p>
            </div>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="mt-2 inline-flex items-center justify-center rounded-md border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-500/25 md:mt-0"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {!loading && ownerId && !isOwner ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium">Read-only access</p>
              <p className="text-xs text-amber-200">
                Only the estate owner can add, remove, or change collaborator roles.
              </p>
            </div>
            <Link
              href={`/app/estates/${estateId}`}
              className="mt-2 inline-flex items-center justify-center rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-500/25 md:mt-0"
            >
              Back to estate
            </Link>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Estate owner</p>
          <p className="mt-1 text-sm font-medium text-slate-50">
            {loading ? "Loading…" : ownerId ? ownerId : "(unknown)"}
          </p>
          <p className="mt-1 text-xs text-slate-500">Owner has full control over access.</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 md:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Add collaborator</p>
              <p className="mt-1 text-xs text-slate-500">For now this expects a userId. Invites can be added later.</p>
            </div>
            {saving ? (
              <span className="text-[11px] text-slate-500">Saving…</span>
            ) : (
              <span className="text-[11px] text-slate-500">&nbsp;</span>
            )}
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_180px_auto]">
            <input
              value={newUserId}
              onChange={(e) => setNewUserId(e.target.value)}
              placeholder="User ID"
              className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-50 placeholder:text-slate-500 disabled:opacity-50"
              disabled={!isOwner || saving || loading}
            />

            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as Exclude<EstateRole, "OWNER">)}
              className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-50 disabled:opacity-50"
              disabled={!isOwner || saving || loading}
            >
              <option value="VIEWER">Viewer</option>
              <option value="EDITOR">Editor</option>
            </select>

            <button
              type="button"
              onClick={() => void addCollaborator()}
              disabled={!isOwner || saving || loading}
              className="h-10 rounded-md bg-rose-500 px-4 text-sm font-semibold text-slate-950 hover:bg-rose-400 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Current collaborators
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {loading
                ? "Loading collaborators…"
                : collaborators.length === 0
                ? "No collaborators yet."
                : `Showing ${collaborators.length} collaborator${collaborators.length === 1 ? "" : "s"}.`}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading || saving}
            className="inline-flex items-center justify-center rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-900/40 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-400">
            Loading…
          </div>
        ) : collaborators.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-6 text-sm text-slate-300">
            <p className="font-medium text-slate-100">No collaborators yet</p>
            <p className="mt-1 text-xs text-slate-500">
              Add an Editor or Viewer to let others help with documents, rent, utilities, and tasks.
            </p>
          </div>
        ) : (
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-800">
            <div className="grid grid-cols-[1fr_180px_140px_auto] gap-2 bg-slate-900/70 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <div>User</div>
              <div>Role</div>
              <div>Added</div>
              <div className="text-right">{isOwner ? "Actions" : "Actions (owner only)"}</div>
            </div>

            {collaborators.map((c) => (
              <div
                key={c.userId}
                className="grid grid-cols-[1fr_180px_140px_auto] items-center gap-2 border-t border-slate-800 bg-slate-950/40 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm text-slate-100">{c.userId}</div>
                </div>

                <div>
                  <select
                    value={c.role}
                    onChange={(e) => void changeRole(c.userId, e.target.value as Exclude<EstateRole, "OWNER">)}
                    disabled={!isOwner || saving}
                    className="h-9 w-full rounded-md border border-slate-700 bg-slate-950 px-2 text-sm text-slate-50 disabled:opacity-50"
                  >
                    <option value="VIEWER">Viewer</option>
                    <option value="EDITOR">Editor</option>
                  </select>
                  <p className="mt-1 text-[11px] text-slate-500">{ROLE_LABELS[c.role]}</p>
                </div>

                <div className="text-xs text-slate-300">{fmtDate(c.addedAt)}</div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => void removeCollaborator(c.userId)}
                    disabled={!isOwner || saving}
                    className="h-9 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 text-sm font-medium text-rose-100 hover:bg-rose-500/20 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="text-xs text-slate-500">
        <p className="font-medium text-slate-300">Notes</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>Viewers can read data but can’t add, edit, or delete.</li>
          <li>Editors can add and update items but can’t change estate ownership.</li>
          <li>For safety, confirm collaborator IDs before granting Editor access.</li>
        </ul>
      </div>
    </div>
  );
}