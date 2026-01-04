"use client";

import React, { useMemo, useState } from "react";
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

function isValidEmail(value: string): boolean {
  // keep it lightweight — browser will also validate for type="email"
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPhone(value: string): boolean {
  // Accepts phone numbers with at least 7 digits after stripping non-digits
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7;
}

export function ContactEditForm({ contactId, initial }: ContactEditFormProps) {
  const router = useRouter();

  const [name, setName] = useState(initial.name ?? "");
  const [email, setEmail] = useState(initial.email ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [role, setRole] = useState<ContactRole>(
    normalizeRole(initial.role ?? "OTHER")
  );
  const [notes, setNotes] = useState(initial.notes ?? "");

  const [saving, setSaving] = useState(false);

  // Separate: field validation vs API/network errors
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const roleInitial = useMemo(() => normalizeRole(initial.role ?? "OTHER"), [initial.role]);
  const isDirty = useMemo(() => {
    return (
      name !== (initial.name ?? "") ||
      email !== (initial.email ?? "") ||
      phone !== (initial.phone ?? "") ||
      role !== roleInitial ||
      notes !== (initial.notes ?? "")
    );
  }, [name, email, phone, role, notes, initial, roleInitial]);

  const resetFeedback = (): void => {
    if (fieldError) setFieldError(null);
    if (saveError) setSaveError(null);
  };

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    if (saving) return;

    resetFeedback();

    const nameValue = name.trim();
    if (!nameValue) {
      setFieldError("Name is required.");
      return;
    }

    const emailValue = email.trim();
    if (emailValue && !isValidEmail(emailValue)) {
      setFieldError("Please enter a valid email address.");
      return;
    }

    const phoneValue = phone.trim();
    if (phoneValue && !isValidPhone(phoneValue)) {
      setFieldError("Please enter a valid phone number.");
      return;
    }
    const notesValue = notes.trim();

    const payload = {
      name: nameValue,
      role,
      ...(emailValue ? { email: emailValue } : {}),
      ...(phoneValue ? { phone: phoneValue } : {}),
      ...(notesValue ? { notes: notesValue } : {}),
    };

    setSaving(true);

    try {
      const res = await fetch(`/api/contacts/${encodeURIComponent(contactId)}`, {
        method: "PATCH",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      // Clone before consuming the body so we can still derive a readable error message.
      const resForError = res.clone();
      const data = (await res.json().catch(() => null)) as ApiResponse | null;

      if (!res.ok || !data || data.ok !== true) {
        const apiMessage = await Promise.resolve(getApiErrorMessage(resForError));
        const msg = data?.error || apiMessage || "Failed to update contact.";
        setSaveError(msg);
        return;
      }

      // Navigate back to the contact detail page
      router.push(`/app/contacts/${encodeURIComponent(contactId)}`);
      router.refresh();
    } catch {
      setSaveError("Something went wrong while saving. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Used for aria-invalid/aria-describedby on fields
  const emailHasError = fieldError === "Please enter a valid email address.";
  const phoneHasError = fieldError === "Please enter a valid phone number.";
  const nameHasError = fieldError === "Name is required.";

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
            Update details for this person. Changes will reflect anywhere they
            are linked.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() =>
              router.push(`/app/contacts/${encodeURIComponent(contactId)}`)
            }
            disabled={saving}
            aria-disabled={saving}
            className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-60"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={saving || !isDirty}
            aria-disabled={saving || !isDirty}
            className="rounded-md bg-sky-500 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {(fieldError || saveError) && (
        <div aria-live="polite" className="space-y-2">
          {fieldError && (
            <div
              id="contact-form-field-error"
              role="alert"
              className="rounded-md border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-100"
            >
              {fieldError}
            </div>
          )}
          {saveError && (
            <div
              id="contact-form-save-error"
              role="alert"
              className="rounded-md border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-100"
            >
              {saveError}
            </div>
          )}
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
            disabled={saving}
            onChange={(e) => {
              setName(e.target.value);
              resetFeedback();
            }}
            placeholder="Full name"
            required
            autoComplete="name"
            aria-invalid={nameHasError}
            aria-describedby={nameHasError ? "contact-form-field-error" : undefined}
            className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-60"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Email
          </label>
          <input
            type="email"
            value={email}
            disabled={saving}
            onChange={(e) => {
              setEmail(e.target.value);
              resetFeedback();
            }}
            placeholder="name@example.com"
            autoComplete="email"
            aria-invalid={emailHasError}
            aria-describedby={emailHasError ? "contact-form-field-error" : undefined}
            className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-60"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Phone
          </label>
          <input
            type="tel"
            value={phone}
            disabled={saving}
            onChange={(e) => {
              setPhone(e.target.value);
              resetFeedback();
            }}
            placeholder="(555) 555-5555"
            autoComplete="tel"
            inputMode="tel"
            aria-invalid={phoneHasError}
            aria-describedby={phoneHasError ? "contact-form-field-error" : undefined}
            className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-60"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Role
          </label>
          <select
            value={role}
            disabled={saving}
            onChange={(e) => {
              setRole(normalizeRole(e.target.value));
              resetFeedback();
            }}
            className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-60"
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
          disabled={saving}
          onChange={(e) => {
            setNotes(e.target.value);
            resetFeedback();
          }}
          rows={3}
          placeholder="Relationship to the estate, important details, etc."
          className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-60"
        />
      </div>
    </form>
  );
}