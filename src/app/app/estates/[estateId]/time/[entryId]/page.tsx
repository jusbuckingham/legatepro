"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

interface TimeEntry {
  id: string;
  estateId: string;
  date: string;
  hours: number;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export default function EditTimeEntryPage() {
  const router = useRouter();
  const { estateId, entryId } = useParams<{
    estateId: string;
    entryId: string;
  }>();

  const [entry, setEntry] = useState<TimeEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/time?estateId=${estateId}&id=${entryId}`);
        if (!res.ok) throw new Error("Failed to load entry");
        const data = await res.json();
        setEntry({
          id: data._id,
          estateId: data.estateId,
          date: data.date,
          hours: data.hours,
          notes: data.notes,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        });
      } catch {
        setError("Unable to load entry.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [estateId, entryId]);

  async function handleSave() {
    if (!entry) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/time/${entryId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: entry.date,
          hours: entry.hours,
          notes: entry.notes,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      router.push(`/app/estates/${estateId}/time`);
    } catch {
      setError("Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      const res = await fetch(`/api/time/${entryId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      router.push(`/app/estates/${estateId}/time`);
    } catch {
      setError("Failed to delete entry.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-6">Loading entry…</div>;
  }

  if (error) {
    return <div className="p-6 text-red-600">{error}</div>;
  }

  if (!entry) {
    return <div className="p-6 text-red-600">Entry not found.</div>;
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Edit Time Entry</h1>

      <div className="space-y-4">
        <div>
          <label className="block font-medium">Date</label>
          <input
            type="date"
            value={entry.date}
            onChange={(e) =>
              setEntry({ ...entry, date: e.target.value })
            }
            className="mt-1 w-full rounded border p-2"
          />
        </div>

        <div>
          <label className="block font-medium">Hours</label>
          <input
            type="number"
            step="0.1"
            min="0"
            value={entry.hours}
            onChange={(e) =>
              setEntry({ ...entry, hours: parseFloat(e.target.value) })
            }
            className="mt-1 w-full rounded border p-2"
          />
        </div>

        <div>
          <label className="block font-medium">Notes</label>
          <textarea
            value={entry.notes || ""}
            onChange={(e) =>
              setEntry({ ...entry, notes: e.target.value })
            }
            className="mt-1 w-full rounded border p-2"
            rows={5}
          />
        </div>
      </div>

      {error && (
        <p className="text-red-600">{error}</p>
      )}

      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>

        <button
          onClick={handleDelete}
          disabled={saving}
          className="px-4 py-2 rounded bg-red-600 text-white disabled:opacity-50"
        >
          Delete Entry
        </button>

        <button
          onClick={() => router.back()}
          className="px-4 py-2 rounded border"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}