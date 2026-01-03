"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";

import { getApiErrorMessage } from "@/lib/utils";

type ApiResponse = { ok: boolean; error?: string };

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export function NewContactForm() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<ContactRole>("OTHER");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [success, setSuccess] = useState<string | null>(null);

  const resetFeedback = (): void => {
    if (error) setError(null);
    if (success) setSuccess(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (saving) return;

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();
    const trimmedNotes = notes.trim();

    if (trimmedEmail && !EMAIL_REGEX.test(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    if (trimmedPhone && trimmedPhone.length < 7) {
      setError("Please enter a valid phone number.");
      return;
    }

    if (!trimmedName) {
      setError("Name is required.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        name: trimmedName,
        email: trimmedEmail || undefined,
        phone: trimmedPhone || undefined,
        role,
        notes: trimmedNotes || undefined,
      };

      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await res.json().catch(() => null)) as Partial<ApiResponse> | null;

      if (!res.ok || data?.ok !== true) {
        const apiMessage = await Promise.resolve(getApiErrorMessage(res));
        const msg = data?.error || apiMessage;
        setError(msg || "Failed to create contact.");
        return;
      }

      setSuccess("Contact created.");
      router.push("/app/contacts");
      router.refresh();
    } catch (err) {
      console.error(err);
      setSuccess(null);
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
          <h1 className="text-lg font-semibold text-slate-50">New contact</h1>
          <p className="text-xs text-slate-400">Add a contact to your workspace.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              resetFeedback();
              router.push("/app/contacts");
            }}
            disabled={saving}
            className="rounded-md border border-slate-700 bg-slate-950/40 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            aria-disabled={saving}
            className="rounded-md bg-sky-500 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving…" : "Create"}
          </button>
        </div>
      </div>

      {(error || success) && (
        <div
          role={error ? "alert" : "status"}
          aria-live={error ? "assertive" : "polite"}
          className={`rounded-md border p-3 text-xs ${
            error
              ? "border-rose-500/30 bg-rose-950/40 text-rose-100"
              : "border-emerald-500/30 bg-emerald-950/40 text-emerald-100"
          }`}
        >
          {error || success}
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
            required
            aria-invalid={!!error && name.trim().length === 0}
            onChange={(e) => {
              resetFeedback();
              setName(e.target.value);
            }}
            placeholder="Full name"
            disabled={saving}
            autoComplete="name"
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
            aria-invalid={!!error && email.trim().length > 0 && !EMAIL_REGEX.test(email.trim())}
            onChange={(e) => {
              resetFeedback();
              setEmail(e.target.value);
            }}
            placeholder="name@example.com"
            disabled={saving}
            autoComplete="email"
            inputMode="email"
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
            aria-invalid={!!error && phone.trim().length > 0 && phone.trim().length < 7}
            onChange={(e) => {
              resetFeedback();
              setPhone(e.target.value);
            }}
            placeholder="(555) 555-5555"
            disabled={saving}
            autoComplete="tel"
            inputMode="tel"
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
              resetFeedback();
              setRole(normalizeRole(e.target.value));
            }}
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
          onChange={(e) => {
            resetFeedback();
            setNotes(e.target.value);
          }}
          rows={3}
          placeholder="Relationship to the estate, important details, etc."
          disabled={saving}
          className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
      </div>
    </form>
  );
}

export default NewContactForm;