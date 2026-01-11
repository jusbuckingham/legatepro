"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getApiErrorMessage, safeJson } from "@/lib/utils";

interface EstateFormState {
  name: string;
  decedentName: string;
  court: string;
  caseNumber: string;
  city: string;
  state: string;
  dateOfDeath: string;
  notes: string;
}

const initialFormState: EstateFormState = {
  name: "",
  decedentName: "",
  court: "",
  caseNumber: "",
  city: "",
  state: "",
  dateOfDeath: "",
  notes: "",
};

export default function NewEstatePage() {
  const router = useRouter();
  const [form, setForm] = useState<EstateFormState>(initialFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof EstateFormState, string>>>({});

  const trimmed = useMemo(() => {
    return {
      name: form.name.trim(),
      decedentName: form.decedentName.trim(),
      court: form.court.trim(),
      caseNumber: form.caseNumber.trim(),
      city: form.city.trim(),
      state: form.state.trim().toUpperCase(),
      dateOfDeath: form.dateOfDeath,
      notes: form.notes.trim(),
    } satisfies EstateFormState;
  }, [form]);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target;
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }));

    if (name === "state") {
      setForm((prev) => ({ ...prev, state: value.toUpperCase().slice(0, 2) }));
      return;
    }

    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function validate(): boolean {
    const next: Partial<Record<keyof EstateFormState, string>> = {};

    if (!trimmed.name) next.name = "Estate name is required.";

    if (trimmed.state && trimmed.state.length !== 2) {
      next.state = "Use a 2-letter state code (e.g., CA, MI).";
    }

    // Basic sanity check: date input should be YYYY-MM-DD when present
    if (trimmed.dateOfDeath && !/^\d{4}-\d{2}-\d{2}$/.test(trimmed.dateOfDeath)) {
      next.dateOfDeath = "Please enter a valid date.";
    }

    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    if (!validate()) return;

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/estates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: trimmed.name,
          decedentName: trimmed.decedentName || undefined,
          court: trimmed.court || undefined,
          caseNumber: trimmed.caseNumber || undefined,
          city: trimmed.city || undefined,
          state: trimmed.state || undefined,
          dateOfDeath: trimmed.dateOfDeath || undefined,
          notes: trimmed.notes || undefined,
        }),
      });

      const data = ((await safeJson(res)) ?? null) as
        | {
            ok?: boolean;
            error?: string;
            message?: string;
            estate?: { _id?: string };
          }
        | null;

      const apiError =
        typeof data?.error === "string" && data.error.trim()
          ? data.error
          : typeof data?.message === "string" && data.message.trim()
          ? data.message
          : null;

      if (!res.ok || data?.ok === false) {
        const msg = apiError ?? (await getApiErrorMessage(res));
        throw new Error(msg || "Unable to create estate. Please try again.");
      }

      const estateId = data?.estate?._id;

      if (estateId) {
        router.push(`/app/estates/${estateId}?created=1`);
      } else {
        router.push("/app/estates?created=1");
      }
    } catch (err) {
      console.error("Error creating estate", err);
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong creating the estate."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
            New estate
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Capture the essentials now. You can refine details later inside the estate workspace.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/app/estates"
            className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900/30 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-900/60"
          >
            Cancel
          </Link>
        </div>
      </header>

      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-xs text-slate-300">
        <p className="font-medium text-slate-100">Getting started</p>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] text-slate-400">
          <li><span className="text-slate-200">Estate name</span> is required and should match court paperwork.</li>
          <li>All other fields are optional and can be filled in later.</li>
          <li>You’ll be able to add <span className="text-slate-200">tasks, documents, time, and invoices</span> after creation.</li>
        </ul>
      </div>

      <form
        onSubmit={handleSubmit}
        aria-busy={isSubmitting}
        className={`space-y-5 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-sm text-slate-100 shadow-sm shadow-black/40 ${
          isSubmitting ? "pointer-events-none opacity-[0.98]" : ""
        }`}
      >
        {error && (
          <p className="rounded-md border border-red-500/60 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {error}
          </p>
        )}

        <div className="space-y-1.5">
          <label htmlFor="name" className="text-xs font-medium text-slate-300">
            Estate name<span className="text-red-400">*</span>
          </label>
          <input
            id="name"
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="e.g., Estate of John Q. Doe"
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? "name-error" : undefined}
            className={`w-full rounded-md border bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none ring-0 placeholder:text-slate-500 focus:ring-1 ${
              fieldErrors.name
                ? "border-red-500/70 focus:border-red-500 focus:ring-red-500/40"
                : "border-slate-700 focus:border-emerald-500 focus:ring-emerald-500/60"
            }`}
          />
          <p className="text-[11px] text-slate-500">
            Use something that matches court paperwork so it’s easy to
            recognize.
          </p>
          {fieldErrors.name ? (
            <p id="name-error" className="text-[11px] text-red-200">
              {fieldErrors.name}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="decedentName"
            className="text-xs font-medium text-slate-300"
          >
            Decedent name
          </label>
          <input
            id="decedentName"
            name="decedentName"
            value={form.decedentName}
            onChange={handleChange}
            placeholder="Full legal name of the decedent"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none ring-0 placeholder:text-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/60"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label
              htmlFor="court"
              className="text-xs font-medium text-slate-300"
            >
              Court
            </label>
            <input
              id="court"
              name="court"
              value={form.court}
              onChange={handleChange}
              placeholder="e.g., LA County Superior Court – Probate"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none ring-0 placeholder:text-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/60"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="caseNumber"
              className="text-xs font-medium text-slate-300"
            >
              Case number
            </label>
            <input
              id="caseNumber"
              name="caseNumber"
              value={form.caseNumber}
              onChange={handleChange}
              placeholder="Court’s case number"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none ring-0 placeholder:text-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/60"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label
              htmlFor="city"
              className="text-xs font-medium text-slate-300"
            >
              City
            </label>
            <input
              id="city"
              name="city"
              value={form.city}
              onChange={handleChange}
              placeholder="Primary city for the estate"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none ring-0 placeholder:text-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/60"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="state"
              className="text-xs font-medium text-slate-300"
            >
              State
            </label>
            <input
              id="state"
              name="state"
              value={form.state}
              onChange={handleChange}
              placeholder="e.g., CA"
              maxLength={2}
              inputMode="text"
              autoCapitalize="characters"
              aria-invalid={Boolean(fieldErrors.state)}
              aria-describedby={fieldErrors.state ? "state-error" : undefined}
              className={`w-full rounded-md border bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none ring-0 placeholder:text-slate-500 focus:ring-1 ${
                fieldErrors.state
                  ? "border-red-500/70 focus:border-red-500 focus:ring-red-500/40"
                  : "border-slate-700 focus:border-emerald-500 focus:ring-emerald-500/60"
              }`}
            />
            {fieldErrors.state ? (
              <p id="state-error" className="text-[11px] text-red-200">
                {fieldErrors.state}
              </p>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label
              htmlFor="dateOfDeath"
              className="text-xs font-medium text-slate-300"
            >
              Date of death
            </label>
            <input
              id="dateOfDeath"
              name="dateOfDeath"
              type="date"
              value={form.dateOfDeath}
              onChange={handleChange}
              aria-invalid={Boolean(fieldErrors.dateOfDeath)}
              aria-describedby={fieldErrors.dateOfDeath ? "dod-error" : "dod-help"}
              className={`w-full rounded-md border bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none ring-0 placeholder:text-slate-500 focus:ring-1 ${
                fieldErrors.dateOfDeath
                  ? "border-red-500/70 focus:border-red-500 focus:ring-red-500/40"
                  : "border-slate-700 focus:border-emerald-500 focus:ring-emerald-500/60"
              }`}
            />
            <p id="dod-help" className="text-[11px] text-slate-500">
              Optional — add it now or later.
            </p>
            {fieldErrors.dateOfDeath ? (
              <p id="dod-error" className="text-[11px] text-red-200">
                {fieldErrors.dateOfDeath}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="notes"
              className="text-xs font-medium text-slate-300"
            >
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              value={form.notes}
              onChange={handleChange}
              placeholder="Additional information or notes"
              rows={3}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none ring-0 placeholder:text-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/60"
            />
          </div>
        </div>

        <div className="space-y-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex w-full items-center justify-center rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-emerald-500"
          >
            {isSubmitting ? "Creating…" : "Create estate"}
          </button>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
              href="/app/estates"
              className="text-xs font-medium text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
            >
              Back to estates
            </Link>
            <p className="text-[11px] text-slate-500">
              You can add documents, notes, tasks, invoices, and contacts after creation.
            </p>
          </div>
        </div>
      </form>
    </div>
  );
}