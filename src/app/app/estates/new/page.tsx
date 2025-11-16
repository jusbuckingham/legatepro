"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) {
      setError("Estate name is required.");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/estates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: form.name.trim(),
          decedentName: form.decedentName.trim() || undefined,
          court: form.court.trim() || undefined,
          caseNumber: form.caseNumber.trim() || undefined,
          city: form.city.trim() || undefined,
          state: form.state.trim() || undefined,
          dateOfDeath: form.dateOfDeath || undefined,
          notes: form.notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const message =
          (data && (data.error || data.message)) ||
          "Unable to create estate. Please try again.";
        throw new Error(message);
      }

      const data = (await res.json().catch(() => ({} as unknown))) as { estate?: { _id?: string } };
      const estateId = data?.estate?._id as string | undefined;

      if (estateId) {
        router.push(`/app/estates/${estateId}`);
      } else {
        router.push("/app/estates");
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
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
          New estate
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Start by capturing the core case information. You can always refine
          details later in the estate workspace.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-sm text-slate-100 shadow-sm shadow-black/40"
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
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none ring-0 placeholder:text-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/60"
          />
          <p className="text-[11px] text-slate-500">
            Use something that matches court paperwork so it’s easy to
            recognize.
          </p>
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
              placeholder="State or region"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none ring-0 placeholder:text-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/60"
            />
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
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none ring-0 placeholder:text-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/60"
            />
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

        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex w-full items-center justify-center rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-50 disabled:hover:bg-emerald-500"
        >
          {isSubmitting ? "Creating..." : "Create estate"}
        </button>
      </form>
    </div>
  );
}