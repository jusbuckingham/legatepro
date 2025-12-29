"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

import { getApiErrorMessage } from "@/lib/utils";

type ContactRole =
  | "EXECUTOR"
  | "ADMINISTRATOR"
  | "HEIR"
  | "ATTORNEY"
  | "CREDITOR"
  | "VENDOR"
  | "OTHER";

type ContactEditFormProps = {
  contactId: string;
  initial: {
    name: string;
    email?: string;
    phone?: string;
    role?: string;
    notes?: string;
  };
};

type ApiResponse = {
  ok: boolean;
  error?: string;
};

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

export function ContactEditForm({ contactId, initial }: ContactEditFormProps) {
  const router = useRouter();

  const [name, setName] = useState(initial.name ?? "");
  const [email, setEmail] = useState(initial.email ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [role, setRole] = useState<ContactRole>(
    normalizeRole(initial.role ?? "OTHER"),
  );
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (saving) return;

    if (!name.trim()) {
      setError("Name is required.");
      return;
    }

    setError(null);

    setSaving(true);

    try {
      const emailValue = email.trim();
      const phoneValue = phone.trim();
      const notesValue = notes.trim();

      const payload = {
        name: name.trim(),
        role,
        ...(emailValue ? { email: emailValue } : {}),
        ...(phoneValue ? { phone: phoneValue } : {}),
        ...(notesValue ? { notes: notesValue } : {}),
      };

      const res = await fetch(`/api/contacts/${encodeURIComponent(contactId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await res.json().catch(() => null)) as ApiResponse | null;

      if (!res.ok || !data || data.ok !== true) {
        const msg = data?.error || (await getApiErrorMessage(res)) || "Failed to update contact.";
        setError(msg);
        return;
      }

      router.push(`/app/contacts/${encodeURIComponent(contactId)}`);
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("Something went wrong while saving. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      aria-busy={saving}
      className="space-y-6 rounded-lg border border-slate-800 bg-slate-900/60 p-4"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-50">
            Edit contact
          </h1>
          <p className="text-xs text-slate-400">
            Update details for this person. Changes will reflect anywhere
            they are linked.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => router.push(`/app/contacts/${encodeURIComponent(contactId)}`)}
            disabled={saving}
            aria-disabled={saving}
            className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-60"
          >
            Cancel
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
          id="contact-name-error"
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
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Full name"
            required
            aria-invalid={!!error && !name.trim()}
            aria-describedby={error && !name.trim() ? "contact-name-error" : undefined}
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
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError(null);
            }}
            placeholder="name@example.com"
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
            onChange={(e) => {
              setPhone(e.target.value);
              if (error) setError(null);
            }}
            placeholder="(555) 555-5555"
            className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Role
          </label>
          <select
            value={role}
            onChange={(e) => {
              setRole(normalizeRole(e.target.value));
              if (error) setError(null);
            }}
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
          onChange={(e) => {
            setNotes(e.target.value);
            if (error) setError(null);
          }}
          rows={3}
          placeholder="Relationship to the estate, important details, etc."
          className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
      </div>
    </form>
  );
}