"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { getApiErrorMessage } from "@/lib/utils";

type ApiResponse = { ok: boolean; error?: string };

type ContactRole =
  | "EXECUTOR"
  | "ADMINISTRATOR"
  | "HEIR"
  | "ATTORNEY"
  | "CREDITOR"
  | "VENDOR"
  | "OTHER";

function normalizeRole(value: string): ContactRole {
  const upper = value.toUpperCase();
  if (
    upper === "EXECUTOR" ||
    upper === "ADMINISTRATOR" ||
    upper === "HEIR" ||
    upper === "ATTORNEY" ||
    upper === "CREDITOR" ||
    upper === "VENDOR" ||
    upper === "OTHER"
  ) {
    return upper;
  }
  return "OTHER";
}

export function ContactEditForm({ contactId }: { contactId: string }) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<ContactRole>("OTHER");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadContact() {
      try {
        const res = await fetch(`/api/contacts/${contactId}`);
        if (!res.ok) {
          const apiMessage = await Promise.resolve(getApiErrorMessage(res));
          setError(apiMessage || "Failed to load contact.");
          setLoading(false);
          return;
        }
        const data = await res.json();
        setName(data.name || "");
        setEmail(data.email || "");
        setPhone(data.phone || "");
        setRole(normalizeRole(data.role || "OTHER"));
        setNotes(data.notes || "");
      } catch (err) {
        console.error("[ContactEditForm] load error:", err);
        setError("Something went wrong while loading. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    loadContact();
  }, [contactId]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (saving) return;

    if (!name.trim()) {
      setError("Name is required.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        role,
        notes: notes.trim() ? notes.trim() : undefined,
      };

      const res = await fetch(`/api/contacts/${contactId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await res.json().catch(() => null)) as Partial<ApiResponse> | null;

      if (!res.ok || data?.ok !== true) {
        const apiMessage = await Promise.resolve(getApiErrorMessage(res));
        const msg = data?.error || apiMessage;
        setError(msg || "Failed to update contact.");
        return;
      }

      router.push("/app/contacts");
      router.refresh();
    } catch (err) {
      console.error("[ContactEditForm] submit error:", err);
      setError("Something went wrong while saving. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (saving) return;

    if (!confirm("Are you sure you want to delete this contact?")) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: "DELETE",
      });

      const data = (await res.json().catch(() => null)) as Partial<ApiResponse> | null;

      if (!res.ok || data?.ok !== true) {
        const apiMessage = await Promise.resolve(getApiErrorMessage(res));
        const msg = data?.error || apiMessage;
        setError(msg || "Failed to delete contact.");
        return;
      }

      router.push("/app/contacts");
      router.refresh();
    } catch (err) {
      console.error("[ContactEditForm] delete error:", err);
      setError("Something went wrong while deleting. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p>Loading contact...</p>;
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-busy={saving}
      className="space-y-6 rounded-lg border border-slate-800 bg-slate-900/60 p-4"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-50">Edit contact</h1>
          <p className="text-xs text-slate-400">
            Update information for this contact.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => router.push("/app/contacts")}
            disabled={saving}
            className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving}
            className="rounded-md border border-rose-600 px-3 py-1.5 text-xs font-medium text-rose-400 hover:bg-rose-800 disabled:opacity-60"
          >
            Delete
          </button>
          <button
            type="submit"
            disabled={saving}
            aria-disabled={saving}
            className="rounded-md bg-sky-500 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-md border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-100"
        >
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            disabled={saving}
            className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            disabled={saving}
            className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Phone
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(555) 555-5555"
            disabled={saving}
            className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Role
          </label>
          <select
            value={role}
            onChange={(e) => setRole(normalizeRole(e.target.value))}
            disabled={saving}
            className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option value="EXECUTOR">Executor</option>
            <option value="ADMINISTRATOR">Administrator</option>
            <option value="HEIR">Heir / Beneficiary</option>
            <option value="ATTORNEY">Attorney</option>
            <option value="CREDITOR">Creditor</option>
            <option value="VENDOR">Vendor</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">
          Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Relationship to the estate, important details, etc."
          disabled={saving}
          className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
      </div>
    </form>
  );
}