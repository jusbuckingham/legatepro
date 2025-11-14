"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface EditPropertyPageProps {
  params: {
    estateId: string;
    propertyId: string;
  };
}

interface PropertyForm {
  label: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  propertyType: string;
  bedrooms: number | "";
  bathrooms: number | "";
  monthlyRentTarget: number | "";
  notes: string;

  tenantName: string;
  tenantPhone: string;
  tenantEmail: string;
  tenantNotes: string;
}

export default function EditPropertyPage({ params }: EditPropertyPageProps) {
  const { estateId, propertyId } = params;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<PropertyForm>({
    label: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    propertyType: "",
    bedrooms: "",
    bathrooms: "",
    monthlyRentTarget: "",
    notes: "",

    tenantName: "",
    tenantPhone: "",
    tenantEmail: "",
    tenantNotes: "",
  });

  // Fetch existing property data
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(
          `/api/properties/${propertyId}?estateId=${estateId}`
        );
        if (!res.ok) throw new Error("Failed to load property");
        const data = await res.json();

        setForm({
          label: data.label || "",
          addressLine1: data.addressLine1 || "",
          addressLine2: data.addressLine2 || "",
          city: data.city || "",
          state: data.state || "",
          postalCode: data.postalCode || "",
          propertyType: data.propertyType || "",
          bedrooms: data.bedrooms ?? "",
          bathrooms: data.bathrooms ?? "",
          monthlyRentTarget: data.monthlyRentTarget ?? "",
          notes: data.notes || "",

          tenantName: data.tenantName || "",
          tenantPhone: data.tenantPhone || "",
          tenantEmail: data.tenantEmail || "",
          tenantNotes: data.tenantNotes || "",
        });
      } catch (e) {
        console.error("Error loading property:", e);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [estateId, propertyId]);

  function updateField<K extends keyof PropertyForm>(
    key: K,
    value: PropertyForm[K]
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/properties/${propertyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estateId, ...form }),
      });

      if (!res.ok) throw new Error("Failed to save");

      router.push(`/app/estates/${estateId}/properties/${propertyId}`);
    } catch (e) {
      console.error("Save failed:", e);
      alert("Error saving property");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <p className="text-sm text-slate-400">Loading property details...</p>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-50">
          Edit property
        </h1>
        <p className="text-sm text-slate-400">
          Update address information, rent targets, notes, and tenant details.
        </p>
      </header>

      <div className="grid gap-6 rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        {/* Property Identity */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-rose-200 uppercase tracking-wide">
            Property details
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <input
              className="rounded bg-slate-800/60 p-2 text-sm text-slate-100"
              placeholder="Label (ex: Primary House)"
              value={form.label}
              onChange={(e) => updateField("label", e.target.value)}
            />

            <input
              className="rounded bg-slate-800/60 p-2 text-sm text-slate-100"
              placeholder="Property type (Residential, Rental, etc.)"
              value={form.propertyType}
              onChange={(e) => updateField("propertyType", e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <input
              className="rounded bg-slate-800/60 p-2 text-sm text-slate-100"
              placeholder="Bedrooms"
              value={form.bedrooms}
              onChange={(e) =>
                updateField("bedrooms", Number(e.target.value) || "")
              }
            />
            <input
              className="rounded bg-slate-800/60 p-2 text-sm text-slate-100"
              placeholder="Bathrooms"
              value={form.bathrooms}
              onChange={(e) =>
                updateField("bathrooms", Number(e.target.value) || "")
              }
            />
            <input
              className="rounded bg-slate-800/60 p-2 text-sm text-slate-100"
              placeholder="Target rent (monthly)"
              value={form.monthlyRentTarget}
              onChange={(e) =>
                updateField(
                  "monthlyRentTarget",
                  Number(e.target.value) || ""
                )
              }
            />
          </div>
        </section>

        {/* Address */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-rose-200 uppercase tracking-wide">
            Address
          </h2>

          <div className="space-y-3">
            <input
              className="rounded bg-slate-800/60 p-2 text-sm text-slate-100"
              placeholder="Address line 1"
              value={form.addressLine1}
              onChange={(e) => updateField("addressLine1", e.target.value)}
            />
            <input
              className="rounded bg-slate-800/60 p-2 text-sm text-slate-100"
              placeholder="Address line 2"
              value={form.addressLine2}
              onChange={(e) => updateField("addressLine2", e.target.value)}
            />

            <div className="grid gap-4 sm:grid-cols-3">
              <input
                className="rounded bg-slate-800/60 p-2 text-sm text-slate-100"
                placeholder="City"
                value={form.city}
                onChange={(e) => updateField("city", e.target.value)}
              />
              <input
                className="rounded bg-slate-800/60 p-2 text-sm text-slate-100"
                placeholder="State"
                value={form.state}
                onChange={(e) => updateField("state", e.target.value)}
              />
              <input
                className="rounded bg-slate-800/60 p-2 text-sm text-slate-100"
                placeholder="Postal code"
                value={form.postalCode}
                onChange={(e) => updateField("postalCode", e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* Notes */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-rose-200 uppercase tracking-wide">
            Internal notes
          </h2>

          <textarea
            rows={4}
            className="w-full rounded bg-slate-800/60 p-2 text-sm text-slate-100"
            placeholder="Notes about the property, repairs, or status…"
            value={form.notes}
            onChange={(e) => updateField("notes", e.target.value)}
          />
        </section>

        {/* Tenant */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-rose-200 uppercase tracking-wide">
            Tenant & occupancy
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <input
              className="rounded bg-slate-800/60 p-2 text-sm text-slate-100"
              placeholder="Tenant name"
              value={form.tenantName}
              onChange={(e) => updateField("tenantName", e.target.value)}
            />

            <input
              className="rounded bg-slate-800/60 p-2 text-sm text-slate-100"
              placeholder="Tenant phone"
              value={form.tenantPhone}
              onChange={(e) => updateField("tenantPhone", e.target.value)}
            />
          </div>

          <input
            className="rounded bg-slate-800/60 p-2 text-sm text-slate-100"
            placeholder="Tenant email"
            value={form.tenantEmail}
            onChange={(e) => updateField("tenantEmail", e.target.value)}
          />

          <textarea
            rows={3}
            className="w-full rounded bg-slate-800/60 p-2 text-sm text-slate-100"
            placeholder="Tenant notes, payment history, issues…"
            value={form.tenantNotes}
            onChange={(e) => updateField("tenantNotes", e.target.value)}
          />
        </section>

        <button
          onClick={save}
          disabled={saving}
          className="mt-4 rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}