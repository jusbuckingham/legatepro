"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Role = "OWNER" | "EDITOR" | "VIEWER";

type Collaborator = {
  userId: string;
  role: Role;
};

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

  async function addCollaborator() {
    if (!userId) return;

    setLoading(true);
    setError(null);

    const res = await fetch(`/api/estates/${estateId}/collaborators`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to add collaborator");
      return;
    }

    setUserId("");
    setRole("VIEWER");
    router.refresh();
  }

  async function updateRole(targetUserId: string, newRole: Role) {
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/estates/${estateId}/collaborators`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: targetUserId, role: newRole }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to update role");
      return;
    }

    router.refresh();
  }

  async function removeCollaborator(targetUserId: string) {
    if (!confirm("Remove this collaborator?")) return;

    setLoading(true);
    setError(null);

    const res = await fetch(`/api/estates/${estateId}/collaborators`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: targetUserId }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to remove collaborator");
      return;
    }

    router.refresh();
  }

  return (
    <div className="space-y-4">
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
              disabled={loading}
              className="rounded-md bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Add
            </button>
          </div>

          {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
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
                  onChange={(e) =>
                    updateRole(c.userId, e.target.value as Role)
                  }
                  className="rounded-md border border-gray-300 px-2 py-1 text-xs"
                >
                  <option value="VIEWER">Viewer</option>
                  <option value="EDITOR">Editor</option>
                </select>

                <button
                  onClick={() => removeCollaborator(c.userId)}
                  className="text-xs text-red-600 hover:underline"
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