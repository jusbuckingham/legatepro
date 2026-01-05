

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

export default function CollaboratorsSettingsPage({
  params,
}: {
  params: { estateId: string };
}) {
  const estateId = params.estateId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [ownerId, setOwnerId] = useState<string>("");
  const [collaborators, setCollaborators] = useState<EstateCollaborator[]>([]);

  const [newUserId, setNewUserId] = useState("");
  const [newRole, setNewRole] = useState<Exclude<EstateRole, "OWNER">>("VIEWER");

  const baseUrl = useMemo(
    () => `/api/estates/${encodeURIComponent(estateId)}/collaborators`,
    [estateId]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(baseUrl, {
        method: "GET",
        headers: { "accept": "application/json" },
        cache: "no-store",
      });

      const data = (await res.json()) as CollaboratorsResponse;

      if (!res.ok || !data.ok) {
        setError(data.error ?? `Failed to load collaborators (${res.status})`);
        setOwnerId("");
        setCollaborators([]);
        return;
      }

      setOwnerId(data.ownerId ?? "");
      setCollaborators(Array.isArray(data.collaborators) ? data.collaborators : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load collaborators");
      setOwnerId("");
      setCollaborators([]);
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function addCollaborator() {
    const trimmed = newUserId.trim();
    if (!trimmed) {
      setError("Enter a userId to add.");
      return;
    }

    setSaving(true);
    setError(null);

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

      setNewUserId("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add collaborator");
    } finally {
      setSaving(false);
    }
  }

  async function changeRole(userId: string, role: Exclude<EstateRole, "OWNER">) {
    setSaving(true);
    setError(null);

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

      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update role");
    } finally {
      setSaving(false);
    }
  }

  async function removeCollaborator(userId: string) {
    const confirmed = window.confirm("Remove this collaborator?");
    if (!confirmed) return;

    setSaving(true);
    setError(null);

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

      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove collaborator");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Collaborators</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Manage who can access this estate. Only the owner can add, remove, or
          change roles.
        </p>
      </div>

      {error ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6">
        <section className="rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="text-base font-medium">Estate owner</h2>
          <div className="mt-2 text-sm text-neutral-700">
            {loading ? "Loading…" : ownerId ? ownerId : "(unknown)"}
          </div>
        </section>

        <section className="rounded-lg border border-neutral-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-medium">Add collaborator</h2>
            {saving ? (
              <span className="text-xs text-neutral-500">Saving…</span>
            ) : null}
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_160px_auto]">
            <input
              value={newUserId}
              onChange={(e) => setNewUserId(e.target.value)}
              placeholder="User ID"
              className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
            />

            <select
              value={newRole}
              onChange={(e) =>
                setNewRole(e.target.value as Exclude<EstateRole, "OWNER">)
              }
              className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
            >
              <option value="VIEWER">Viewer</option>
              <option value="EDITOR">Editor</option>
            </select>

            <button
              type="button"
              onClick={() => void addCollaborator()}
              disabled={saving || loading}
              className="h-10 rounded-md bg-black px-4 text-sm font-medium text-white disabled:opacity-50"
            >
              Add
            </button>
          </div>

          <p className="mt-2 text-xs text-neutral-500">
            Tip: for now this expects a userId. Invites can be added later.
          </p>
        </section>

        <section className="rounded-lg border border-neutral-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-medium">Current collaborators</h2>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading || saving}
              className="text-sm text-neutral-700 underline disabled:opacity-50"
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="mt-3 text-sm text-neutral-500">Loading…</div>
          ) : collaborators.length === 0 ? (
            <div className="mt-3 text-sm text-neutral-500">No collaborators yet.</div>
          ) : (
            <div className="mt-3 overflow-hidden rounded-md border border-neutral-200">
              <div className="grid grid-cols-[1fr_140px_auto] gap-2 bg-neutral-50 px-3 py-2 text-xs font-medium text-neutral-600">
                <div>User</div>
                <div>Role</div>
                <div className="text-right">Actions</div>
              </div>

              {collaborators.map((c) => (
                <div
                  key={c.userId}
                  className="grid grid-cols-[1fr_140px_auto] items-center gap-2 border-t border-neutral-200 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-neutral-900">{c.userId}</div>
                  </div>

                  <div>
                    <select
                      value={c.role}
                      onChange={(e) =>
                        void changeRole(
                          c.userId,
                          e.target.value as Exclude<EstateRole, "OWNER">
                        )
                      }
                      disabled={saving}
                      className="h-9 w-full rounded-md border border-neutral-300 px-2 text-sm disabled:opacity-50"
                    >
                      <option value="VIEWER">Viewer</option>
                      <option value="EDITOR">Editor</option>
                    </select>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => void removeCollaborator(c.userId)}
                      disabled={saving}
                      className="h-9 rounded-md border border-neutral-300 px-3 text-sm text-neutral-900 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}