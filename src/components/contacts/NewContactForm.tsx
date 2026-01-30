"use client";

import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";

import { getApiErrorMessage } from "@/lib/utils";

type ApiResponse = { ok: boolean; error?: string };

type FieldErrors = {
  name?: string;
  email?: string;
  phone?: string;
};

const PHONE_DIGITS_REGEX = /\d/g;

function isValidPhone(input: string): boolean {
  const digits = (input.match(PHONE_DIGITS_REGEX) ?? []).join("");
  return digits.length >= 7;
}

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

  const nameRef = useRef<HTMLInputElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const phoneRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<ContactRole>("OTHER");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const canSubmit = !saving && name.trim().length > 0;

  const resetFeedback = (): void => {
    setError(null);
    setFieldErrors({});
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (saving) return;

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();
    const trimmedNotes = notes.trim();

    const nextErrors: FieldErrors = {};

    if (!trimmedName) nextErrors.name = "Name is required.";

    if (trimmedEmail && !EMAIL_REGEX.test(trimmedEmail)) {
      nextErrors.email = "Please enter a valid email address.";
    }

    if (trimmedPhone && !isValidPhone(trimmedPhone)) {
      nextErrors.phone = "Please enter a valid phone number.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setError("Fix the highlighted fields.");

      if (nextErrors.name) {
        nameRef.current?.focus();
      } else if (nextErrors.email) {
        emailRef.current?.focus();
      } else if (nextErrors.phone) {
        phoneRef.current?.focus();
      }

      return;
    }

    setFieldErrors({});
    setSaving(true);
    setError(null);

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
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await res.json().catch(() => null)) as Partial<ApiResponse> | null;

      if (!res.ok || data?.ok !== true) {
        const apiMessage = await getApiErrorMessage(res);
        const msg = (typeof data?.error === "string" ? data.error : "") || apiMessage;
        setError(msg || "Failed to create contact.");
        return;
      }

      router.push("/app/contacts");
      router.refresh();
    } catch (err) {
      console.error("[NewContactForm] submit error:", err);
      setFieldErrors({});
      setError("Something went wrong while saving. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} aria-busy={saving} className="space-y-6">
      <div className="flex items-center justify-end gap-2">
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
          disabled={!canSubmit}
          aria-disabled={!canSubmit}
          className="rounded-md bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving…" : "Create contact"}
        </button>
      </div>

      {error && (
        <div
          role="alert"
          aria-live="assertive"
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
            ref={nameRef}
            required
            aria-invalid={!!fieldErrors.name}
            aria-describedby={fieldErrors.name ? "contact-name-error" : undefined}
            onChange={(e) => {
              resetFeedback();
              setName(e.target.value);
            }}
            placeholder="Full name"
            disabled={saving}
            autoComplete="name"
            autoFocus
            maxLength={160}
            className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          {fieldErrors.name && (
            <p id="contact-name-error" className="mt-1 text-[11px] text-rose-300">
              {fieldErrors.name}
            </p>
          )}
        </div>

        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Email
          </label>
          <input
            type="email"
            value={email}
            ref={emailRef}
            onBlur={() => {
              const trimmed = email.trim();
              if (trimmed !== email) setEmail(trimmed);
            }}
            aria-invalid={!!fieldErrors.email}
            aria-describedby={fieldErrors.email ? "contact-email-error" : undefined}
            onChange={(e) => {
              resetFeedback();
              setEmail(e.target.value);
            }}
            placeholder="name@example.com"
            disabled={saving}
            autoComplete="email"
            inputMode="email"
            maxLength={254}
            spellCheck={false}
            className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          {fieldErrors.email && (
            <p id="contact-email-error" className="mt-1 text-[11px] text-rose-300">
              {fieldErrors.email}
            </p>
          )}
        </div>

        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Phone
          </label>
          <input
            type="tel"
            value={phone}
            ref={phoneRef}
            onBlur={() => {
              const trimmed = phone.trim();
              if (trimmed !== phone) setPhone(trimmed);
            }}
            aria-invalid={!!fieldErrors.phone}
            aria-describedby={fieldErrors.phone ? "contact-phone-error" : undefined}
            onChange={(e) => {
              resetFeedback();
              setPhone(e.target.value);
            }}
            placeholder="(555) 555-5555"
            disabled={saving}
            autoComplete="tel"
            inputMode="tel"
            maxLength={25}
            className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          {fieldErrors.phone && (
            <p id="contact-phone-error" className="mt-1 text-[11px] text-rose-300">
              {fieldErrors.phone}
            </p>
          )}
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
          maxLength={4000}
          className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
      </div>
    </form>
  );
}
