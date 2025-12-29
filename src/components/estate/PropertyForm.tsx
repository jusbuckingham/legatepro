"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { getApiErrorMessage } from "@/lib/utils";

type PropertyFormState = {
  name: string;
  type: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  estimatedValue: string;
  ownershipPercentage: string;
  notes: string;
};

interface PropertyFormProps {
  estateId: string;
  mode?: "create" | "edit";
  propertyId?: string;
  initialValues?: {
    name?: string;
    type?: string;
    address?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    estimatedValue?: number;
    ownershipPercentage?: number;
    notes?: string;
  };
}

export function PropertyForm({
  estateId,
  mode = "create",
  propertyId,
  initialValues
}: PropertyFormProps) {
  const router = useRouter();

  const [form, setForm] = useState<PropertyFormState>(() => ({
    name: initialValues?.name ?? "",
    type: initialValues?.type ?? "Real estate",
    address: initialValues?.address ?? "",
    city: initialValues?.city ?? "",
    state: initialValues?.state ?? "",
    postalCode: initialValues?.postalCode ?? "",
    country: initialValues?.country ?? "",
    estimatedValue:
      initialValues?.estimatedValue != null
        ? String(initialValues.estimatedValue)
        : "",
    ownershipPercentage:
      initialValues?.ownershipPercentage != null
        ? String(initialValues.ownershipPercentage)
        : "100",
    notes: initialValues?.notes ?? ""
  }));

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (field: keyof PropertyFormState, value: string): void => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>
  ): Promise<void> => {
    event.preventDefault();
    if (isSubmitting) return;

    // Basic client validation
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setError("Property name is required.");
      return;
    }

    const estimatedValueNumber = form.estimatedValue.trim()
      ? Number(form.estimatedValue)
      : undefined;

    if (estimatedValueNumber != null && Number.isNaN(estimatedValueNumber)) {
      setError("Estimated value must be a valid number.");
      return;
    }

    const ownershipNumber = form.ownershipPercentage.trim()
      ? Number(form.ownershipPercentage)
      : undefined;

    if (ownershipNumber != null && Number.isNaN(ownershipNumber)) {
      setError("Ownership percentage must be a valid number.");
      return;
    }

    if (ownershipNumber != null && (ownershipNumber < 0 || ownershipNumber > 100)) {
      setError("Ownership percentage must be between 0 and 100.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const payload = {
        name: trimmedName,
        type: form.type,
        address: form.address.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        postalCode: form.postalCode.trim(),
        country: form.country.trim(),
        estimatedValue: estimatedValueNumber,
        ownershipPercentage: ownershipNumber,
        notes: form.notes.trim()
      };

      const isEdit = mode === "edit" && propertyId;
      const endpoint = isEdit
        ? `/api/estates/${encodeURIComponent(
            estateId
          )}/properties/${encodeURIComponent(propertyId as string)}`
        : `/api/estates/${encodeURIComponent(estateId)}/properties`;
      const method = isEdit ? "PATCH" : "POST";

      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      type ApiResponse = {
        ok: boolean;
        error?: string;
        [key: string]: unknown;
      };

      const data = (await response.json().catch(() => null)) as ApiResponse | null;

      if (!response.ok || data?.ok !== true) {
        const fallback = isEdit
          ? "Failed to update property."
          : "Failed to create property.";

        // `getApiErrorMessage` may return either a string or a Promise<string> depending on implementation.
        const apiMessage = await Promise.resolve(getApiErrorMessage(response));
        setError(data?.error || apiMessage || fallback);
        return;
      }

      router.push(`/app/estates/${encodeURIComponent(estateId)}/properties`);
      router.refresh();
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Unexpected error while saving property.";
      setError(message || "Unexpected error while saving property.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isEdit = mode === "edit";

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-xl border border-slate-800 bg-slate-950/60 p-4"
    >
      <div className="grid gap-4 md:grid-cols-2">
        {/* Name */}
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-200">
            Property name
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => handleChange("name", e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
            placeholder="Example: 4395 Dickerson - main house"
          />
          <p className="text-[11px] text-slate-500">
            How you want to identify this property in the estate.
          </p>
        </div>

        {/* Type */}
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-200">
            Type
          </label>
          <select
            value={form.type}
            onChange={(e) => handleChange("type", e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
          >
            <option value="Real estate">Real estate</option>
            <option value="Land">Land</option>
            <option value="Vehicle">Vehicle</option>
            <option value="Bank account">Bank account</option>
            <option value="Investment account">Investment account</option>
            <option value="Other">Other</option>
          </select>
        </div>

        {/* Address */}
        <div className="space-y-1 md:col-span-2">
          <label className="block text-xs font-medium text-slate-200">
            Street address
          </label>
          <input
            type="text"
            value={form.address}
            onChange={(e) => handleChange("address", e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
            placeholder="Street, unit, etc."
          />
        </div>

        {/* City */}
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-200">
            City
          </label>
          <input
            type="text"
            value={form.city}
            onChange={(e) => handleChange("city", e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
          />
        </div>

        {/* State */}
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-200">
            State / region
          </label>
          <input
            type="text"
            value={form.state}
            onChange={(e) => handleChange("state", e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
          />
        </div>

        {/* Postal code */}
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-200">
            Postal code
          </label>
          <input
            type="text"
            value={form.postalCode}
            onChange={(e) => handleChange("postalCode", e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
          />
        </div>

        {/* Country */}
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-200">
            Country
          </label>
          <input
            type="text"
            value={form.country}
            onChange={(e) => handleChange("country", e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
          />
        </div>

        {/* Estimated value */}
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-200">
            Estimated value
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.estimatedValue}
            onChange={(e) => handleChange("estimatedValue", e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
            placeholder="0.00"
          />
        </div>

        {/* Ownership percentage */}
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-200">
            Ownership %
          </label>
          <input
            type="number"
            min="0"
            max="100"
            step="1"
            value={form.ownershipPercentage}
            onChange={(e) =>
              handleChange("ownershipPercentage", e.target.value)
            }
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
            placeholder="100"
          />
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-slate-200">
          Notes
        </label>
        <textarea
          value={form.notes}
          onChange={(e) => handleChange("notes", e.target.value)}
          className="min-h-[100px] w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
          placeholder="Any details you want to remember about this property."
        />
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-800 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center rounded-lg border border-emerald-500 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-60"
          >
            {isSubmitting
              ? isEdit
                ? "Saving changes…"
                : "Saving…"
              : isEdit
                ? "Save changes"
                : "Save property"}
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() =>
              router.push(
                `/app/estates/${encodeURIComponent(estateId)}/properties`
              )
            }
            className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-800 disabled:opacity-60"
          >
            Cancel
          </button>
        </div>

        {error && (
          <div
            role="alert"
            aria-live="polite"
            className="rounded-lg border border-rose-500/30 bg-rose-950/40 px-3 py-2 text-xs text-rose-100"
          >
            {error}
          </div>
        )}
      </div>
    </form>
  );
}