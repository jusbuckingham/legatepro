"use client";

import { FormEvent, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { getApiErrorMessage } from "@/lib/utils";

type EstateFormData = {
  name?: string;
  caseNumber?: string;
  county?: string;
  decedentName?: string;
  status?: string;
  decedentDateOfDeath?: string;
  notes?: string;
};

type ApiResponse = { ok?: boolean; error?: string };

interface EditEstateFormProps {
  estateId: string;
  initialData: EstateFormData;
}

export function EditEstateForm({
  estateId,
  initialData
}: EditEstateFormProps) {
  const router = useRouter();

  const [form, setForm] = useState<EstateFormData>({
    name: initialData.name ?? "",
    caseNumber: initialData.caseNumber ?? "",
    county: initialData.county ?? "",
    decedentName: initialData.decedentName ?? "",
    status: initialData.status ?? "Draft",
    decedentDateOfDeath: initialData.decedentDateOfDeath ?? "",
    notes: initialData.notes ?? ""
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleChange = useCallback(
    (field: keyof EstateFormData, value: string): void => {
      if (error) setError(null);
      if (saved) setSaved(false);
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    [error, saved]
  );

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>
  ): Promise<void> => {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setIsSubmitting(true);

    const payload: EstateFormData = {
      name: form.name ?? "",
      caseNumber: form.caseNumber ?? "",
      county: form.county ?? "",
      decedentName: form.decedentName ?? "",
      status: form.status ?? "Draft",
      decedentDateOfDeath: form.decedentDateOfDeath ?? "",
      notes: form.notes ?? ""
    };

    try {
      const response: Response = await fetch(
        `/api/estates/${encodeURIComponent(estateId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );

      const data = (await response.json().catch(() => null)) as ApiResponse | null;

      if (!response.ok || !data?.ok) {
        const apiMessage = await getApiErrorMessage(response);
        const message = data?.error || apiMessage || "Failed to update estate.";
        setError(message);
        return;
      }

      setSaved(true);

      // Go back to the estate detail page
      router.push(`/app/estates/${encodeURIComponent(estateId)}`);
      router.refresh();
    } catch {
      setError("Network error while updating the estate.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-xl border border-slate-800 bg-slate-950/60 p-4"
    >
      <div className="grid gap-4 md:grid-cols-2">
        {/* Estate name */}
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-200">
            Estate name
          </label>
          <input
            type="text"
            value={form.name ?? ""}
            onChange={(e) => handleChange("name", e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
            placeholder="Example: The John Doe Estate"
            disabled={isSubmitting}
          />
          <p className="text-[11px] text-slate-500">
            How you want to identify this estate inside LegatePro.
          </p>
        </div>

        {/* Case number */}
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-200">
            Court case number
          </label>
          <input
            type="text"
            value={form.caseNumber ?? ""}
            onChange={(e) => handleChange("caseNumber", e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
            placeholder="Court case number"
            disabled={isSubmitting}
          />
          <p className="text-[11px] text-slate-500">
            Exactly as it appears on court filings.
          </p>
        </div>

        {/* County / jurisdiction */}
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-200">
            County / jurisdiction
          </label>
          <input
            type="text"
            value={form.county ?? ""}
            onChange={(e) => handleChange("county", e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
            placeholder="Example: Wayne County, MI"
            disabled={isSubmitting}
          />
        </div>

        {/* Status */}
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-200">
            Status
          </label>
          <select
            value={form.status ?? "Draft"}
            onChange={(e) => handleChange("status", e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
            disabled={isSubmitting}
          >
            <option value="Draft">Draft</option>
            <option value="Open">Open</option>
            <option value="Closed">Closed</option>
            <option value="On hold">On hold</option>
          </select>
        </div>

        {/* Decedent name */}
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-200">
            Decedent name
          </label>
          <input
            type="text"
            value={form.decedentName ?? ""}
            onChange={(e) => handleChange("decedentName", e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
            placeholder="Name of the person whose estate this is"
            disabled={isSubmitting}
          />
        </div>

        {/* Date of death */}
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-200">
            Date of death
          </label>
          <input
            type="date"
            value={form.decedentDateOfDeath ?? ""}
            onChange={(e) => handleChange("decedentDateOfDeath", e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
            disabled={isSubmitting}
          />
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-slate-200">
          Internal notes
        </label>
        <textarea
          value={form.notes ?? ""}
          onChange={(e) => handleChange("notes", e.target.value)}
          className="min-h-[120px] w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
          placeholder="Key details, history, decisions, or anything you want to remember for this estate."
          disabled={isSubmitting}
        />
      </div>

      {/* Footer: status + messages */}
      <div className="flex flex-col gap-3 border-t border-slate-800 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center rounded-lg border border-emerald-500 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-100 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            onClick={() => router.push(`/app/estates/${encodeURIComponent(estateId)}`)}
            className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-800"
          >
            Cancel
          </button>
        </div>

        <div className="text-xs">
          {error && <p className="text-rose-400">{error}</p>}
          {saved && !error && (
            <p className="text-emerald-400">Changes saved.</p>
          )}
        </div>
      </div>
    </form>
  );
}