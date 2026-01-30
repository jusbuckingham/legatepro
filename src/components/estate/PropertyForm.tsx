"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getApiErrorMessage } from "@/lib/utils";

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

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

type FieldErrors = Partial<Record<keyof PropertyFormState, string>>;

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
  initialValues,
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
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const handleChange = (field: keyof PropertyFormState, value: string): void => {
    // Clear any prior API/validation error once the user edits the form.
    if (error) setError(null);
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleBlur = (field: keyof PropertyFormState): void => {
    // Trim common text inputs on blur so what we save matches what we show.
    // (We intentionally do not auto-trim numeric fields while typing.)
    if (field === "estimatedValue" || field === "ownershipPercentage") {
      return;
    }

    setForm((prev) => {
      const current = prev[field];
      if (typeof current !== "string") return prev;
      const trimmed = current.trim();
      if (trimmed === current) return prev;
      return { ...prev, [field]: trimmed };
    });
  };

  const trimmedName = useMemo(() => form.name.trim(), [form.name]);
  const canSubmit = !isSubmitting && trimmedName.length > 0;

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>
  ): Promise<void> => {
    event.preventDefault();
    if (isSubmitting) return;

    // Basic client validation
    const nextFieldErrors: FieldErrors = {};

    if (!trimmedName) {
      nextFieldErrors.name = "Property name is required.";
    }

    const estimatedValueNumber =
      form.estimatedValue.trim().length > 0
        ? Number.parseFloat(form.estimatedValue)
        : undefined;

    if (estimatedValueNumber != null && !Number.isFinite(estimatedValueNumber)) {
      nextFieldErrors.estimatedValue = "Estimated value must be a valid number.";
    } else if (estimatedValueNumber != null && estimatedValueNumber < 0) {
      nextFieldErrors.estimatedValue = "Estimated value cannot be negative.";
    }

    const ownershipNumber =
      form.ownershipPercentage.trim().length > 0
        ? Number.parseFloat(form.ownershipPercentage)
        : undefined;

    if (ownershipNumber != null && !Number.isFinite(ownershipNumber)) {
      nextFieldErrors.ownershipPercentage =
        "Ownership percentage must be a valid number.";
    } else if (ownershipNumber != null && (ownershipNumber < 0 || ownershipNumber > 100)) {
      nextFieldErrors.ownershipPercentage =
        "Ownership percentage must be between 0 and 100.";
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setError(null);
      return;
    }

    setFieldErrors({});
    setError(null);
    setIsSubmitting(true);

    try {
      const payload = {
        name: trimmedName,
        type: form.type.trim(),
        address: form.address.trim() || undefined,
        city: form.city.trim() || undefined,
        state: form.state.trim() || undefined,
        postalCode: form.postalCode.trim() || undefined,
        country: form.country.trim() || undefined,
        estimatedValue: estimatedValueNumber,
        ownershipPercentage: ownershipNumber,
        notes: form.notes.trim() || undefined
      };

      const isEdit = mode === "edit" && propertyId;
      const endpoint = isEdit
        ? `/api/estates/${encodeURIComponent(estateId)}/properties/${encodeURIComponent(propertyId)}`
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

        const apiMessage = await getApiErrorMessage(response);
        const message =
          (typeof data?.error === "string" ? data.error : "") ||
          apiMessage ||
          fallback;
        setError(message);
        return;
      }

      router.push(`/app/estates/${encodeURIComponent(estateId)}/properties`);
      router.refresh();
    } catch (err) {
      console.error(err);
      const message =
        err instanceof Error ? err.message : "Unexpected error while saving property.";
      setError(message || "Unexpected error while saving property.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isEdit = mode === "edit" && Boolean(propertyId);

  return (
    <form
      onSubmit={handleSubmit}
      aria-busy={isSubmitting}
      className="space-y-6 rounded-xl border border-slate-800 bg-slate-950/60 p-4"
    >
      <div className="grid gap-4 md:grid-cols-2">
        {/* Name */}
        <div className="space-y-1">
          <label htmlFor="property-name" className="block text-xs font-medium text-slate-200">
            Property name
          </label>
          <input
            id="property-name"
            name="name"
            type="text"
            value={form.name}
            disabled={isSubmitting}
            required
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? "property-name-error" : "property-name-help"}
            onChange={(e) => handleChange("name", e.target.value)}
            onBlur={() => handleBlur("name")}
            maxLength={160}
            autoFocus
            spellCheck={true}
            className={cx(
              "w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
            )}
            placeholder="Example: 4395 Dickerson - main house"
          />
          <p id="property-name-help" className="text-[11px] text-slate-500">
            How you want to identify this property in the estate.
          </p>
          {fieldErrors.name && (
            <p id="property-name-error" className="text-[11px] text-rose-400" role="alert">
              {fieldErrors.name}
            </p>
          )}
        </div>

        {/* Type */}
        <div className="space-y-1">
          <label htmlFor="property-type" className="block text-xs font-medium text-slate-200">
            Type
          </label>
          <select
            id="property-type"
            name="type"
            value={form.type}
            disabled={isSubmitting}
            onChange={(e) => handleChange("type", e.target.value)}
            onBlur={() => handleBlur("type")}
            className={cx(
              "w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
            )}
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
          <label htmlFor="street-address" className="block text-xs font-medium text-slate-200">
            Street address
          </label>
          <input
            id="street-address"
            name="address"
            autoComplete="street-address"
            type="text"
            value={form.address}
            disabled={isSubmitting}
            onChange={(e) => handleChange("address", e.target.value)}
            onBlur={() => handleBlur("address")}
            maxLength={200}
            spellCheck={true}
            className={cx(
              "w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
            )}
            placeholder="Street, unit, etc."
          />
        </div>

        {/* City */}
        <div className="space-y-1">
          <label htmlFor="address-city" className="block text-xs font-medium text-slate-200">
            City
          </label>
          <input
            id="address-city"
            name="city"
            autoComplete="address-level2"
            type="text"
            value={form.city}
            disabled={isSubmitting}
            onChange={(e) => handleChange("city", e.target.value)}
            onBlur={() => handleBlur("city")}
            maxLength={120}
            spellCheck={true}
            className={cx(
              "w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
            )}
          />
        </div>

        {/* State */}
        <div className="space-y-1">
          <label htmlFor="address-state" className="block text-xs font-medium text-slate-200">
            State / region
          </label>
          <input
            id="address-state"
            name="state"
            autoComplete="address-level1"
            type="text"
            value={form.state}
            disabled={isSubmitting}
            onChange={(e) => handleChange("state", e.target.value)}
            onBlur={() => handleBlur("state")}
            maxLength={120}
            spellCheck={true}
            className={cx(
              "w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
            )}
          />
        </div>

        {/* Postal code */}
        <div className="space-y-1">
          <label htmlFor="postal-code" className="block text-xs font-medium text-slate-200">
            Postal code
          </label>
          <input
            id="postal-code"
            name="postalCode"
            autoComplete="postal-code"
            type="text"
            value={form.postalCode}
            disabled={isSubmitting}
            onChange={(e) => handleChange("postalCode", e.target.value)}
            onBlur={() => handleBlur("postalCode")}
            maxLength={32}
            spellCheck={false}
            className={cx(
              "w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
            )}
          />
        </div>

        {/* Country */}
        <div className="space-y-1">
          <label htmlFor="country" className="block text-xs font-medium text-slate-200">
            Country
          </label>
          <input
            id="country"
            name="country"
            autoComplete="country-name"
            type="text"
            value={form.country}
            disabled={isSubmitting}
            onChange={(e) => handleChange("country", e.target.value)}
            onBlur={() => handleBlur("country")}
            maxLength={120}
            spellCheck={true}
            className={cx(
              "w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
            )}
          />
        </div>

        {/* Estimated value */}
        <div className="space-y-1">
          <label htmlFor="estimated-value" className="block text-xs font-medium text-slate-200">
            Estimated value
          </label>
          <input
            id="estimated-value"
            name="estimatedValue"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={form.estimatedValue}
            disabled={isSubmitting}
            aria-invalid={Boolean(fieldErrors.estimatedValue)}
            aria-describedby={fieldErrors.estimatedValue ? "estimated-value-error" : undefined}
            onChange={(e) => handleChange("estimatedValue", e.target.value)}
            className={cx(
              "w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
            )}
            placeholder="0.00"
          />
          {fieldErrors.estimatedValue && (
            <p id="estimated-value-error" className="text-[11px] text-rose-400" role="alert">
              {fieldErrors.estimatedValue}
            </p>
          )}
        </div>

        {/* Ownership percentage */}
        <div className="space-y-1">
          <label htmlFor="ownership-percentage" className="block text-xs font-medium text-slate-200">
            Ownership %
          </label>
          <input
            id="ownership-percentage"
            name="ownershipPercentage"
            type="number"
            inputMode="numeric"
            min="0"
            max="100"
            step="1"
            value={form.ownershipPercentage}
            disabled={isSubmitting}
            aria-invalid={Boolean(fieldErrors.ownershipPercentage)}
            aria-describedby={fieldErrors.ownershipPercentage ? "ownership-percentage-error" : undefined}
            onChange={(e) => handleChange("ownershipPercentage", e.target.value)}
            className={cx(
              "w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
            )}
            placeholder="100"
          />
          {fieldErrors.ownershipPercentage && (
            <p
              id="ownership-percentage-error"
              className="text-[11px] text-rose-400"
              role="alert"
            >
              {fieldErrors.ownershipPercentage}
            </p>
          )}
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-1">
        <label htmlFor="property-notes" className="block text-xs font-medium text-slate-200">
          Notes
        </label>
        <textarea
          id="property-notes"
          name="notes"
          value={form.notes}
          disabled={isSubmitting}
          onChange={(e) => handleChange("notes", e.target.value)}
          onBlur={() => handleBlur("notes")}
          maxLength={4000}
          className={cx(
            "min-h-[100px] w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
          )}
          placeholder="Any details you want to remember about this property."
        />
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-800 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!canSubmit}
            aria-disabled={!canSubmit}
            title={!canSubmit ? "Add a property name to save." : undefined}
            className={cx(
              "inline-flex items-center rounded-lg border border-emerald-500 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-100",
              "hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
            )}
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
            aria-disabled={isSubmitting}
            title={isSubmitting ? "Please wait…" : undefined}
            onClick={() =>
              router.push(`/app/estates/${encodeURIComponent(estateId)}/properties`)
            }
            className={cx(
              "inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-100",
              "hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200/20 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
            )}
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
            <span className="font-semibold">Couldn’t save.</span> {error}
          </div>
        )}
      </div>
    </form>
  );
}